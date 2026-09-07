/**
 * `doctor` reports what each `settings.json` carried and this product did not act on.
 *
 * `settings.json` is Claude Code's filename, so the file very often contains their settings. This
 * product tolerates them — a real one must not stop it from starting — and tolerance without a
 * report is the worse half of the trade: it teaches an operator that a setting is read when it is
 * not, and the cost lands later, on a behaviour they configured and never got.
 *
 * A warning, never a failure. Nothing is broken by a key we chose not to implement, and exiting
 * non-zero over one would report a working install as broken.
 */
import { describe, expect, it } from 'vitest'

import { collectChecks, diagnose } from './doctor.js'

const base = {
  cwd: '/tmp/p',
  trustLevel: 'trusted',
  model: 'openai/gpt-5',
  effort: 'medium',
  sandboxMode: 'workspace-write',
  approvalPolicy: 'on-request',
  credential: 'present' as const,
  wired: {
    mcp: { active: [], suppressedByTrust: false },
    skills: { active: [], suppressedByTrust: false },
    hooks: { active: [], suppressedByTrust: false },
  },
}

const REPORT = [
  {
    path: '/tmp/p/.claude/settings.json',
    ignored: ['alwaysThinkingEnabled'],
    unrecognised: ['voiceEnabled'],
    droppedHooks: ['UserPromptSubmit: this product has no such hook event'],
  },
]

describe('the settings row', () => {
  it('test_it_names_the_file_and_the_keys_it_did_not_act_on', () => {
    const check = collectChecks({ ...base, settingsIgnored: REPORT }).find(
      (c) => c.name === 'settings',
    )

    expect(check?.status).toBe('warn')
    expect(check?.detail).toContain('/tmp/p/.claude/settings.json')
    expect(check?.detail).toContain('alwaysThinkingEnabled')
    expect(check?.detail).toContain('voiceEnabled')
  })

  it('test_a_hook_that_could_not_be_translated_carries_its_reason', () => {
    const check = collectChecks({ ...base, settingsIgnored: REPORT }).find(
      (c) => c.name === 'settings',
    )

    expect(check?.detail).toContain('UserPromptSubmit')
  })

  it('test_it_warns_and_does_not_fail_the_install', () => {
    expect(diagnose(collectChecks({ ...base, settingsIgnored: REPORT })).failed).toBe(0)
  })

  it('test_a_file_with_nothing_to_report_produces_no_row', () => {
    // A row that permanently reads "none" is noise in a ten-row diagnostic, and noise is what makes
    // a diagnostic stop being read. Also the anti-vacuity floor for the assertions above.
    const rows = collectChecks({
      ...base,
      settingsIgnored: [
        { path: '/tmp/p/.theokit/settings.json', ignored: [], unrecognised: [], droppedHooks: [] },
      ],
    })
    expect(rows.find((c) => c.name === 'settings')).toBeUndefined()
  })

  it('test_a_caller_that_did_not_look_says_nothing', () => {
    expect(collectChecks(base).find((c) => c.name === 'settings')).toBeUndefined()
  })
})
