import { foldTurnLifecycle, type TurnLifecycle } from '@theokit/presenter'

type TurnFold = TurnLifecycle<unknown>

export interface ExecIo {
  out: (line: string) => void
  err: (line: string) => void
}

export interface ProcessorResult {
  finalText: string
  errorSeen: boolean
  usage: Record<string, number>
}

interface ChunkLike {
  type: string
  id?: string
  delta?: string
  text?: string
  toolName?: string
  input?: unknown
  output?: unknown
  errorText?: string
  messageMetadata?: { usage?: Record<string, number> }
}

const USAGE_ALIASES: readonly (readonly [output: string, camel: string, snake: string])[] = [
  ['input_tokens', 'inputTokens', 'input_tokens'],
  ['cached_input_tokens', 'cacheReadTokens', 'cached_input_tokens'],
  ['cache_write_input_tokens', 'cacheWriteTokens', 'cache_write_input_tokens'],
  ['output_tokens', 'outputTokens', 'output_tokens'],
  ['reasoning_output_tokens', 'reasoningTokens', 'reasoning_output_tokens'],
]

function toCodexUsage(u: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(
    USAGE_ALIASES.map(([output, camel, snake]) => [output, u?.[camel] ?? u?.[snake] ?? 0]),
  )
}

/**
 * What the turn actually COST, with the cached prefix taken out.
 *
 * `input_tokens` includes the cached prefix the provider re-read for free, so adding it to
 * `output_tokens` reports a number the user is not paying. Measured 2026-08-25 on a three-round
 * turn: the provider reported `cached_tokens: 4608` on every round, and this line reported 19,511
 * where 5,687 were new.
 *
 * The formula is Codex's, deliberately, because that is what makes the two comparable —
 * `codex-rs/protocol/src/protocol.rs`:
 *
 *     pub fn non_cached_input(&self) -> i64 { (self.input_tokens - self.cached_input()).max(0) }
 *     // blended total = non_cached_input() + output_tokens.max(0)
 *
 * Until this matched, every cost comparison between the two agents was measuring a gross figure
 * against a net one and reading the difference as a defect in this product.
 *
 * `Math.max(0, …)` on the subtraction, as Codex has it: a provider that reports more cached tokens
 * than input tokens is describing something this arithmetic cannot represent, and a negative token
 * count is worse than a clamped one.
 */
function blendedTotal(u: Record<string, number>): number {
  const nonCachedInput = Math.max(0, (u.input_tokens ?? 0) - (u.cached_input_tokens ?? 0))
  return nonCachedInput + Math.max(0, u.output_tokens ?? 0)
}

import { toolLine } from './tool-line.js'

export interface ExecProcessor {
  process(chunk: ChunkLike): void
  finish(
    status: 'finished' | 'error',
    extra?: { usage?: Record<string, number>; error?: string },
  ): ProcessorResult
}

/**
 * The assistant's FINAL message, kept apart from the preambles that precede its tool calls.
 *
 * A turn emits text more than once. The instructions ask for a preamble before a burst of tool
 * calls ("Next, I'll patch the config and update the related tests.") and for a closing recap after
 * the last one — all of it arrives as `text-delta`, with nothing in the stream marking where one
 * message ends and the next begins.
 *
 * Concatenating them was wrong twice over, and `--help` states the contract it broke: "Stdout
 * carries ONLY the final message". Measured 2026-08-25 on a two-step task, stdout read:
 *
 *     I'll read `duration.mjs` and report its contents briefly.`duration.mjs:2` defines …
 *
 * — the preamble and the answer with no separator between them, because nothing was ever meant to
 * join them. `-o/--output-last-message` wrote the same run-on string to a file a script then reads.
 * Codex, on the same task, prints the closing message alone.
 *
 * The boundary is the tool call: text buffered when one STARTS was a preamble by definition, since
 * the answer cannot precede the tool that establishes it (the instructions say so in as many
 * words). Whatever is left when the turn ends is the answer. A turn with no tool call has one
 * message and it is the answer, which falls out of the same rule rather than needing a branch.
 */
