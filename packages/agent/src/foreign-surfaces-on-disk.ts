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
const SURFACES: readonly {
  readonly dir: ForeignSurface['dir']
  readonly state: ForeignSurface['state']
  /** Counts what the surface's own loader would take, never every file under the directory. */
  readonly count: (dir: string) => number
}[] = [
  // `.md` at the TOP level only, which is what `listSubagents` reads — `if (!entry.endsWith('.md'))
  // continue`, over a flat `readdirSync`. MEASURED 2026-09-15 and this is why the distinction is
  // not pedantic: `.claude/agents/` held 139 files here and 17 definitions. The other 122 were
  // per-review audit trails in `review-*/` subdirectories, which the kit's own `cycle-review.md`
  // says belong under `records/` precisely because "mixing the two put a run's trail where a reader
  // looks for a roster". A row reporting 139 agents would have repeated that mistake in the
  // diagnostic, and an operator reading it would believe their roster was eight times its size.
  { dir: 'agents', state: 'read', count: (d) => topLevel(d, '.md') },
  { dir: 'commands', state: 'read', count: (d) => topLevel(d, '.md') },
  // One per agent, at `<agent>/MEMORY.md` — the layout the reference prescribes, so a top-level
  // count would report every configured memory as absent.
  { dir: 'agent-memory', state: 'read', count: (d) => memories(d) },
  // REFUSED, and counted so the refusal is visible rather than implied by an absent row.
  { dir: 'workflows', state: 'refused', count: (d) => topLevel(d, '.js') },
]

/** Entries directly in `dir` with the given extension — no recursion, like the loaders. */
function topLevel(dir: string, ext: string): number {
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(ext))
    .length
}

/** One per `<agent>/MEMORY.md`. */
function memories(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && existsSync(join(dir, e.name, 'MEMORY.md')),
  ).length
}

/**
 * What the foreign root holds, one entry per surface that actually has files.
 *
 * An absent root, an absent surface and an empty one all yield nothing: none of the three is a
 * finding, and reporting them would make the rows that matter harder to see.
 */
export function foreignSurfacesOnDisk(cwd: string): ForeignSurface[] {
  const found: ForeignSurface[] = []
  for (const surface of SURFACES) {
    const path = join(cwd, '.claude', surface.dir)
    if (!existsSync(path)) continue
    const files = surface.count(path)
    if (files === 0) continue
    found.push({ dir: surface.dir, files, state: surface.state })
  }
  return found
}
