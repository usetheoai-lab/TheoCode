import { TheokitAgentError } from '@theokit/agents'

/**
 * B-035 — a second listener was set on the ask bridge while one was still live.
 *
 * The bridge holds exactly ONE listener. It used to be called `subscribe`, which promises a
 * multicast it never provided: assigning the slot silently stopped the previous surface being
 * notified, with no error and no warning. Only one surface ever listens, so the fix is a name that
 * does not lie plus a refusal — not a multicast nobody asked for.
 */
export class ConcurrentListenerError extends TheokitAgentError {
  override readonly name = 'ConcurrentListenerError'
  readonly code = 'listener_already_set' as const

  constructor() {
    super(
      'A listener is already set on this ask bridge. The slot holds exactly one, and replacing a ' +
        'live listener would stop the current surface being notified with no trace. Dispose the ' +
        'first listener before setting another.',
      { isRetryable: false },
    )
  }
}
