/**
 * What a failed turn TELLS the user.
 *
 * The framework masks by default — `presentUIMessageStream` uses `opts.onError ?? MASK_ERROR`, and
 * `MASK_ERROR` is the fixed string `"An error occurred."`. Neither surface passed `onError`, so
 * every failure in this product, from either surface, rendered as those three words.
 *
 * Measured 2026-08-25. `theocode run "reply PONG"` printed:
 *
 *     ERROR: An error occurred.
 *     [exec] session=exec-… status=error tokens=0
 *
 * The real cause was `RateLimitError`, and the ONLY way to see it was
 * `THEOCODE_DIAGNOSTICS=stderr` — an environment variable the failure message does not mention:
 *
 *     retry 1/3 in 20ms — RateLimitError
 *     retry 2/3 in 403ms — RateLimitError
 *     ERROR: An error occurred.
 *
 * The default is right for the transport it was written for. Masking exists so a public HTTP
 * endpoint does not leak server internals to a caller who is not the operator. In THIS product the
 * caller IS the operator: it runs on their machine, against their credential, and there is nobody
 * else to protect the detail from. `rules/error-handling.md` § 3 already names this shape as an
 * anti-pattern: a generic message ("an unexpected error occurred") tells nobody what failed or
 * what to do about it.
 *
 * So the surfaces opt out, in one place, rather than each deciding.
 */

/**
 * Failures common enough to be worth a next step rather than only a name.
 *
 * Matched on the error CODE where the framework supplies one and on the message otherwise —
 * message matching is a heuristic and is kept to a substring that names an error class, never a
 * phrase that could be reworded upstream without anyone noticing.
 */
const HINTS: readonly { readonly matches: (probe: string) => boolean; readonly hint: string }[] = [
  {
    matches: (p) => p.includes('ratelimit') || p.includes('rate_limit') || p.includes('429'),
    hint: 'the provider is rate-limiting this account — wait and retry, or switch model with /model',
  },
  {
    matches: (p) =>
      p.includes('401') ||
      p.includes('unauthor') ||
      p.includes('invalid_api_key') ||
      p.includes('authenticationerror'),
    hint: 'the credential was refused — run `theocode doctor`, then /login to re-authenticate',
  },
  {
    matches: (p) =>
      p.includes('econnrefused') || p.includes('enotfound') || p.includes('etimedout'),
    hint: 'the provider could not be reached — check the network, then retry',
  },
  {
    matches: (p) => p.includes('context') && p.includes('length'),
    hint: 'the conversation outgrew the model window — /compact frees context',
  },
]

/**
 * The text a surface shows for a failed turn: what happened, and where known, what to do about it.
 *
 * Never empty. A blank line where the reason should be is the same defect as the fixed string it
 * replaces — the user still learns nothing, and now nothing looks wrong either.
 */
/**
 * What the surface knows about the turn that the error object does not carry.
 *
 * Both fields are optional and absent means UNKNOWN, never `false`. A surface that has not been
 * wired yet keeps the old text rather than advertising a state nobody checked.
 */
export interface TurnErrorContext {
  /**
   * The highest attempt the provider reached, from `@theocode/shared/retry-record`.
   *
   * `0` or `1` is not a retry and is not reported: a single attempt IS the turn, and "after 1
   * attempt" on every ordinary failure is the noise that gets a message skipped.
   */
  readonly attempts?: number
  /**
   * Whether the diagnostics sink is installed, from `installDiagnosticSink`'s return value.
   *
   * When it is OFF the failure names the variable; when it is already ON, saying so would tell the
   * operator to turn on what they turned on.
   */
  readonly diagnosticsEnabled?: boolean
}

const DIAGNOSTICS_HINT =
  'set THEOCODE_DIAGNOSTICS=stderr to see the retry sequence and the underlying error'

export function turnErrorText(
  error: { message: string; code?: string },
  context: TurnErrorContext = {},
): string {
  const message = error.message.trim()
  const named = message.length > 0 ? message : 'the turn failed with no message'
  const labelled = error.code === undefined ? named : `${named} [${error.code}]`

  const probe = `${error.code ?? ''} ${message}`.toLowerCase()
  const hint = HINTS.find((h) => h.matches(probe))?.hint

  // Order is deliberate and pinned by a test: what happened, then what to do, then the context. The
  // original defect was a user left with nothing to act on, so nothing may push the message down.
  const parts = [hint === undefined ? labelled : `${labelled} — ${hint}`]

  const attempts = context.attempts ?? 0
  if (attempts > 1) parts.push(`after ${String(attempts)} attempts`)

  if (context.diagnosticsEnabled === false) parts.push(DIAGNOSTICS_HINT)

  return parts.join(' — ')
}
