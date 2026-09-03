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

/** A child that never runs: the test asserts what the parent did, not what a sweep found. */
const fakeChild = (): { on: (e: 'close', cb: (c: number | null) => void) => void } => ({
  on: () => {},
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
