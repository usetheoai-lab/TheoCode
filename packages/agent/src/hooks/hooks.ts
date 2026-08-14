import { createHash, randomBytes } from 'node:crypto'

import { z } from 'zod'

import { hookFingerprint } from './hook-trust.js'
import { HOOK_EVENTS, type HookEvent, type HookSpec } from './hooks-spec.js'
import type { HookHandlers } from '@theokit/agents'
import { HookError } from './hook-error.js'
import { ContinuationBudget } from './continuation-budget.js'
import { note } from './note.js'
import { runHookCommand, type HookRun } from './hook-runner.js'

const EVENTS = HOOK_EVENTS

const DEFAULT_TIMEOUT_MS = 5_000

const MAX_HOOK_CHAIN_MS = 4 * DEFAULT_TIMEOUT_MS

const SPAWN_FLOOR_MS = 50

export type BudgetDecision =
  | { readonly kind: 'run'; readonly effectiveTimeout: number }
  | { readonly kind: 'exceeded'; readonly remaining: number }

function decideBudget(remaining: number, hookTimeout: number): BudgetDecision {
  if (remaining < SPAWN_FLOOR_MS) return { kind: 'exceeded', remaining }
  return { kind: 'run', effectiveTimeout: Math.min(hookTimeout, remaining) }
}

