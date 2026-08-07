import { TheokitAgentError } from '@theokit/agents'

export const DELEGATION_CAP_MS = 15 * 60_000

export class DelegationExpiredError extends TheokitAgentError {
  override readonly name = 'DelegationExpiredError'

  constructor(capMs: number) {
    super(
      `[delegation_timeout] a delegação a delegate_to_team passou de ${String(Math.round(capMs / 60_000))} min e foi abandonada. ` +
        'Os agentes membros foram descartados; o trabalho já escrito em disco NÃO foi revertido — ' +
        'inspecione a árvore antes de repetir.',
      { isRetryable: false, code: 'delegation_timeout' },
    )
  }
}

export async function withDelegationCap<T>(
  trabalho: Promise<T>,
  capMs: number = DELEGATION_CAP_MS,
  dormir: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => {
      const t = setTimeout(r, ms)
      if (typeof t === 'object' && 'unref' in t) t.unref()
    }),
): Promise<T> {
  return Promise.race([
    trabalho,
    dormir(capMs).then((): never => {
      throw new DelegationExpiredError(capMs)
    }),
  ])
}
