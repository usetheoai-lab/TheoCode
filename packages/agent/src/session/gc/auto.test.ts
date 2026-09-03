/**
 * B-131 / B-132 — the collector runs without the operator remembering, and cannot take the process
 * down with it.
 *
 * Everything the collection needs already existed and was good: a 30-day window with a 1-day floor,
 * a 200 000-operation budget sized from a MEASURED ~2.54 operations per project over a MEASURED
 * 13 269-project tree, a plan/apply split with a dry run, and a fail-safe that KEEPS anything it
 * cannot classify. The only missing part was the trigger — `sessions gc` was an explicit CLI action
 * and nothing ever invoked it, so between two manual runs the tree only grew (B-131), and a human
 * was the scheduler for a procedure whose steps never change (B-132).
 *
 * This module adds the trigger and NOTHING else. It does not re-implement planning, deleting,
 * budgeting or the floor: those are injected, and these tests assert they are called rather than
 * reproduced.
 */
import { describe, expect, it, vi } from 'vitest'

import { maybeCollectSessions, type AutoGcDeps } from './auto.js'

const NOW = new Date('2026-09-03T12:00:00Z')

function deps(over: Partial<AutoGcDeps> = {}): AutoGcDeps {
  return {
    enabled: true,
    now: NOW,
    intervalHours: 24,
    readLastRun: () => undefined,
    writeLastRun: () => {},
    plan: async () => ({ totalByKind: {}, kept: [], errors: [] }) as never,
    run: async () => ({ dryRun: false, removed: [], errors: [] }) as never,
    onReport: () => {},
    ...over,
  }
}

describe('maybeCollectSessions', () => {
  it('test_it_does_nothing_when_the_operator_turned_it_off', async () => {
    const plan = vi.fn()

    const outcome = await maybeCollectSessions(deps({ enabled: false, plan: plan as never }))

    expect(outcome.kind).toBe('disabled')
    expect(plan, 'a disabled collector still walked the disk').not.toHaveBeenCalled()
  })

  it('test_it_runs_when_it_has_never_run_before', async () => {
    const outcome = await maybeCollectSessions(
      deps({ run: async () => ({ dryRun: false, removed: ['a', 'b'], errors: [] }) as never }),
    )

    expect(outcome).toMatchObject({ kind: 'ran', removed: 2 })
  })

  it('test_it_stays_quiet_when_it_already_ran_inside_the_interval', async () => {
    // The bound that keeps this off the startup path: a sweep per session start would be a real
    // cost on a 13 269-project tree, and the retention window is measured in days.
    const plan = vi.fn()
    const lastRun = new Date(NOW.getTime() - 60 * 60 * 1000)

    const outcome = await maybeCollectSessions(
      deps({ readLastRun: () => lastRun, plan: plan as never }),
    )

    expect(outcome.kind).toBe('too-soon')
    expect(plan).not.toHaveBeenCalled()
  })

  it('test_it_runs_again_once_the_interval_has_elapsed', async () => {
    const lastRun = new Date(NOW.getTime() - 25 * 60 * 60 * 1000)

    const outcome = await maybeCollectSessions(deps({ readLastRun: () => lastRun }))

    expect(outcome.kind).toBe('ran')
  })

  it('test_it_reuses_the_existing_plan_and_apply_rather_than_deleting_anything_itself', async () => {
    // The DoD, as an assertion: the floor, the budget and the fail-safe live in the injected plan.
    // A collector that walked the disk itself would be a second implementation of the one path in
    // this product that removes a user's data.
    const planned = { totalByKind: { transcript: 3 }, kept: [], errors: [] }
    const plan = vi.fn(async () => planned as never)
    const run = vi.fn(async () => ({ dryRun: false, removed: ['x'], errors: [] }) as never)

    await maybeCollectSessions(deps({ plan, run }))

    expect(plan).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith(planned)
  })

  it('test_a_run_that_removed_nothing_is_distinguishable_from_one_that_never_happened', async () => {
    // B-132's second bullet. "Nothing was removed" and "it never ran" look identical in a silent
    // system, and only one of them means the policy is being applied.
    const ran = await maybeCollectSessions(deps())
    const skipped = await maybeCollectSessions(deps({ readLastRun: () => NOW }))

    expect(ran).toMatchObject({ kind: 'ran', removed: 0 })
    expect(skipped.kind).toBe('too-soon')
  })

  it('test_it_records_the_attempt_before_sweeping_rather_than_after', async () => {
    // Deliberate ordering. Stamping AFTER means a sweep that throws every time re-runs on every
    // start, turning one broken tree into a cost paid on every launch.
    const calls: string[] = []

    await maybeCollectSessions(
      deps({
        writeLastRun: () => calls.push('stamp'),
        plan: async () => {
          calls.push('plan')
          return { totalByKind: {}, kept: [], errors: [] } as never
        },
      }),
    )

    expect(calls).toEqual(['stamp', 'plan'])
  })

  it('test_a_failure_is_reported_and_never_thrown', async () => {
    // The hard requirement. This runs beside a user's session; a collector that throws would take
    // down the agent over housekeeping. `gc/fail-open.test.ts` holds the same line one layer down.
    const reports: string[] = []

    const outcome = await maybeCollectSessions(
      deps({
        plan: async () => {
          throw new Error('disk went away')
        },
        onReport: (line) => reports.push(line),
      }),
    )

    expect(outcome).toMatchObject({ kind: 'failed' })
    expect(reports.join(' ')).toContain('disk went away')
  })

  it('test_a_failure_to_record_the_attempt_does_not_stop_the_sweep', async () => {
    // A read-only state directory must not mean the policy stops being applied. It means the
    // interval is not remembered, which is a smaller problem than never collecting.
    const outcome = await maybeCollectSessions(
      deps({
        writeLastRun: () => {
          throw new Error('read-only home')
        },
      }),
    )

    expect(outcome.kind).toBe('ran')
  })

  it('test_what_it_did_reaches_the_report_channel', async () => {
    const reports: string[] = []

    await maybeCollectSessions(
      deps({
        run: async () => ({ dryRun: false, removed: ['a', 'b', 'c'], errors: [] }) as never,
        onReport: (line) => reports.push(line),
      }),
    )

    expect(reports.join(' ')).toContain('3')
  })
})
