/**
 * B-142 — the background sweep starts and returns; it does not sweep.
 *
 * The whole point is the return, so the assertions are about what happens BEFORE the child finishes.
 */
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { startSessionSweepInBackground } from './auto-runtime.js'

function scratchRoot(): string {
  const base = mkdtempSync(join(tmpdir(), 'theocode-bgsweep-'))
  const root = join(base, 'projects')
  mkdirSync(root, { recursive: true })
  return root
}
const stampOf = (root: string): string => join(root, '..', '.last-session-gc')

/**
 * A child that never runs: the test asserts what the parent did, not what a sweep found.
 *
 * `closingWith` is the variant that FIRES the close handler, because the parent's only user-visible
 * output happens there — and a mutation check proved that branch was unprotected: deleting the
 * entire first-run sentence, the one that tells the operator how to turn deletion off, left the
 * suite green.
 */
const fakeChild = (): { on: (e: 'close', cb: (c: number | null) => void) => void } => ({
  on: () => {},
})

const closingWith = (
  code: number | null,
): { on: (e: 'close', cb: (c: number | null) => void) => void } => ({
  on: (_event, cb) => {
    cb(code)
  },
})

describe('startSessionSweepInBackground', () => {
  it('test_it_returns_without_waiting_for_the_sweep', () => {
    // The finding, as an assertion: 37 s of synchronous sweeping used to happen inside this call.
    const root = scratchRoot()
    const started = Date.now()

    const outcome = startSessionSweepInBackground({
      enabled: true,
      onReport: () => {},
      projectsRootOverride: root,
      spawnSweep: fakeChild,
    })

    expect(outcome.started).toBe(true)
    expect(Date.now() - started, 'the call did work instead of delegating it').toBeLessThan(500)
  })

  it('test_a_disabled_collector_spawns_nothing_and_stamps_nothing', () => {
    const root = scratchRoot()
    let spawned = false

    const outcome = startSessionSweepInBackground({
      enabled: false,
      onReport: () => {},
      projectsRootOverride: root,
      spawnSweep: () => {
        spawned = true
        return fakeChild()
      },
    })

    expect(outcome).toMatchObject({ started: false, reason: 'disabled' })
    expect(spawned).toBe(false)
    expect(existsSync(stampOf(root))).toBe(false)
  })

  it('test_the_first_sweep_asks_the_child_NOT_to_apply', () => {
    // B-139 has to survive the move to a child process, or the redesign silently undoes it.
    const root = scratchRoot()
    let args: readonly string[] = []

    startSessionSweepInBackground({
      enabled: true,
      onReport: () => {},
      projectsRootOverride: root,
      spawnSweep: (cmd) => {
        args = cmd.args
        return fakeChild()
      },
    })

    expect(args).toContain('gc')
    expect(args, 'the first background sweep would have deleted').not.toContain('--apply')
  })

  it('test_the_second_sweep_asks_the_child_to_apply', () => {
    // Anti-vacuity: never passing --apply is the useless collector B-138 was about.
    const root = scratchRoot()
    writeFileSync(stampOf(root), new Date('2026-09-01T00:00:00Z').toISOString())
    let args: readonly string[] = []

    startSessionSweepInBackground({
      enabled: true,
      now: new Date('2026-09-05T00:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
      spawnSweep: (cmd) => {
        args = cmd.args
        return fakeChild()
      },
    })

    expect(args).toContain('--apply')
  })

  it('test_it_does_not_spawn_twice_inside_the_interval', () => {
    const root = scratchRoot()
    let spawns = 0
    const call = (now: Date): void => {
      startSessionSweepInBackground({
        enabled: true,
        now,
        onReport: () => {},
        projectsRootOverride: root,
        spawnSweep: () => {
          spawns += 1
          return fakeChild()
        },
      })
    }

    call(new Date('2026-09-03T12:00:00Z'))
    call(new Date('2026-09-03T13:00:00Z'))

    expect(spawns).toBe(1)
  })

  it('test_a_spawn_failure_is_reported_and_never_thrown', () => {
    // It runs beside a user's session. Housekeeping that can take the agent down is worse than
    // housekeeping that does not happen.
    const root = scratchRoot()
    const reports: string[] = []

    const outcome = startSessionSweepInBackground({
      enabled: true,
      onReport: (l) => reports.push(l),
      projectsRootOverride: root,
      spawnSweep: () => {
        throw new Error('EAGAIN')
      },
    })

    expect(outcome).toMatchObject({ started: false, reason: 'spawn-failed' })
    expect(reports.join(' ')).toContain('EAGAIN')
  })
})

describe('what the operator is told when the child finishes', () => {
  const reportFor = (opts: { stamped?: string }): string[] => {
    const root = scratchRoot()
    if (opts.stamped !== undefined) writeFileSync(stampOf(root), opts.stamped)
    const reports: string[] = []
    startSessionSweepInBackground({
      enabled: true,
      now: new Date('2026-09-05T00:00:00Z'),
      onReport: (l) => reports.push(l),
      projectsRootOverride: root,
      spawnSweep: () => closingWith(0),
    })
    return reports
  }

  it('test_the_first_sweep_says_it_removed_nothing_and_how_to_keep_collection_manual', () => {
    // This sentence is the entire consent story for a default that deletes an operator's
    // transcripts. Losing it is not a cosmetic regression.
    const text = reportFor({}).join(' ')

    expect(text).toContain('DRY RUN')
    expect(text, 'the operator was not told how to turn it off').toContain('session_gc = false')
  })

  it('test_a_later_sweep_does_not_repeat_the_first_run_sentence', () => {
    // Anti-vacuity: printing it every time would satisfy the test above and turn the one message
    // that matters into noise the operator learns to skip.
    const text = reportFor({ stamped: new Date('2026-09-01T00:00:00Z').toISOString() }).join(' ')

    expect(text).toContain('background sweep finished')
    expect(text).not.toContain('DRY RUN')
  })

  it('test_a_non_zero_exit_is_reported_rather_than_read_as_success', () => {
    // A child that died is not a sweep that ran. Reporting "finished" for both is the shape that
    // makes a broken collector look healthy for as long as nobody checks.
    const root = scratchRoot()
    const reports: string[] = []
    startSessionSweepInBackground({
      enabled: true,
      onReport: (l) => reports.push(l),
      projectsRootOverride: root,
      spawnSweep: () => closingWith(1),
    })

    expect(reports.join(' ')).toContain('exit 1')
  })
})

/**
 * B-150 — moving the sweep to a child process threw away what it did.
 *
 * B-132's DoD says "what the automation did is visible, so 'it ran and removed nothing' is
 * distinguishable from 'it never ran'". B-139's says "the first automatic sweep removes nothing and
 * SAYS WHAT IT WOULD HAVE REMOVED". Both were met by the in-process form, which reported counts.
 *
 * B-142 moved the sweep into a child spawned with `stdio: 'ignore'` and the counts went with it. The
 * parent said "background sweep finished" and nothing else — so two Definitions of Done regressed
 * silently, in items already marked shipped, by a fix for a third.
 *
 * The instrument was wrong for the concern. `'ignore'` was chosen because "the TUI owns the screen",
 * which is an argument against INHERITING the child's streams. Piping captures them without
 * displaying anything, which is what was wanted all along.
 */
describe('what the child did reaches the operator', () => {
  const childSaying = (line: string) => ({
    stdout: {
      on: (_e: 'data', cb: (chunk: unknown) => void) => {
        cb(line)
      },
    },
    on: (_event: 'close', cb: (code: number | null) => void) => {
      cb(0)
    },
  })

  it('test_the_first_sweep_reports_what_it_WOULD_have_removed', () => {
    // B-139's bullet. "Nothing was removed" without "and here is what would have been" tells the
    // operator the collector is harmless, not what it is about to do to them tomorrow.
    const root = scratchRoot()
    const reports: string[] = []

    startSessionSweepInBackground({
      enabled: true,
      onReport: (l) => reports.push(l),
      projectsRootOverride: root,
      spawnSweep: () => childSaying('DRY-RUN — nothing was removed; use --apply to execute\n'),
    })

    expect(reports.join(' ')).toContain('DRY-RUN')
  })

  it('test_an_applying_sweep_reports_its_counts', () => {
    // B-132's bullet. "Finished" is not "removed 12", and the difference is the whole point of the
    // requirement.
    const root = scratchRoot()
    writeFileSync(stampOf(root), new Date('2026-09-01T00:00:00Z').toISOString())
    const reports: string[] = []

    startSessionSweepInBackground({
      enabled: true,
      now: new Date('2026-09-05T00:00:00Z'),
      onReport: (l) => reports.push(l),
      projectsRootOverride: root,
      spawnSweep: () => childSaying('APPLIED — 12 artifact(s) removed\n'),
    })

    expect(reports.join(' ')).toContain('12')
  })

  it('test_a_silent_child_still_produces_a_report', () => {
    // Anti-vacuity in the direction that matters: if the child says nothing, the parent must still
    // say the sweep happened. Reporting only when there is output would make a broken child
    // indistinguishable from a collector that never ran.
    const root = scratchRoot()
    const reports: string[] = []

    startSessionSweepInBackground({
      enabled: true,
      onReport: (l) => reports.push(l),
      projectsRootOverride: root,
      spawnSweep: () => ({ on: (_e, cb) => cb(0) }),
    })

    expect(reports.join(' ')).toContain('sweep')
  })
})
