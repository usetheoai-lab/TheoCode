import { Tool } from '@theokit/agents'
import type { CustomTool } from '@theokit/agents'
import { resolveInteractive } from '@theokit/agents/interactive'
import type { InteractiveProvider } from '@theokit/agents/interactive'
import { createInteractiveShellTool as createSdkInteractiveShellTool } from '@theokit/agents/tools'
import { z } from 'zod'

const SESSION_CAP_ERROR = 'interactive_session_limit'

const CODIGOS_CONHECIDOS = new Set(['interactive_unavailable', 'no_such_session'])

interface CapExceeded {
  readonly max: number
  readonly liveSessionIds: readonly string[]
}

const hasCapLoad = (err: object): err is object & CapExceeded => {
  const e = err as { max?: unknown; liveSessionIds?: unknown }
  return (
    typeof e.max === 'number' &&
    Array.isArray(e.liveSessionIds) &&
    e.liveSessionIds.every((id) => typeof id === 'string')
  )
}

function serializeInteractiveShellError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    if (hasCapLoad(err)) {
      return JSON.stringify({
        ok: false,
        error: SESSION_CAP_ERROR,
        max: err.max,
        live_session_ids: [...err.liveSessionIds],
        message: (err as { message?: unknown }).message,
      })
    }
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && CODIGOS_CONHECIDOS.has(code)) {
      return JSON.stringify({ ok: false, error: code })
    }
  }
  throw err
}

export interface InteractiveShellOptions {
  interactive: InteractiveProvider<unknown>
}

/**
 * B-009 — this forks the SDK tool's schema and handler, and that is a defect with a known end date.
 *
 * The reason it exists is real and was measured: the SDK's `toErrorJson` matched
 * `InteractiveUnavailableError` before its subclass, so a session cap arrived as
 * `interactive_unavailable` with `max` and `liveSessionIds` discarded — the only fields the model
 * can act on. There is no error seam to override, so recovering them meant rebuilding the tool.
 *
 * That defect is now FIXED upstream (`@theokit/sdk-tools`, commit "keep the session-cap fields
 * instead of flattening them"). It is not yet released: this package resolves 0.26.1, which still
 * flattens. So the fork stays until the dependency is bumped, and then this whole file collapses
 * into a call to the SDK factory.
 *
 * Until then the cost is live: the description shown to the model comes from the SDK while the
 * schema below is a frozen copy, so any option the SDK adds (`cwd`, `ttl_ms`, `cols`, `rows` already
 * exist in `StartInteractiveOptions`) silently fails to reach it.
 */
export function createInteractiveShellTool(opts: InteractiveShellOptions): CustomTool {
  const doSdk = createSdkInteractiveShellTool(opts)
  return Tool.create({
    name: doSdk.name,
    description: doSdk.description,
    inputSchema: z.object({
      command: z
        .string()
        .min(1)
        .describe("Command to run interactively, e.g. 'python3' or 'bash -i'."),
      yield_time_ms: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('How long to wait for startup output before returning (clamped by the backend).'),
    }),
    handler: async ({ command, yield_time_ms }, ctx) => {
      try {
        const backend = await resolveInteractive(opts.interactive, ctx ?? {})
        const { sessionId, output } = await backend.startInteractive(command, {
          yieldMs: yield_time_ms,
        })
        return JSON.stringify({ ok: true, session_id: sessionId, output })
      } catch (err) {
        return serializeInteractiveShellError(err)
      }
    },
  })
}
