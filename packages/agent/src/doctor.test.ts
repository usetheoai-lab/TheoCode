/**
 * B-081 — the diagnostic must be trustworthy in the two ways that matter: it must FAIL when
 * something is broken (so a script can use it), and it must never print a secret (because its whole
 * purpose is to be pasted into an issue).
 */
import { describe, expect, it } from 'vitest'

import { collectChecks, diagnose, renderDiagnosis } from './doctor.js'

const base = {
  cwd: '/workspace',
  trustLevel: 'trusted',
  model: 'openai/gpt-5.4',
  effort: 'medium',
  sandboxMode: 'workspace-write',
  approvalPolicy: 'on-request',
  credential: 'present' as const,
  wired: {
    mcp: { active: ['probe'], suppressedByTrust: false },
    skills: { active: ['daily-briefing'], suppressedByTrust: false },
    hooks: { active: [], suppressedByTrust: false },
  },
}

describe('B-081 — collectChecks', () => {
  it('test_a_healthy_install_has_no_failure', () => {
    expect(diagnose(collectChecks(base)).failed).toBe(false)
  })

  it('test_a_missing_credential_is_a_failure_with_the_remedy', () => {
    // FAIL, not warn: without it nothing works, and the exit code is what makes this usable in a
    // support script.
    const d = diagnose(collectChecks({ ...base, credential: 'absent' }))
    expect(d.failed).toBe(true)
    expect(d.checks.find((c) => c.name === 'credential')?.detail).toContain('/login')
  })

  it('test_an_unreadable_credential_is_distinct_from_an_absent_one', () => {
    // Different remedies: one is "log in", the other is "your credential file is corrupt".
    const detail = collectChecks({ ...base, credential: 'unreadable' }).find(
      (c) => c.name === 'credential',
    )?.detail
    expect(detail).toContain('unreadable')
    expect(detail).not.toContain('/login')
  })

  it('test_trust_suppression_warns_rather_than_fails', () => {
    // Trust-gating is the product working as designed. Failing on it would train users to ignore
    // the exit code, which is the only thing making this scriptable.
    const d = diagnose(
      collectChecks({
        ...base,
        trustLevel: 'untrusted',
        wired: {
          mcp: { active: [], suppressedByTrust: true },
          skills: { active: [], suppressedByTrust: true },
          hooks: { active: [], suppressedByTrust: true },
        },
      }),
    )
    expect(d.failed).toBe(false)
    expect(d.checks.filter((c) => c.status === 'warn').length).toBeGreaterThanOrEqual(3)
  })

  it('test_suppressed_is_not_rendered_as_none', () => {
    // "none" and "yours were withheld" send a user to opposite places — the same distinction
    // B-069/B-070/B-071 each had to make in their own listing.
    const detail = collectChecks({
      ...base,
      wired: { ...base.wired, hooks: { active: [], suppressedByTrust: true } },
    }).find((c) => c.name === 'hooks')?.detail
    expect(detail).toContain('NOT wired')
    expect(detail).not.toBe('none')
  })
})

describe('B-081 — renderDiagnosis', () => {
  it('test_a_failure_is_findable_by_eye', () => {
    const out = renderDiagnosis(diagnose(collectChecks({ ...base, credential: 'absent' })))
    expect(out).toContain('FAIL')
  })

  it('test_it_never_prints_a_secret', () => {
    // The invariant that matters most. `collectChecks` takes presence, never a value, so there is
    // no path by which a token can reach this output — pinned so a future field cannot add one.
    const out = renderDiagnosis(diagnose(collectChecks(base)))
    expect(out).not.toMatch(/sk-|npm_|ghp_|Bearer /)
    expect(JSON.stringify(Object.keys(base))).not.toContain('token')
  })
})
