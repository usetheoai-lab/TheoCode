/**
 * Every failed turn in this product used to read `An error occurred.`
 *
 * Measured 2026-08-25 — `theocode run "reply PONG"`, before this module existed:
 *
 *     ERROR: An error occurred.
 *     [exec] session=exec-… status=error tokens=0
 *
 * and with `THEOCODE_DIAGNOSTICS=stderr`, an environment variable the message does not mention:
 *
 *     retry 1/3 in 20ms — RateLimitError
 *     retry 2/3 in 403ms — RateLimitError
 *
 * After: `ERROR: openai API error: rate_limit (HTTP 429) [AGENT_ERROR] — the provider is
 * rate-limiting this account — wait and retry, or switch model with /model`.
 */
import { describe, expect, it } from 'vitest'

import { turnErrorText } from './turn-error.js'

describe('turnErrorText', () => {
  it('test_the_underlying_message_survives', () => {
    // The whole defect: the framework's default discards it and the user is left with nothing to
    // search, quote in an issue, or act on.
    expect(turnErrorText({ message: 'openai API error: rate_limit (HTTP 429)' })).toContain(
      'rate_limit',
    )
  })

  it('test_the_code_is_shown_when_the_framework_supplies_one', () => {
    expect(turnErrorText({ message: 'boom', code: 'AGENT_ERROR' })).toContain('[AGENT_ERROR]')
  })

  it('test_an_unrecognised_failure_is_still_reported_verbatim', () => {
    // A hint is a bonus. A failure with no hint must still say what happened — falling back to a
    // fixed string for the unknown cases would reinstate the defect for exactly the failures
    // nobody anticipated.
    const text = turnErrorText({ message: 'the tool registry disagreed with itself' })

    expect(text).toBe('the tool registry disagreed with itself')
  })

  it('test_an_empty_message_never_renders_as_nothing', () => {
    // A blank line where the reason belongs is the same defect as the fixed string: the user learns
    // nothing, and now nothing even looks wrong.
    expect(turnErrorText({ message: '   ' })).toBe('the turn failed with no message')
    expect(turnErrorText({ message: '' })).not.toBe('')
  })
})

describe('the hints point at the next step, not at the diagnosis', () => {
  const hint = (message: string, code?: string): string =>
    turnErrorText(code === undefined ? { message } : { message, code })

  it('test_a_rate_limit_says_what_to_do_about_it', () => {
    expect(hint('openai API error: rate_limit (HTTP 429)')).toContain('/model')
  })

  it('test_a_refused_credential_points_at_login', () => {
    expect(hint('AuthenticationError: invalid_api_key')).toContain('/login')
  })

  it('test_an_unreachable_provider_is_not_confused_with_a_refused_credential', () => {
    // Different remedies: one is "log in again", the other is "check your network". Collapsing
    // them sends the user to re-authenticate a credential that was never the problem.
    const network = hint('connect ECONNREFUSED 10.0.0.1:443')

    expect(network).toContain('network')
    expect(network).not.toContain('/login')
  })

  it('test_an_outgrown_context_window_points_at_compact', () => {
    expect(hint('context length exceeded')).toContain('/compact')
  })

  it('test_the_hint_is_matched_on_the_code_too_not_only_the_message', () => {
    // The framework supplies a code where it has one, and a code is stable in a way a message
    // reworded upstream is not.
    expect(hint('request failed', 'rate_limit_exceeded')).toContain('rate-limiting')
  })
})