function finalMessage(): {
  delta: (d: string) => void
  /** Close the current message: returns it if it said anything, and starts the next. */
  cut: () => string | undefined
  done: () => string
} {
  let buffer = ''
  return {
    delta: (d) => {
      buffer += d
    },
    cut: () => {
      const said = buffer.trim()
      buffer = ''
      return said.length > 0 ? said : undefined
    },
    done: () => buffer.trim(),
  }
}

export function createHumanProcessor(io: ExecIo, sessionId: string): ExecProcessor {
  const message = finalMessage()
  let errorSeen = false
  let usage: Record<string, number> | undefined
  return {
    process(chunk) {
      switch (chunk.type) {
        case 'finish':
          usage = chunk.messageMetadata?.usage
          break
        case 'text-delta':
          message.delta(chunk.delta ?? '')
          break
        case 'tool-input-available': {
          // The preamble goes out BEFORE the call it announces, which is the order it was written
          // to be read in — and to stderr, where the rest of the progress already goes.
          const preamble = message.cut()
          if (preamble !== undefined) io.err(preamble)
          io.err(toolLine(chunk))
          break
        }
        case 'tool-output-available':
          io.err(`  done`)
          break
        case 'error':
          errorSeen = true
          io.err(`ERROR: ${chunk.errorText ?? 'unknown'}`)
          break
        default:
          break
      }
    },
    finish(status, extra) {
      if (status === 'error') {
        errorSeen = true
        if (extra?.error !== undefined) io.err(`ERROR: ${extra.error}`)
      }
      const finalText = message.done()
      if (finalText.length > 0) io.out(finalText)
      const u = toCodexUsage(extra?.usage ?? usage)
      io.err(
        `[exec] session=${sessionId} status=${errorSeen ? 'error' : status} tokens=${blendedTotal(u)}`,
      )
      return { finalText, errorSeen, usage: u }
    },
  }
}

function commandEvent(
  kind: 'item.started' | 'item.completed',
  id: string,
  toolName: string | undefined,
  status: 'in_progress' | 'completed',
): unknown {
  return {
    type: kind,
    item: { id, type: 'command_execution', command: toolName ?? 'tool', status },
  }
}

/**
 * The Codex JSONL dialect, as a projection of the framework's lifecycle fold.
 *
 * B-123 — `foldTurnLifecycle` carries the invariant this used to hold by hand: a turn opens exactly
 * once and closes exactly once, never both completed and failed, never left open. Here the error
 * path and the finish path each closed the turn, and only an `errorSeen` flag threaded through both
 * kept them from doing it twice — right until someone edited one path.
 *
 * What stays is this product's VOCABULARY, which is the whole reason the framework does not ship it:
 * `thread.started`, the item shapes, the Codex usage block. ADR 0007 records why.
 */
/**
 * Translate one SDK chunk into the fold's vocabulary, or `null` when it carries no lifecycle.
 *
 * Its own function because it answers a different question from the processor: this is where the
 * SDK's words become the fold's, and the processor is where the fold's become Codex's. Keeping the
 * two apart is also what kept `process` under the complexity gate once the fold arrived.
 */
function toContentChunk(chunk: ChunkLike): Parameters<TurnFold['observe']>[0] | null {
  // `id` spread conditionally in one place rather than at each call: the optional-property spread
  // counts as a branch, and repeating it three times is what put this over the complexity gate.
  const withId = (name: string) => ({
    ...(chunk.id !== undefined ? { id: chunk.id } : {}),
    name,
  })

  switch (chunk.type) {
    case 'text-delta':
      return { kind: 'text', delta: chunk.delta ?? '' }
    case 'tool-input-available':
      return { kind: 'tool-call', ...withId(chunk.toolName ?? 'tool') }
    case 'tool-output-available':
      return { kind: 'tool-result', ...withId(chunk.toolName ?? 'tool') }
    case 'error':
      return { kind: 'error', message: chunk.errorText ?? 'unknown' }
    default:
      return null
  }
}

