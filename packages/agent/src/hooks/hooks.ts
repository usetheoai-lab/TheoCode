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

const PISO_DE_SPAWN_MS = 50

export type BudgetDecision =
  | { readonly kind: 'executa'; readonly effectiveTimeout: number }
  | { readonly kind: 'estourou'; readonly restante: number }

export function decideBudget(restante: number, timeoutDoHook: number): BudgetDecision {
  if (restante < PISO_DE_SPAWN_MS) return { kind: 'estourou', restante }
  return { kind: 'executa', effectiveTimeout: Math.min(timeoutDoHook, restante) }
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

function exigirEventoConhecido(event: string, i: number): void {
  if ((EVENTS as readonly string[]).includes(event)) return
  throw new HookError(
    `hooks[${String(i)}]: unknown event "${event}" — expected one of ${EVENTS.join(', ')}`,
  )
}

function exigirMatcherCompilavel(matcher: string | undefined, i: number): void {
  if (matcher === undefined) return
  try {
    new RegExp(matcher)
  } catch {
    throw new HookError(`hooks[${String(i)}]: matcher is not a valid regex: "${matcher}"`)
  }
}

function umHook(entry: unknown, i: number): HookSpec {
  const parsed = validateShape(entry, i)
  exigirEventoConhecido(parsed.event, i)
  exigirMatcherCompilavel(parsed.matcher, i)
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

function contextoCercado(spec: HookSpec, obj: Record<string, unknown>): string | undefined {
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

function envelopeJson(spec: HookSpec, text: string): Record<string, unknown> | undefined {
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
  const obj = envelopeJson(spec, text)
  if (obj === undefined) return undefined
  const out: HookFeedback = {}
  const cercado = contextoCercado(spec, obj)
  if (cercado !== undefined) out.additionalContext = cercado
  if (obj.decision === 'block') {
    out.block = true
    if (typeof obj.reason === 'string') out.feedback = capped(obj.reason)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function appliesTo(spec: HookSpec, toolName: string): boolean {
  if (spec.matcher === undefined) return true
  if (toolName === '') return true
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
  indice: number
  name: string
}

class Lote {
  #anexado = 0

  private constructor(
    private readonly partes: Array<{ toolUseId?: string; content?: unknown }> | undefined,
    private readonly nameById: ReadonlyMap<string, string>,
    private text: string | undefined,
  ) {}

  static de(results: unknown, nameById: ReadonlyMap<string, string>): Lote {
    return Array.isArray(results)
      ? new Lote(
          [...(results as Array<{ toolUseId?: string; content?: unknown }>)],
          nameById,
          undefined,
        )
      : new Lote(undefined, nameById, typeof results === 'string' ? results : undefined)
  }

  targetOf(spec: HookSpec): Target | undefined {
    if (this.partes === undefined) {
      return this.text !== undefined && appliesTo(spec, '') ? { indice: -1, name: '' } : undefined
    }
    let escolhido: Target | undefined
    for (const [i, parte] of this.partes.entries()) {
      const name = this.nameById.get(parte.toolUseId ?? '') ?? ''
      if (!appliesTo(spec, name)) continue
      if (typeof parte.content === 'string') escolhido = { indice: i, name }
    }
    return escolhido
  }

  exceedsBudget(trecho: string): boolean {
    return this.#anexado + trecho.length > MAX_FEEDBACK_TOTAL_CHARS
  }

  truncar(trecho: string): string {
    const resta = Math.max(0, MAX_FEEDBACK_TOTAL_CHARS - this.#anexado)
    return `${trecho.slice(0, resta)}\n[hook feedback truncated at ${MAX_FEEDBACK_TOTAL_CHARS} characters in aggregate]`
  }

  anexar(target: Target, trecho: string): void {
    this.#anexado += trecho.length
    if (this.partes === undefined) {
      this.text = `${this.text ?? ''}${trecho}`
      return
    }
    const parte = this.partes[target.indice]
    if (parte === undefined || typeof parte.content !== 'string') {
      note('hook feedback dropped: no tool result carried string content to attach it to')
      return
    }
    this.partes[target.indice] = { ...parte, content: `${parte.content}${trecho}` }
  }

  resultado(): unknown {
    return this.partes ?? this.text
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

function bloqueioPorPolitica(
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

async function vetoDePreToolUse(
  pre: readonly HookSpec[],
  ctx: { name?: string; args?: Record<string, unknown> },
) {
  const name = ctx.name ?? ''
  const prazo = Date.now() + MAX_HOOK_CHAIN_MS
  for (const spec of pre) {
    if (!appliesTo(spec, name)) continue
    const decisao = decideBudget(prazo - Date.now(), spec.timeout_ms)
    if (decisao.kind === 'estourou') {
      return chainBudgetBlock(name, spec)
    }
    const run = await runHookCommand(
      { ...spec, timeout_ms: decisao.effectiveTimeout },
      { name, args: ctx.args ?? {} },
    )
    if (!run.ok) {
      if (run.timedOut && decisao.effectiveTimeout < spec.timeout_ms) {
        return chainBudgetBlock(name, spec)
      }
      return bloqueioPorPolitica(name, spec, run)
    }
  }
  return undefined
}

async function anexarFeedbackDeUmHook(
  spec: HookSpec,
  target: NonNullable<ReturnType<Lote['targetOf']>>,
  results: unknown,
  lote: Lote,
  budget: ContinuationBudget,
): Promise<boolean> {
  const run = await runHookCommand(spec, {
    event: 'PostToolUse',
    name: target.name,
    args: {},
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
  let trecho = ''
  if (fb.additionalContext !== undefined) trecho += `\n${fb.additionalContext}`
  if (fb.feedback !== undefined) trecho += `\n${fb.feedback}`
  if (trecho.length === 0) return false
  if (lote.exceedsBudget(trecho)) {
    lote.anexar(target, lote.truncar(trecho))
    note(
      `aggregate hook feedback exceeded ${String(MAX_FEEDBACK_TOTAL_CHARS)} characters; later hooks were dropped`,
    )
    return true
  }
  lote.anexar(target, trecho)
  return false
}

function cargaDoEvento(event: HookEvent, tool: ToolContext): Record<string, unknown> {
  if (event !== 'PostToolUse') return { event }
  return { event, name: tool.name ?? '', args: tool.args ?? {}, result: tool.result }
}

async function dispararObservacionais(
  event: HookEvent,
  list: readonly HookSpec[],
  ctx: unknown,
): Promise<void> {
  const tool = (ctx ?? {}) as ToolContext
  for (const spec of list) {
    if (event === 'PostToolUse' && !appliesTo(spec, tool.name ?? '')) continue
    const payload = cargaDoEvento(event, tool)
    try {
      const run = await runHookCommand(spec, payload)
      if (!run.ok) note(`${event} hook failed (ignored): ${spec.command} — ${run.output}`)
    } catch (err) {
      note(`${event} hook errored (ignored): ${spec.command} — ${String(err)}`)
    }
  }
}

async function transformarResultado<T>(
  allPost: readonly HookSpec[],
  results: T,
  ctx: ToolResultTurnContext,
): Promise<T> {
  const budget = new ContinuationBudget()
  const turn = (ctx ?? {}) as ToolResultTurnContext
  const nameById = new Map((turn.toolCalls ?? []).map((c) => [c.id, c.name]))
  const lote = Lote.de(results, nameById)

  for (const spec of allPost) {
    const target = lote.targetOf(spec)
    if (target === undefined) continue
    try {
      if (await anexarFeedbackDeUmHook(spec, target, results, lote, budget)) break
    } catch (err) {
      note(`PostToolUse hook errored (ignored): ${spec.command} — ${String(err)}`)
    }
  }
  return lote.resultado() as T
}

export function buildHookHandlers(
  specs: readonly HookSpec[],
  opts: { trusted: boolean; approved?: ReadonlySet<string> },
): HookHandlers {
  if (!opts.trusted) {
    if (specs.length > 0) {
      note(`${specs.length} hook(s) NOT loaded: this directory is not trusted`)
    }
    return {}
  }

  const permitted =
    opts.approved === undefined
      ? specs
      : specs.filter((s) => opts.approved!.has(hookFingerprint(s)))

  const by = (event: HookEvent): HookSpec[] => permitted.filter((s) => s.event === event)
  const handlers: HookHandlers = {}

  const pre = by('PreToolUse')
  if (pre.length > 0) {
    handlers.pre_tool_call = (ctx) => vetoDePreToolUse(pre, ctx)
  }

  const allPost = by('PostToolUse')

  if (allPost.length > 0) {
    handlers.transform_tool_result = <T>(results: T, ctx: ToolResultTurnContext): Promise<T> =>
      transformarResultado(allPost, results, ctx)
  }

  const observational: Array<[HookEvent, keyof HookHandlers]> = [
    ['Stop', 'post_assistant_reply'],
    ['SessionStart', 'on_session_start'],
  ]
  for (const [event, key] of observational) {
    const list = by(event)
    if (list.length === 0) continue
    const fire = (ctx: unknown): Promise<void> => dispararObservacionais(event, list, ctx)
    if (key === 'post_assistant_reply') handlers.post_assistant_reply = fire
    else if (key === 'on_session_start') handlers.on_session_start = fire
  }

  return handlers
}
