/**
 * Which root this product claims on its own, and which it refuses to.
 *
 * The claim cannot be unconditional or it would claim `.claude` the moment an operator points us
 * there, defeating the marker entirely. It cannot be absent either: every existing installation has
 * a `~/.theokit/projects` full of our transcripts and no marker, and refusing those would turn
 * retention off for everyone on upgrade — the silent non-collection this whole line of work is
 * about, delivered by the fix for it.
 *
 * So the rule is historical rather than clever: the BUILT-IN DEFAULT root is ours by fact, and
 * anything else has to be claimed deliberately by whoever pointed us at it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { builtInDefaultRoot, claimDefaultRoot } from './root-claim.js'
import { rootIsOurs } from './root-ownership.js'

const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

function scratch(): { projects: string } {
  const base = mkdtempSync(join(tmpdir(), 'theocode-claim-'))
  roots.push(base)
  const projects = join(base, 'projects')
  mkdirSync(projects, { recursive: true })
  return { projects }
}

describe('claimDefaultRoot', () => {
  it('test_the_default_root_is_claimed_so_an_upgrade_keeps_collecting', () => {
    // The migration case, and the one that matters most: an installation that predates the marker.
    const { projects } = scratch()

    claimDefaultRoot(projects, projects)

    expect(rootIsOurs(projects)).toBe(true)
  })

  it('test_a_root_the_operator_pointed_us_at_is_not_claimed_for_them', () => {
    // The `.claude` case. Consent is theirs to give, and giving it on their behalf is exactly what
    // the marker exists to prevent.
    const { projects } = scratch()
    const elsewhere = scratch().projects

    claimDefaultRoot(elsewhere, projects)

    expect(rootIsOurs(elsewhere)).toBe(false)
  })

  it('test_an_already_claimed_root_stays_claimed', () => {
    const { projects } = scratch()
    claimDefaultRoot(projects, projects)
    claimDefaultRoot(projects, projects)

    expect(rootIsOurs(projects)).toBe(true)
  })

  it('test_a_foreign_marker_is_never_overwritten', () => {
    // Anti-vacuity in the safe direction: claiming must not be a way to take a root from whoever
    // marked it first, even when it is the default path.
    const { projects } = scratch()
    writeFileSync(join(dirname(projects), '.theocode-collector.json'), '{"product":"other"}')

    claimDefaultRoot(projects, projects)

    expect(rootIsOurs(projects)).toBe(false)
  })

  it('test_the_default_is_the_BUILT_IN_path_and_not_whatever_the_environment_says', () => {
    // The bug this file could not see. `claimDefaultRoot(root, projectsRoot())` compares a value
    // with ITSELF, because projectsRoot() already honours THEOKIT_HOME — so every root an operator
    // pointed us at was claimed, which is the one thing the marker exists to prevent.
    //
    // Every test above passed both arguments explicitly and was blind to it. It was caught by running
    // the built binary against a scratch home, which claimed the scratch directory on the spot and
    // left a marker there.
    const home = '/somewhere/else'

    expect(builtInDefaultRoot(home)).toBe(join(home, '.theokit', 'projects'))
    expect(builtInDefaultRoot(home)).not.toContain('scratch')
  })

  it('test_a_root_that_merely_looks_like_the_default_of_another_home_is_not_claimed', () => {
    // Anti-vacuity for the case above: the comparison must be against THIS home's built-in path.
    const { projects } = scratch()

    claimDefaultRoot(projects, builtInDefaultRoot('/somewhere/else'))

    expect(rootIsOurs(projects)).toBe(false)
  })
})
