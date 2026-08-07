
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

const APELIDOS_DE_USAGE: readonly (readonly [output: string, camel: string, snake: string])[] = [
  ['input_tokens', 'inputTokens', 'input_tokens'],
  ['cached_input_tokens', 'cacheReadTokens', 'cached_input_tokens'],
  ['cache_write_input_tokens', 'cacheWriteTokens', 'cache_write_input_tokens'],
  ['output_tokens', 'outputTokens', 'output_tokens'],
  ['reasoning_output_tokens', 'reasoningTokens', 'reasoning_output_tokens'],
]

function toCodexUsage(u: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(
    APELIDOS_DE_USAGE.map(([output, camel, snake]) => [output, u?.[camel] ?? u?.[snake] ?? 0]),
  )
}

export interface ExecProcessor {
  process(chunk: ChunkLike): void
  finish(
    status: 'finished' | 'error',
    extra?: { usage?: Record<string, number>; error?: string },
  ): ProcessorResult
}

function toolLine(chunk: ChunkLike): string {
  const name = chunk.toolName ?? 'tool'
  const input = JSON.stringify(chunk.input ?? {}).slice(0, 200)
  return `exec ${name} ${input}`
}

export function createHumanProcessor(io: ExecIo, sessionId: string): ExecProcessor {
  let text = ''
  let errorSeen = false
  let usage: Record<string, number> | undefined
  return {
    process(chunk) {
      switch (chunk.type) {
        case 'finish':
          usage = chunk.messageMetadata?.usage
          break
        case 'text-delta':
          text += chunk.delta ?? ''
          break
        case 'tool-input-available':
          io.err(toolLine(chunk))
          break
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
      const finalText = text.trim()
      if (finalText.length > 0) io.out(finalText)
      const u = toCodexUsage(extra?.usage ?? usage)
      io.err(
        `[exec] session=${sessionId} status=${errorSeen ? 'error' : status} tokens=${u.input_tokens + u.output_tokens}`,
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

export function createJsonlProcessor(io: ExecIo, threadId: string): ExecProcessor {
  let text = ''
  let errorSeen = false
  let itemN = 0
  let usage: Record<string, number> | undefined
  const itemIdFor = (chunk: ChunkLike): string => chunk.id ?? `item_${itemN}`
  const emit = (obj: unknown): void => {
    try {
      io.out(JSON.stringify(obj))
    } catch {
      io.out(JSON.stringify({ type: 'error', message: 'serialization failure' }))
    }
  }
  emit({ type: 'thread.started', thread_id: threadId })
  emit({ type: 'turn.started' })
  return {
    process(chunk) {
      switch (chunk.type) {
        case 'finish':
          usage = chunk.messageMetadata?.usage
          break
        case 'text-delta':
          text += chunk.delta ?? ''
          break
        case 'tool-input-available':
          emit(commandEvent('item.started', itemIdFor(chunk), chunk.toolName, 'in_progress'))
          break
        case 'tool-output-available':
          emit(commandEvent('item.completed', itemIdFor(chunk), chunk.toolName, 'completed'))
          break
        case 'error':
          errorSeen = true
          emit({
            type: 'item.completed',
            item: { id: `item_${itemN++}`, type: 'error', message: chunk.errorText ?? 'unknown' },
          })
          break
        default:
          break
      }
    },
    finish(status, extra) {
      const finalText = text.trim()
      if (finalText.length > 0) {
        emit({
          type: 'item.completed',
          item: { id: `item_${itemN++}`, type: 'agent_message', text: finalText },
        })
      }
      if (status === 'error' || errorSeen) {
        errorSeen = true
        emit({ type: 'turn.failed', error: { message: extra?.error ?? 'turn failed' } })
      } else {
        emit({ type: 'turn.completed', usage: toCodexUsage(extra?.usage ?? usage) })
      }
      return { finalText, errorSeen, usage: toCodexUsage(extra?.usage ?? usage) }
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
