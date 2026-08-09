/**
 * B-054 — the sweep's filesystem search is bounded ACROSS the run, not per project.
 *
 * `classifyDirectory` falls back to a depth-first search of the filesystem when no transcript
 * records a usable working directory. That fallback exists because `encodeProjectDir` is LOSSY —
 * `theokit-framework` and `theokit/framework` encode identically, so a project name cannot be
 * decoded back to a path and the directory has to be found by searching.
 *
 * Per project, 20 000 nodes is a reasonable ceiling. Measured on a real machine: `~/.theokit/projects`
 * holds 13 269 project directories; a 120-project sample resolves 91 through the cheap transcript
 * read and 29 have no transcript at all, so roughly 3 200 fall through to the search. At 20 000
 * nodes each that is ~64 million readdir/stat calls for one `--all-projects` run, and the command
 * never returns — measured, `timeout 25` kills it, and identically at b1611fc^ so it predates B-020.
 *
 * A ceiling that multiplies by the number of projects is not a ceiling.
 */
import { describe, expect, it } from 'vitest'

import { classifyDirectory, createDfsBudget } from '../liveness-oracle.js'

/** An IO whose filesystem is deep enough that any DFS will exhaust whatever budget it is given. */
function endlessTree(entriesPerDir = 1) {
  let listed = 0
  let stated = 0
  return {
    get listed() {
      return listed
    },
    /**
     * B-054 — the number that actually costs. `visitEntries` stats EVERY entry of every directory it
     * lists, so a directory with many children costs many syscalls and ONE popped node. Measured on
     * a real machine: 40 projects produced 87 `listEntries` and 547 019 `isDirectory` calls, because
     * the walk reaches `~/.theokit/projects` and stats all 13 269 of its entries — once per project.
     */
    get stated() {
      return stated
    },
    io: {
      listEntries: () => {
        listed += 1
        // `a` keeps the target's prefix so the walk descends; the rest are dead weight that still
        // has to be stat-ed, which is the shape of a real directory with many children.
        return ['a', ...Array.from({ length: entriesPerDir - 1 }, (_, i) => `filler${String(i)}`)]
      },
      isDirectory: () => {
        stated += 1
        return true
      },
      firstLine: () => '{}',
    } as never,
  }
}

/** A path the walk can always extend and never reach: 2 000 levels of `/a`. */
const TARGET = '-a'.repeat(2_000)

const OPTS = (budget?: ReturnType<typeof createDfsBudget>) =>
  ({
    projectsRoot: '/root/projects',
    maxDfsDepth: 100_000,
    maxDfsNodes: 500,
    ...(budget === undefined ? {} : { dfsBudget: budget }),
  }) as never

describe('B-054 — the search budget is shared by the whole sweep', () => {
  it('test_one_project_may_use_the_per_project_ceiling', () => {
    // Anti-vacuity floor: a shared budget that starves the FIRST project would be worse than the
    // defect, since a single-project `sessions gc` is the common case and works today.
    const tree = endlessTree()

    classifyDirectory(TARGET, tree.io, OPTS())

    expect(tree.listed, 'the single-project search stopped short of its own ceiling').toBeGreaterThan(
      100,
    )
  })

  it('test_a_sweep_of_many_projects_does_not_multiply_the_ceiling', () => {
    const tree = endlessTree()
    const budget = createDfsBudget(500)

    // Fifty projects, each of which would otherwise walk up to 500 nodes.
    const verdicts = Array.from({ length: 50 }, () =>
      classifyDirectory(TARGET, tree.io, OPTS(budget)),
    )

    expect(
      tree.listed,
      'the sweep walked the filesystem once per project — 50 projects consumed 50 ceilings, which ' +
        'is how 13 269 projects make the command never return',
    ).toBeLessThanOrEqual(600)

    // B-020 — what the sweep could not classify is UNDETERMINED, never DEAD. A project skipped for
    // budget is a project we did not look at, and `planOneProject` keeps those.
    expect(
      verdicts.filter((v) => v.state === 'DEAD'),
      'a project the sweep never searched was reported as dead, which is the deletion path',
    ).toEqual([])
    expect(verdicts.at(-1)?.state).toBe('UNDETERMINED')
  })
})

describe('B-054 — the ceiling counts the work that is actually done', () => {
  it('test_a_directory_with_many_children_is_charged_for_them', () => {
    // The budget used to be decremented once per POPPED DIRECTORY while `visitEntries` stat-ed every
    // entry of it. A ceiling of 500 "nodes" therefore permitted 500 x N syscalls, and N is 13 269
    // for `~/.theokit/projects` — the directory the walk reaches on the way to any project.
    //
    // Measured before the fix: 40 projects, 87 listEntries, 547 019 isDirectory. Projected to the
    // full sweep, ~181 million stat calls.
    const tree = endlessTree(1_000)
    const budget = createDfsBudget(500)

    classifyDirectory(TARGET, tree.io, OPTS(budget))

    expect(
      tree.stated,
      'the walk stat-ed far more entries than its ceiling allowed, because the ceiling counted ' +
        'directories rather than the entries inside them',
    ).toBeLessThanOrEqual(2_000)
  })
})
