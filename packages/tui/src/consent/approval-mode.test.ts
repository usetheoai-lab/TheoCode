/**
 * B-006 — the two surfaces must agree on when it is safe to stop asking.
 *
 * The headless surface refuses to auto-approve without an enforced sandbox, and says why in its own
 * words: *"refusing instead of claiming a confinement that does not exist"* (`approval-policy.ts`).
 *
 * The interactive surface auto-approved every tool under `full-auto` with no posture check at all —
 * while the very same screen renders `sandbox:<mode> ⚠ tool-gating`, telling the user confinement is
 * absent. One surface reasoned it through; the other never asked the question.
 *
 * Trusting a directory is not the same as consenting to run unconfined: the trust gate answers
 * "may this repo configure the agent?", and this one answers "may commands run without me looking?".
 */
import { describe, expect, it } from 'vitest'

import { shouldAutoApprove } from './approval-mode.js'

const ENFORCED = { enforced: true, detail: 'bwrap' }
const NOT_ENFORCED = { enforced: false, detail: 'no kernel sandbox available' }

describe('B-006 — full-auto requires an enforced sandbox', () => {
  it('test_full_auto_auto_approves_when_the_sandbox_is_enforced', () => {
    // Anti-vacuity floor: refusing everything would satisfy the assertion below.
    expect(shouldAutoApprove('full-auto', 'shell', ENFORCED)).toBe(true)
  })

  it('test_full_auto_does_NOT_auto_approve_without_an_enforced_sandbox', () => {
    expect(
      shouldAutoApprove('full-auto', 'shell', NOT_ENFORCED),
      'the interactive surface auto-approved a command with no confinement, while the same screen ' +
        'was telling the user there is none. The headless surface refuses this exact combination.',
    ).toBe(false)
  })

  it('test_an_unknown_posture_is_treated_as_unconfined', () => {
    // Absence of evidence is not evidence of confinement. Defaulting the other way would make the
    // guard vanish wherever the posture has not been threaded through yet.
    expect(shouldAutoApprove('full-auto', 'shell', undefined)).toBe(false)
  })
})

describe('B-006 — the other modes are unchanged', () => {
  it('test_suggest_never_auto_approves', () => {
    expect(shouldAutoApprove('suggest', 'apply_patch', ENFORCED)).toBe(false)
  })

  it('test_auto_edit_still_covers_edits_under_an_enforced_sandbox', () => {
    expect(shouldAutoApprove('auto-edit', 'apply_patch', ENFORCED)).toBe(true)
  })

  it('test_auto_edit_does_not_auto_approve_a_shell_command', () => {
    expect(shouldAutoApprove('auto-edit', 'shell', ENFORCED)).toBe(false)
  })

  it('test_auto_edit_of_a_file_is_allowed_without_a_kernel_sandbox', () => {
    // Deliberate: `apply_patch` is confined by the tool's own write scope, not by the kernel, and
    // the user opted into edits specifically. Widening the refusal here would be a different
    // decision than the one the headless surface made, which is only about running commands blind.
    expect(shouldAutoApprove('auto-edit', 'apply_patch', NOT_ENFORCED)).toBe(true)
  })
})
