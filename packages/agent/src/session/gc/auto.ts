import type { AllPlan, AllResult } from './all-sessions.js'

/**
 * B-131 / B-132 — the trigger the collector never had.
 *
 * Everything else was already here and already careful: `DEFAULT_WINDOW_DAYS = 30` with
 * `FLOOR_DAYS = 1` and a refusal below it, a 200 000-operation budget sized from a MEASURED ~2.54
 * operations per project over a MEASURED 13 269-project tree, a plan/apply split with a dry run, and
 * an UNDETERMINED-is-KEPT fail-safe on the only path in this product that deletes a user's data.
 *
 * What was missing was that anything ever called it. `sessions gc` is an explicit CLI action
 * (`packages/cli/src/commands/sessions.ts:151`), so between two manual runs the tree only grew, and
 * a human was the scheduler for a procedure whose steps never change — which is the SRE source's
 * definition of toil, and its advice is to remove it rather than measure it.
 *
 * This module is the trigger and nothing else. Planning, deleting, budgeting, the floor and the
 * fail-safe are INJECTED: a second implementation of the delete path is the last thing this
 * repository needs, and the tests assert delegation rather than behaviour that would have to be
 * duplicated to be checked.
 *
 * Two properties are load-bearing:
 *
 * It never throws. This runs beside a user's session, and housekeeping that can take the agent down
 * is worse than housekeeping that does not happen. Failures are reported, not raised.
 *
 * It stamps the attempt BEFORE sweeping. Stamping afterwards means a sweep that fails every time
 * re-runs on every start, so one broken tree becomes a cost paid at every launch.
 */

export type AutoGcOutcome =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'too-soon'; readonly lastRun: Date }
  | {
      readonly kind: 'ran'
      readonly removed: number
      readonly errors: number
      /**
       * Whether the sweep was a DRY RUN — it planned removals and performed none.
       *
       * Surfaced because it is the difference between collecting and reporting collection forever,
       * and because without it that difference was UNOBSERVABLE: `runAllProjectsOnDisk` dry-runs
       * unless told `apply: true`, and a caller that forgot would produce a collector reporting
       * "0 removed" every day, green and useless. A mutation check proved the gap — deleting
       * `apply: true` from `auto-runtime.ts` left the entire suite passing, because the only test
       * watching for it read a report string that never contained the word in either case.
       */
      readonly dryRun: boolean
      /**
       * Whether this was the FIRST sweep — the one with no stamp on disk.
       *
       * The first is deliberately a dry run. `sessions gc` is dry-run by default
       * (`cli/src/runtime/args.ts:120`) and tells the operator to "re-run with --apply to delete";
       * that flag is a decision, not an accident. Turning collection on by default removed the
       * look-first property at the worst moment — the first run, when the backlog of old transcripts
       * is largest and nobody has yet seen what the policy would take.
       */
      readonly firstRun: boolean
    }
  | { readonly kind: 'failed'; readonly reason: string }

export interface AutoGcDeps {
  /** `session_gc` from the resolved config. */
  readonly enabled: boolean
  readonly now: Date
  /** How long to wait between sweeps. The retention window is measured in days; this is not a cron. */
  readonly intervalHours: number
  readonly readLastRun: () => Date | undefined
  readonly writeLastRun: (at: Date) => void
  readonly plan: () => Promise<AllPlan>
  /** `apply` is false on the first sweep — see `firstRun` on the outcome. */
  readonly run: (plan: AllPlan, apply: boolean) => Promise<AllResult>
  /**
   * Where the outcome goes.
   *
   * B-132's second bullet: "it ran and removed nothing" and "it never ran" are identical in a silent
   * system, and only one of them means the retention policy is being applied.
   */
  readonly onReport: (line: string) => void
}

const HOUR_MS = 60 * 60 * 1000

export async function maybeCollectSessions(deps: AutoGcDeps): Promise<AutoGcOutcome> {
  if (!deps.enabled) return { kind: 'disabled' }

  const lastRun = readLastRunSafely(deps)
  const firstRun = lastRun === undefined
  if (lastRun !== undefined) {
    const elapsedMs = deps.now.getTime() - lastRun.getTime()
    if (elapsedMs < deps.intervalHours * HOUR_MS) return { kind: 'too-soon', lastRun }
  }

  // Before the sweep, deliberately — see the note above on why the order matters.
  try {
    deps.writeLastRun(deps.now)
  } catch (err) {
    // A read-only state directory must not mean the policy stops being applied; it means the
    // interval is not remembered, which is the smaller of the two problems.
    deps.onReport(`[sessions gc] could not record the run time: ${reasonOf(err)}`)
  }

  try {
    const plan = await deps.plan()
    const result = await deps.run(plan, !firstRun)
    const verb = result.dryRun ? 'would remove' : 'removed'
    const preface = firstRun
      ? '[sessions gc] first automatic sweep — DRY RUN, nothing was removed. ' +
        'The next one will apply; set `session_gc = false` to keep collection manual.'
      : '[sessions gc] automatic sweep'
    deps.onReport(
      `${preface} — ${String(result.removed.length)} ${verb}, ` +
        `${String(result.errors.length)} error(s)`,
    )
    return {
      kind: 'ran',
      removed: result.removed.length,
      errors: result.errors.length,
      dryRun: result.dryRun,
      firstRun,
    }
  } catch (err) {
    const reason = reasonOf(err)
    deps.onReport(`[sessions gc] automatic sweep failed: ${reason}`)
    return { kind: 'failed', reason }
  }
}

/** A stamp that cannot be read is the same as no stamp: sweep, rather than refuse to. */
function readLastRunSafely(deps: AutoGcDeps): Date | undefined {
  try {
    const at = deps.readLastRun()
    return at !== undefined && !Number.isNaN(at.getTime()) ? at : undefined
  } catch {
    return undefined
  }
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
