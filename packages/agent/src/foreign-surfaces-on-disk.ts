/**
 * B-175 — count what `.claude/` holds, so `doctor` stops being silent about it.
 *
 * MEASURED 2026-09-15 in a consumer: `.claude/agents/` held 139 files and the whole report named
 * none of them. Fourteen checks ran and not one was about the agent definitions being loaded.
 *
 * The positive control is what made that a gap rather than a guess about intent: `skills-on-disk`
 * beside this file already reports the foreign root — "91 under .claude/skills/, loaded by the
 * compatibility dialect without a config line". The report can speak about these surfaces and did
 * not, so these were missing checks and not a principle that diagnostics stay in the native root.
 *
 * Counting rather than asserting presence, because a directory somebody created and a tree of 139
 * definitions must not read alike to an operator deciding whether their configuration took effect.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { ForeignSurface } from './doctor/doctor.js'

/**
 * The surfaces this product has a relationship with, and which one it is.
 *
 * `skills` is deliberately absent: `skills-on-disk` reports it against the DECLARED list, which is
 * a question a counter cannot ask, and two answers to one question eventually disagree.
 *
 * The installed kit's own directories — `mechanisms`, `records`, `session-state`, `squad` — are
 * absent for the opposite reason: this product neither reads nor refuses them, so it has nothing
 * to report, and a row about them would crowd out the four it does act on.
 */
const SURFACES: readonly ForeignSurface['dir'][] = [
  'agents',
  'commands',
  'agent-memory',
  'workflows',
]

/** `workflows` is the one this product refuses; the rest it reads. */
const REFUSED = new Set(['workflows'])

/** Files at any depth, because `agent-memory/<agent>/MEMORY.md` is one level down. */
function countFiles(dir: string): number {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true }))
    if (entry.isFile()) n += 1
  return n
}

/**
 * What the foreign root holds, one entry per surface that actually has files.
 *
 * An absent root, an absent surface and an empty one all yield nothing: none of the three is a
 * finding, and reporting them would make the rows that matter harder to see.
 */
export function foreignSurfacesOnDisk(cwd: string): ForeignSurface[] {
  const found: ForeignSurface[] = []
  for (const dir of SURFACES) {
    const path = join(cwd, '.claude', dir)
    if (!existsSync(path)) continue
    const files = countFiles(path)
    if (files === 0) continue
    found.push({ dir, files, state: REFUSED.has(dir) ? 'refused' : 'read' })
  }
  return found
}
