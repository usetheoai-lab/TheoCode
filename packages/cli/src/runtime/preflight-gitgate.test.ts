/**
 * B-137 — the first thing the CLI does was an unbounded subprocess that misreported its own failure.
 *
 * `gitGate` runs `git rev-parse --is-inside-work-tree` before anything else, and it ran it with no
 * timeout at all. A git that hangs — a network-backed working tree, a stale `index.lock`, a
 * credential helper waiting on a prompt — hung the CLI forever, with no output and no bound.
 *
 * The second half is the diagnosis. Every failure took the same branch and printed "Not inside a git
 * repository", so a hang, a missing binary and a genuinely non-git directory were reported as the
 * same thing, and only one of them was true. That is the shape B-130 fixed one layer up, where the
 * transport's retries turned a 401 into a 429.
 *
 * Found 2026-09-03 by RE-MEASURING the finding that produced B-128 instead of trusting that it had
 * been fixed: the original sweep counted three hard-coded call sites and never saw this one, which
 * had no timeout to count.
 */
import { describe, expect, it } from 'vitest'

import { gitGate } from './preflight.js'

describe('gitGate', () => {
  it('test_it_passes_inside_a_git_repository', () => {
    // This suite runs inside one. The anti-vacuity floor for everything below.
    const reported: string[] = []
    expect(() => gitGate(false, { onWarn: (m) => reported.push(m) })).not.toThrow()
    expect(reported).toEqual([])
  })

  it('test_skipping_the_gate_runs_no_subprocess_at_all', () => {
    const reported: string[] = []
    gitGate(true, {
      onWarn: (m) => reported.push(m),
      run: () => {
        throw new Error('the gate ran git despite --skip-git-repo-check')
      },
    })
    expect(reported).toEqual([])
  })

  it('test_a_failure_reports_the_real_reason_rather_than_only_the_verdict', () => {
    // The misdiagnosis. "Not inside a git repository" is one explanation among several, and it was
    // printed for all of them.
    const reported: string[] = []
    let exited: number | undefined

    gitGate(false, {
      onWarn: (m) => reported.push(m),
      run: () => ({ ok: false, stdout: '' }),
      onRefuse: (code) => {
        exited = code
      },
      reason: 'git: command not found',
    })

    expect(exited).toBe(1)
    expect(reported.join(' '), 'the reason git actually gave was discarded').toContain(
      'git: command not found',
    )
  })

  it('test_the_subprocess_is_bounded', () => {
    // The bound is the finding. A gate with no timeout is not a gate — it is a place the CLI can
    // stop forever, before it has printed anything a user could act on.
    let seenTimeout: number | undefined

    gitGate(false, {
      onWarn: () => {},
      run: (timeoutMs) => {
        seenTimeout = timeoutMs
        return { ok: true, stdout: 'true\n' }
      },
    })

    expect(seenTimeout, 'the git call was made with no timeout').toBeTypeOf('number')
    expect(seenTimeout).toBeGreaterThan(0)
  })
})