/** The Codex dialect, as constructors the fold calls. This product's words, and only its words. */
function codexDialect(): Parameters<typeof foldTurnLifecycle<unknown>>[0] {
  return {
    threadStarted: (id) => ({ type: 'thread.started', thread_id: id }),
    turnStarted: () => ({ type: 'turn.started' }),
    itemStarted: (item) => commandEvent('item.started', item.id, item.kind, 'in_progress'),
    itemCompleted: (item) =>
      item.id === 'message'
        ? {
            type: 'item.completed',
            item: { id: 'item_msg', type: 'agent_message', text: item.kind },
          }
        : commandEvent('item.completed', item.id, item.kind, 'completed'),
    turnCompleted: (u) => ({
      type: 'turn.completed',
      usage: toCodexUsage(u as Record<string, number> | undefined),
    }),
    turnFailed: (error) => ({ type: 'turn.failed', error }),
  }
}

/**
 * The Codex JSONL dialect, as a projection of the framework's lifecycle fold.
 *
 * B-123 — `foldTurnLifecycle` carries the invariant this used to hold by hand: a turn opens exactly
 * once and closes exactly once, never both completed and failed, never left open. Here the error
 * path and the finish path each closed the turn, and only an `errorSeen` flag threaded through both
 * kept them from doing it twice — right until someone edited one path.
 *
 * What stays is this product's VOCABULARY, which is why the framework does not ship it: the event
 * names, the item shapes, the Codex usage block. ADR 0007 records the reasoning.
 */
export function createJsonlProcessor(io: ExecIo, threadId: string): ExecProcessor {
  const emit = (obj: unknown): void => {
    try {
      io.out(JSON.stringify(obj))
    } catch {
      io.out(JSON.stringify({ type: 'error', message: 'serialization failure' }))
    }
  }

  let usage: Record<string, number> | undefined
  // The same rule as the human processor. The JSONL events themselves already arrive separated by
  // `turn.observe`; it is `finalText` — what `-o/--output-last-message` writes — that ran them
  // together, so a script reading that file got the preambles glued to the answer.
  const message = finalMessage()
  let errorSeen = false

  const turn = foldTurnLifecycle<unknown>(codexDialect(), threadId)
  for (const event of turn.opened) emit(event)

  return {
    process(chunk) {
      if (chunk.type === 'finish') {
        usage = chunk.messageMetadata?.usage
        return
      }
      if (chunk.type === 'text-delta') message.delta(chunk.delta ?? '')
      if (chunk.type === 'tool-input-available') message.cut()
      if (chunk.type === 'error') errorSeen = true

      const mapped = toContentChunk(chunk)
      if (mapped === null) return
      for (const event of turn.observe(mapped)) emit(event)
    },
    finish(status, extra) {
      const raw = extra?.usage ?? usage
      const failed = status === 'error' || errorSeen
      const outcome = failed
        ? { status: 'error' as const, error: extra?.error ?? 'turn failed', usage: raw }
        : { status: 'ok' as const, usage: raw }

      for (const event of turn.finish(outcome)) emit(event)
      return { finalText: message.done(), errorSeen: failed, usage: toCodexUsage(raw) }
    },
  }
}

export function silentEmptyTurnDiagnostic(
  result: ProcessorResult,
  status: 'finished' | 'error',
): string | undefined {
  if (status !== 'finished' || result.errorSeen) return undefined
  if (result.finalText.trim().length > 0) return undefined
  if ((result.usage.input_tokens ?? 0) > 0 || (result.usage.output_tokens ?? 0) > 0)
    return undefined
  return (
    '[exec] the model was never called (input_tokens=0) and the turn produced no output — likely a ' +
    'credential/provider resolution failure. For an OAuth Codex route (openai-chatgpt), verify ' +
    'THEOKIT_AUTH_HOME points at the credential store and re-run `/login`.'
  )
}
