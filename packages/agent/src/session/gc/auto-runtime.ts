import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { projectsRoot } from '@theokit/agents/session'

import { maybeCollectSessions, type AutoGcOutcome } from './auto.js'
import { planAllProjectsOnDisk, runAllProjectsOnDisk } from './filesystem.js'

/**
 * The real wiring for B-131 / B-132: a stamp on disk, and the collector that already existed.
 *
 * Split from `auto.ts` on purpose. The decision — is it enabled, is it due, what is reported, what
 * happens when it fails — is pure and heavily tested there. This file is the part that touches the
 * filesystem and the module graph, and it is deliberately thin enough to read in one screen.
 */

/** At most once a day. The retention window is measured in days; a shorter interval buys nothing. */
const DEFAULT_INTERVAL_HOURS = 24

/**
 * Beside the projects tree rather than inside it.
 *
 * `listProjectDirs` filters to directories, so a dotfile inside the root would be ignored today —
 * but "today" is the wrong thing to rely on for a file that sits in the middle of the one path that
 * deletes user data. One level up is unambiguous.
 */
function stampPath(root: string): string {
  return join(dirname(root), '.last-session-gc')
}

function readLastRun(root: string): Date | undefined {
  const path = stampPath(root)
  if (!existsSync(path)) return undefined
  const at = new Date(readFileSync(path, 'utf8').trim())
  return Number.isNaN(at.getTime()) ? undefined : at
}

function writeLastRun(root: string, at: Date): void {
  const path = stampPath(root)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${at.toISOString()}\n`)
}

export interface AutoCollectOptions {
  /** `session_gc` from the resolved config. */
  readonly enabled: boolean
  readonly onReport: (line: string) => void
  /** Tests override these; production does not. */
  readonly now?: Date
  readonly projectsRootOverride?: string
  readonly intervalHours?: number
}

export async function collectSessionsAutomatically(
  opts: AutoCollectOptions,
): Promise<AutoGcOutcome> {
  const root = opts.projectsRootOverride ?? projectsRoot()

  return maybeCollectSessions({
    enabled: opts.enabled,
    now: opts.now ?? new Date(),
    intervalHours: opts.intervalHours ?? DEFAULT_INTERVAL_HOURS,
    readLastRun: () => readLastRun(root),
    writeLastRun: (at) => {
      writeLastRun(root, at)
    },
    plan: () => planAllProjectsOnDisk({ projectsRoot: root }),
    // `apply` is the whole difference between collecting and reporting: `runAllProjectsOnDisk` is a
    // DRY RUN unless told otherwise, so hard-coding false would produce a sweep that reports
    // removals every day and never removes anything — green, silent and useless (B-138).
    //
    // It comes from `maybeCollectSessions`, which passes false for the FIRST sweep only, so the
    // operator sees what the policy would take before it takes it (B-139).
    run: (plan, apply) => runAllProjectsOnDisk(plan, { apply, projectsRoot: root }),
    onReport: opts.onReport,
  })
}
