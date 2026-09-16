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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  { dir: 'agents', state: 'read', count: (d) => definitions(d) },
  { dir: 'commands', state: 'read', count: (d) => definitions(d) },
  // One per agent, at `<agent>/MEMORY.md` — the layout the reference prescribes, so a top-level
  // count would report every configured memory as absent.
  //
  // `unread`, not `read`. MEASURED 2026-09-15: `applySubagentMemory` has no caller in this product
  // and the published `@theokit/agents` does not export it, so nothing here consumes these files.
  // Reporting `read` would tell an author their memory took effect when it did not — the
  // accepted-and-ignored failure this row exists to prevent, caused by the row itself. Flip it to
  // `read` in the same commit that wires the consumer, and not before.
  { dir: 'agent-memory', state: 'unread', count: (d) => memories(d) },
  // REFUSED, and counted so the refusal is visible rather than implied by an absent row.
  { dir: 'workflows', state: 'refused', count: (d) => topLevel(d, '.js') },
]

/** Entries directly in `dir` with the given extension — no recursion, like the loaders. */
function topLevel(dir: string, ext: string): number {
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(ext))
    .length
}

/**
 * Top-level `.md` files that OPEN WITH FRONTMATTER, which is what makes one loadable.
 *
 * MEASURED 2026-09-15 against the real directory, one layer finer than the `review-*` subdirectory
 * finding: 17 `.md` at the top level, 16 that the loader returns. The odd one is `README.md` —
 * documentation somebody left beside the roster, with no frontmatter, so nothing loads it.
 *
 * Counting it would have the row claim one agent that does not exist. That is the same defect as
 * claiming 122, differing only in being small enough to survive a glance — which makes it the more
 * durable of the two.
 *
 * Reading the first line rather than parsing the frontmatter: the question here is how many the
 * loader would take, and a file without the opening fence is not one of them. A full parse would
 * cost more and answer no better for a count.
 */
function definitions(dir: string): number {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    if (readFileSync(join(dir, entry.name), 'utf8').startsWith('---')) n += 1
  }
  return n
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
