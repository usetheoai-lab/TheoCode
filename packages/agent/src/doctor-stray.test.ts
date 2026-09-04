/**
 * #72 — `doctor` reports a credential file left in a directory the product does not read.
 *
 * The detector on its own protects nobody: a finding nothing surfaces is worth what an absent one is
 * worth. `doctor` is where it belongs — it exists to report the resolved install, and "there is a
 * second credential file, and it is not the one in use" is exactly that.
 *
 * A warning rather than a failure. Nothing is broken; a leftover is a thing to clean up, and failing
 * on it would make `doctor` exit non-zero for an install that works.
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

describe('#72 — the stray-credential row', () => {
  it('test_a_stray_is_named_so_the_operator_can_remove_it', () => {
    const check = collectChecks({ ...base, strayCredentials: ['/home/x/.theokit/auth.json'] }).find(
      (c) => c.name === 'credential-strays',
    )

    expect(check?.status).toBe('warn')
    expect(check?.detail, 'a row that does not name the file is a row nobody can act on').toContain(
      '/home/x/.theokit/auth.json',
    )
  })

  it('test_a_stray_warns_and_does_not_fail_the_install', () => {
    const d = diagnose(collectChecks({ ...base, strayCredentials: ['/home/x/.theokit/auth.json'] }))

    expect(d.failed).toBe(0)
  })

  it('test_no_stray_adds_no_row', () => {
    // A row that always says "none" is noise in a nine-row diagnostic, and noise is what makes a
    // diagnostic stop being read.
    const names = collectChecks({ ...base, strayCredentials: [] }).map((c) => c.name)

    expect(names).not.toContain('credential-strays')
  })

  it('test_the_row_is_absent_when_the_caller_says_nothing', () => {
    const names = collectChecks(base).map((c) => c.name)

    expect(names).not.toContain('credential-strays')
  })
})

/**
 * #72 — an entity that is suppressed by trust AND has something active is two facts, not one.
 *
 * Only MCP can be in that state: the personal scope is not gated on project trust. Reporting only
 * the suppression says "not wired" about a server that is running; reporting only the active list
 * hides that the repository's share was withheld. An operator debugging either half needs the other.
 */
describe('#72 — the mcp row under partial suppression', () => {
  const withMcp = (active: readonly string[], suppressed: boolean): string | undefined =>
    collectChecks({
      ...base,
      wired: { ...base.wired, mcp: { active, suppressedByTrust: suppressed } },
    }).find((c) => c.name === 'mcp')?.detail

  it('test_both_facts_are_reported_when_something_survived_the_gate', () => {
    const detail = withMcp(['mine'], true)

    expect(detail, 'the running server is not named').toContain('mine')
    expect(detail, "the repository's withheld share is not mentioned").toContain('untrusted')
  })

  it('test_full_suppression_still_reads_as_before', () => {
    expect(withMcp([], true)).toBe('declared but NOT wired — this directory is untrusted')
  })

  it('test_a_trusted_directory_still_reads_as_before', () => {
    expect(withMcp(['mine', 'theirs'], false)).toBe('mine, theirs')
  })
})
