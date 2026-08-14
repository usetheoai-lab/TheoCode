import { z } from 'zod'

import { HOOK_EVENTS, type HookEvent, type HookSpec } from './hooks-spec.js'
import { HookError } from './hook-error.js'

/**
 * O PARSER de `.theokit/hooks.json` — e so ele.
 *
 * O motor saiu daqui para `@theokit/agents/hooks` (`build-handlers.ts` faz a ponte). O que ficou e a
 * unica coisa que o framework nao pode saber: o VOCABULARIO que os usuarios escrevem no arquivo
 * deles — `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, os nomes do Claude Code. O schema do
 * framework e `.strict()` sobre oito nomes em snake_case; entregar um arquivo de usuario a ele
 * estouraria no boot de quem ja tem um.
 *
 * Este arquivo tinha 423 linhas depois que o `buildHookHandlers` local foi deletado. **331 delas
 * estavam mortas** — `preToolUseVeto`, `transformResult`, `fireObservational`, `policyBlock` e o
 * resto do motor antigo, inalcancaveis porque o unico chamador era a funcao removida. Deletar so o
 * ponto de entrada e deixar o corpo para tras e como a duplicacao sobrevive a uma migracao: nada
 * quebra, nada aponta para la, e o proximo leitor encontra dois motores.
 */

const EVENTS = HOOK_EVENTS

const DEFAULT_TIMEOUT_MS = 5_000

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
