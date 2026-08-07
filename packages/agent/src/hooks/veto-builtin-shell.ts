import type { HookHandlers } from '@theokit/agents'

export const SHELL_EMBUTIDO = 'shell'

export const VETO_REASON =
  `A tool '${SHELL_EMBUTIDO}' (builtin do runtime) não é usada neste agente: ela não passa pelo ` +
  'escopo de sandbox do projeto, então uma escrita por ela ignoraria `--sandbox read-only` e o ' +
  '`writeRoot` de `workspace-write`. Use `run_shell`, que faz o mesmo confinado pela política ativa.'

export function comVetoDoShellEmbutido(handlers: HookHandlers): HookHandlers {
  const anterior = handlers.pre_tool_call
  return {
    ...handlers,
    pre_tool_call: async (ctx) => {
      if ((ctx.name ?? '') === SHELL_EMBUTIDO) {
        return { block: true, message: VETO_REASON }
      }
      return anterior === undefined ? undefined : await anterior(ctx)
    },
  }
}