const hookSchema = z
  .object({
    event: z.string(),
    command: z.string().min(1),
    matcher: z.string().optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .strict()

function validateShape(entry: unknown, i: number): z.infer<typeof hookSchema> {
  try {
    return hookSchema.parse(entry)
  } catch (err) {
    const issue = err instanceof z.ZodError ? err.issues[0] : undefined
    const where = issue?.path.length ? issue.path.join('.') : 'entry'
    throw new HookError(`hooks[${String(i)}]: ${issue?.message ?? String(err)} [${where}]`)
  }
}

function requireKnownEvent(event: string, i: number): void {
  if ((EVENTS as readonly string[]).includes(event)) return
  throw new HookError(
    `hooks[${String(i)}]: unknown event "${event}" — expected one of ${EVENTS.join(', ')}`,
  )
}

function requireCompilableMatcher(matcher: string | undefined, i: number): void {
  if (matcher === undefined) return
  try {
    new RegExp(matcher)
  } catch {
    throw new HookError(`hooks[${String(i)}]: matcher is not a valid regex: "${matcher}"`)
  }
}

function umHook(entry: unknown, i: number): HookSpec {
  const parsed = validateShape(entry, i)
  requireKnownEvent(parsed.event, i)
  requireCompilableMatcher(parsed.matcher, i)
  return {
    event: parsed.event as HookEvent,
    command: parsed.command,
    ...(parsed.matcher !== undefined ? { matcher: parsed.matcher } : {}),
    timeout_ms: parsed.timeout_ms ?? DEFAULT_TIMEOUT_MS,
  }
}

export function parseHooks(raw: unknown): HookSpec[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new HookError('hooks: expected an array of hook entries')

  return raw.map((entry, i) => umHook(entry, i))
}

interface HookFeedback {
  additionalContext?: string
  feedback?: string
  block?: boolean
}

const MAX_FEEDBACK_CHARS = 10_000

const MAX_FEEDBACK_TOTAL_CHARS = 40_000

function hookLabel(spec: HookSpec): string {
  return createHash('sha256')
    .update(`${spec.event}\u0000${spec.command}`)
    .digest('hex')
    .slice(0, 12)
}

function capped(text: string): string {
  return text.length <= MAX_FEEDBACK_CHARS
    ? text
    : `${text.slice(0, MAX_FEEDBACK_CHARS)}\n[truncated at ${MAX_FEEDBACK_CHARS} characters]`
}

function fencedContext(spec: HookSpec, obj: Record<string, unknown>): string | undefined {
  const extra = (obj.hookSpecificOutput as Record<string, unknown> | undefined)?.additionalContext
  if (typeof extra !== 'string' || extra.length === 0) return undefined
  const nonce = randomBytes(6).toString('hex')
  const body = capped(extra)
    .split(`</hook_output`)
    .join('</hook_output\u200b')
    .split(nonce)
    .join('')
  return `<hook_output id="${nonce}" hook="${hookLabel(spec)}">\n${body}\n</hook_output id="${nonce}">`
}

function jsonEnvelope(spec: HookSpec, text: string): Record<string, unknown> | undefined {
  if (text.length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    note(`${spec.command}: stdout is not valid JSON and was ignored — ${text.slice(0, 60)}`)
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  return parsed as Record<string, unknown>
}

function parseFeedback(spec: HookSpec, run: HookRun): HookFeedback | undefined {
  const text = run.output.trim()
  if (!run.ok && !run.timedOut && text.length > 0 && !text.startsWith('{')) {
    return { block: true, feedback: capped(text) }
  }
  const obj = jsonEnvelope(spec, text)
  if (obj === undefined) return undefined
  const out: HookFeedback = {}
  const fenced = fencedContext(spec, obj)
  if (fenced !== undefined) out.additionalContext = fenced
  if (obj.decision === 'block') {
    out.block = true
    if (typeof obj.reason === 'string') out.feedback = capped(obj.reason)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * B-021 — a matcher is a TOOL-NAME scope, so a context with no tool name is outside it.
 *
 * `toolName === ''` is reached deliberately: `targetOf` passes it for a PostToolUse result that is a
 * plain string rather than an array of tool parts, and there is no name to match. The branch used to
 * return true for EVERY spec, so a hook declared as `matcher: "^run_shell$"` ran its command in a
 * context its author never scoped it to, with an empty tool name.
 *
 * A hook that declared NO matcher still applies — that is the first line, and the fix must not reach
 * it. Deleting the branch is the whole change.
 */
function appliesTo(spec: HookSpec, toolName: string): boolean {
  if (spec.matcher === undefined) return true
  return new RegExp(`^(?:${spec.matcher})$`).test(toolName)
}

interface ToolContext {
  name?: string
  args?: Record<string, unknown>
  result?: unknown
}

interface ToolResultTurnContext {
  toolCalls?: ReadonlyArray<{ id: string; name: string; args?: Record<string, unknown> }>
}

interface Target {
  index: number
  name: string
  /** B-044 — the tool call's own arguments, so a PostToolUse hook receives what actually ran. */
  args: Record<string, unknown>
}

class Batch {
  #appended = 0

  private constructor(
    private readonly parts: Array<{ toolUseId?: string; content?: unknown }> | undefined,
    private readonly nameById: ReadonlyMap<string, string>,
    private readonly argsById: ReadonlyMap<string, Record<string, unknown>>,
    private text: string | undefined,
  ) {}

  static de(
    results: unknown,
    nameById: ReadonlyMap<string, string>,
    argsById: ReadonlyMap<string, Record<string, unknown>> = new Map(),
  ): Batch {
    return Array.isArray(results)
      ? new Batch(
          [...(results as Array<{ toolUseId?: string; content?: unknown }>)],
          nameById,
          argsById,
          undefined,
        )
      : new Batch(
          undefined,
          nameById,
          argsById,
          typeof results === 'string' ? results : undefined,
        )
  }

  targetOf(spec: HookSpec): Target | undefined {
    if (this.parts === undefined) {
      return this.text !== undefined && appliesTo(spec, '')
        ? { index: -1, name: '', args: {} }
        : undefined
    }
    let chosen: Target | undefined
    for (const [i, part] of this.parts.entries()) {
      const id = part.toolUseId ?? ''
      const name = this.nameById.get(id) ?? ''
      if (!appliesTo(spec, name)) continue
      if (typeof part.content === 'string') {
        chosen = { index: i, name, args: this.argsById.get(id) ?? {} }
      }
    }
    return chosen
  }

  exceedsBudget(snippet: string): boolean {
    return this.#appended + snippet.length > MAX_FEEDBACK_TOTAL_CHARS
  }

  truncate(snippet: string): string {
    const charsLeft = Math.max(0, MAX_FEEDBACK_TOTAL_CHARS - this.#appended)
    return `${snippet.slice(0, charsLeft)}\n[hook feedback truncated at ${MAX_FEEDBACK_TOTAL_CHARS} characters in aggregate]`
  }

  append(target: Target, snippet: string): void {
    this.#appended += snippet.length
    if (this.parts === undefined) {
      this.text = `${this.text ?? ''}${snippet}`
      return
    }
    const part = this.parts[target.index]
    if (part === undefined || typeof part.content !== 'string') {
      note('hook feedback dropped: no tool result carried string content to attach it to')
      return
    }
    this.parts[target.index] = { ...part, content: `${part.content}${snippet}` }
  }

  result(): unknown {
    return this.parts ?? this.text
  }
}

export { runHookCommand, type HookRun } from './hook-runner.js'

export { HookError } from './hook-error.js'
export { ContinuationBudget, MAX_HOOK_CONTINUATIONS } from './continuation-budget.js'

export type { HookHandlers }

function chainBudgetBlock(name: string, spec: HookSpec): { block: true; message: string } {
  const tool = name.length > 0 ? `'${name}'` : 'this tool'
  note(
    `BLOCKED ${name}: hook chain budget (${String(MAX_HOOK_CHAIN_MS)}ms) exhausted at ${spec.command}`,
  )
  return {
    block: true,
    message:
      `Tool ${tool} was denied: the project's PreToolUse hook chain exceeded its total budget of ` +
      `${String(MAX_HOOK_CHAIN_MS)}ms while running '${spec.command}'. This is a deterministic ` +
      `block that will not change on retry — do not call the tool again this turn; continue ` +
      `without it.`,
  }
}

function policyBlock(
  name: string,
  spec: HookSpec,
  run: HookRun,
): { block: true; message: string } {
  const reason = run.output || `blocked by hook: ${spec.command}`
  const tool = name.length > 0 ? `'${name}'` : 'this tool'
  note(`BLOCKED ${name}: ${reason}`)
  return {
    block: true,
    message:
      `Tool ${tool} was denied by a project policy hook. This is a deterministic block that will ` +
      `not change on retry — do not call ${tool} again this turn; continue without it. ` +
      `Reason: ${reason}`,
  }
}

async function preToolUseVeto(
  pre: readonly HookSpec[],
  ctx: { name?: string; args?: Record<string, unknown> },
  onVeto?: (veto: { tool: string; reason: string }) => void,
) {
  const announce = <T extends { message: string }>(block: T, tool: string): T => {
    onVeto?.({ tool, reason: block.message })
    return block
  }
  const name = ctx.name ?? ''
  const deadline = Date.now() + MAX_HOOK_CHAIN_MS
  for (const spec of pre) {
    if (!appliesTo(spec, name)) continue
    const decision = decideBudget(deadline - Date.now(), spec.timeout_ms)
    if (decision.kind === 'exceeded') {
      return announce(chainBudgetBlock(name, spec), name)
    }
    const run = await runHookCommand(
      { ...spec, timeout_ms: decision.effectiveTimeout },
      { name, args: ctx.args ?? {} },
    )
    if (!run.ok) {
      if (run.timedOut && decision.effectiveTimeout < spec.timeout_ms) {
        return announce(chainBudgetBlock(name, spec), name)
      }
      return announce(policyBlock(name, spec, run), name)
    }
  }
  return undefined
}

async function appendOneHookFeedback(
  spec: HookSpec,
  target: NonNullable<ReturnType<Batch['targetOf']>>,
  results: unknown,
  batch: Batch,
  budget: ContinuationBudget,
): Promise<boolean> {
  const run = await runHookCommand(spec, {
    event: 'PostToolUse',
    name: target.name,
    // B-044 — the tool's real arguments. This was a hardcoded `{}`, so a PostToolUse hook could see
    // WHICH tool ran and its result but never what it was called with. The args were available all
    // along: `ToolCallSummary` carries them and `transformResult` was already reading the same
    // array to build its name map.
    args: target.args,
    result: results,
  })
  const fb = parseFeedback(spec, run)
  if (fb === undefined) {
    // B-008 — a hook that crashed or emitted unparseable output carries NO decision, so there is no
    // `block` here to preserve: the review read this as losing one. Failing open is the deliberate
    // choice, and it is the safe direction for this event specifically — PostToolUse runs AFTER the
    // tool has already acted, so blocking on it cannot undo anything; a broken hook would only
    // wedge the turn. PreToolUse, where blocking still prevents something, is gated separately.
    if (!run.ok) note(`PostToolUse hook failed (ignored): ${spec.command} — ${run.output}`)
    return false
  }
  if (fb.block === true && !budget.request(spec.command)) return false
  let snippet = ''
  if (fb.additionalContext !== undefined) snippet += `\n${fb.additionalContext}`
  if (fb.feedback !== undefined) snippet += `\n${fb.feedback}`
  if (snippet.length === 0) return false
  if (batch.exceedsBudget(snippet)) {
    batch.append(target, batch.truncate(snippet))
    note(
      `aggregate hook feedback exceeded ${String(MAX_FEEDBACK_TOTAL_CHARS)} characters; later hooks were dropped`,
    )
    return true
  }
  batch.append(target, snippet)
  return false
}

/**
 * B-044 — the payload for the OBSERVATIONAL events (`Stop`, `SessionStart`), which carry no tool.
 *
 * This used to branch on `PostToolUse` and build a `{name, args, result}` payload for it. That
 * branch was unreachable: PostToolUse hooks run through `transform_tool_result`, never through
 * `fireObservational`, which is this function's only caller. Meanwhile the reachable
 * PostToolUse path passed a hardcoded `args: {}` — so the code that would have supplied the
 * arguments was dead, and the code that ran did not have them.
 */
function eventPayload(event: HookEvent): Record<string, unknown> {
  return { event }
}

async function fireObservational(
  event: HookEvent,
  list: readonly HookSpec[],
  ctx: unknown,
): Promise<void> {
  const tool = (ctx ?? {}) as ToolContext
  for (const spec of list) {
    if (event === 'PostToolUse' && !appliesTo(spec, tool.name ?? '')) continue
    const payload = eventPayload(event)
    try {
      const run = await runHookCommand(spec, payload)
      if (!run.ok) note(`${event} hook failed (ignored): ${spec.command} — ${run.output}`)
    } catch (err) {
      note(`${event} hook errored (ignored): ${spec.command} — ${String(err)}`)
    }
  }
}

async function transformResult<T>(
  allPost: readonly HookSpec[],
  results: T,
  ctx: ToolResultTurnContext,
): Promise<T> {
  const budget = new ContinuationBudget()
  const turn = (ctx ?? {}) as ToolResultTurnContext
  const nameById = new Map((turn.toolCalls ?? []).map((c) => [c.id, c.name]))
  const argsById = new Map((turn.toolCalls ?? []).map((c) => [c.id, c.args ?? {}]))
  const batch = Batch.de(results, nameById, argsById)

  for (const spec of allPost) {
    const target = batch.targetOf(spec)
    if (target === undefined) continue
    try {
      if (await appendOneHookFeedback(spec, target, results, batch, budget)) break
    } catch (err) {
      note(`PostToolUse hook errored (ignored): ${spec.command} — ${String(err)}`)
    }
  }
  return batch.result() as T
}
