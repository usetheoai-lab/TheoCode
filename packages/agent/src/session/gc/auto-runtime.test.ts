/**
 * The stamp is real, and `apply: true` is real.
 *
 * `auto.test.ts` covers the decision with everything injected. This covers the two things only a
 * real filesystem can answer: that the interval survives a process boundary, and that the sweep is
 * an APPLY rather than the dry run `runAllProjectsOnDisk` performs by default — the difference
 * between collecting and reporting collection forever.
 */
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectSessionsAutomatically } from './auto-runtime.js'

function scratchRoot(): string {
  const base = mkdtempSync(join(tmpdir(), 'theocode-autogc-'))
  const root = join(base, 'projects')
  mkdirSync(root, { recursive: true })
  return root
}

const stampOf = (root: string): string => join(root, '..', '.last-session-gc')

describe('collectSessionsAutomatically', () => {
  it('test_a_disabled_collector_writes_no_stamp_and_touches_nothing', async () => {
    const root = scratchRoot()

    const outcome = await collectSessionsAutomatically({
      enabled: false,
      onReport: () => {},
      projectsRootOverride: root,
    })

    expect(outcome.kind).toBe('disabled')
    expect(existsSync(stampOf(root)), 'a disabled collector left a stamp behind').toBe(false)
  })

  it('test_it_records_when_it_ran_so_the_interval_survives_a_restart', async () => {
    // The interval is worthless if it only exists in memory: every process start would sweep.
    const root = scratchRoot()
    const now = new Date('2026-09-03T12:00:00Z')

    await collectSessionsAutomatically({
      enabled: true,
      now,
      onReport: () => {},
      projectsRootOverride: root,
    })

    expect(existsSync(stampOf(root))).toBe(true)
    expect(readFileSync(stampOf(root), 'utf8').trim()).toBe(now.toISOString())
  })

  it('test_a_second_start_inside_the_interval_does_not_sweep_again', async () => {
    const root = scratchRoot()

    await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-03T12:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
    })
    const second = await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-03T13:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
    })

    expect(second.kind).toBe('too-soon')
  })

  it('test_a_start_after_the_interval_sweeps_again', async () => {
    const root = scratchRoot()

    await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-03T12:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
    })
    const later = await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-05T12:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
    })

    expect(later.kind).toBe('ran')
  })

  it('test_an_unreadable_stamp_sweeps_rather_than_refusing_to', async () => {
    // A corrupt stamp must not disable collection forever. Sweeping is the recoverable direction.
    const root = scratchRoot()
    writeFileSync(stampOf(root), 'not a date\n')

    const outcome = await collectSessionsAutomatically({
      enabled: true,
      onReport: () => {},
      projectsRootOverride: root,
    })

    expect(outcome.kind).toBe('ran')
  })

  it('test_the_first_sweep_on_a_fresh_tree_is_a_dry_run', async () => {
    // B-139 — the look-first property `sessions gc --apply` already had. On a scratch root there is
    // no stamp, so this is the first sweep.
    const root = scratchRoot()

    const outcome = await collectSessionsAutomatically({
      enabled: true,
      onReport: () => {},
      projectsRootOverride: root,
    })

    expect(outcome).toMatchObject({ kind: 'ran', firstRun: true, dryRun: true })
  })

  it('test_the_sweep_applies_rather_than_dry_running', async () => {
    // `runAllProjectsOnDisk` is a DRY RUN unless told `apply: true`, so a caller that forgets
    // produces a collector that reports every day and removes nothing — green, silent and useless.
    //
    // THE FIRST VERSION OF THIS TEST COULD NOT FAIL. It asserted the report string did not contain
    // "DRY-RUN", and the report never contained that word in either case; a mutation check that
    // deleted `apply: true` left the whole suite green. The assertion now reads the flag the SDK
    // itself sets on the result, which is the only thing that distinguishes the two.
    const root = scratchRoot()

    // First sweep: the deliberate dry run (B-139). Second: the one that must actually apply.
    await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-03T12:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
    })
    const outcome = await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-05T12:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
    })

    expect(outcome.kind).toBe('ran')
    expect(
      outcome.kind === 'ran' && outcome.dryRun,
      'the automatic sweep ran as a DRY RUN — it would report removals forever and remove nothing',
    ).toBe(false)
  })

  it('test_an_applying_sweep_does_not_announce_itself_as_a_dry_run', async () => {
    // B-132's bullet, extended: "0 removed because there was nothing" and "0 removed because I did
    // not actually remove" are different facts and must not read identically. Checked on the SECOND
    // sweep, since the first says DRY RUN on purpose.
    const root = scratchRoot()
    const reports: string[] = []

    await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-03T12:00:00Z'),
      onReport: () => {},
      projectsRootOverride: root,
    })
    await collectSessionsAutomatically({
      enabled: true,
      now: new Date('2026-09-05T12:00:00Z'),
      onReport: (line) => reports.push(line),
      projectsRootOverride: root,
    })

    expect(reports.join(' ').toLowerCase()).not.toContain('dry')
  })
})
