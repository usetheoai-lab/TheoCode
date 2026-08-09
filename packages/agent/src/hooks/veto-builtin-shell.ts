import type { HookHandlers } from '@theokit/agents'

export const BUILTIN_SHELL = 'shell'

export const VETO_REASON =
  `The '${BUILTIN_SHELL}' tool (a runtime builtin) is not used by this agent: it does not go through ` +
  "the project's sandbox scope, so a write through it would ignore `--sandbox read-only` and the " +
  '`writeRoot` of `workspace-write`. Use `run_shell`, which does the same confined by the active policy.'

export function withBuiltinShellVeto(handlers: HookHandlers): HookHandlers {
  const previous = handlers.pre_tool_call
  return {
    ...handlers,
    pre_tool_call: async (ctx) => {
      if ((ctx.name ?? '') === BUILTIN_SHELL) {
        return { block: true, message: VETO_REASON }
      }
      return previous === undefined ? undefined : await previous(ctx)
    },
  }
}
