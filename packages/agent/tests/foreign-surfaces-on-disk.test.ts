/**
 * What the foreign root holds, counted, so `doctor` can say it.
 *
 * MEASURED 2026-09-15 in this repository, by listing `.claude/*` and holding each directory against
 * the report. Eleven directories held files; three were named (`skills`, `rules`, `hooks`) and eight
 * were not. Four of the eight are surfaces this product has a relationship with:
 *
 *     agents        139 files, read      commands     5 files, read
 *     agent-memory    1 file,  read      workflows    1 file,  REFUSED
 *
 * The other four — `mechanisms`, `records`, `session-state`, `squad` — are the installed kit's own
 * machinery and output. This product neither reads nor refuses them; it has no opinion about them
 * at all, and a row about a directory nobody claims to act on is noise that makes the four that
 * matter harder to see.
 *
 * ## Why `skills` is deliberately absent
 *
 * `skills-on-disk` already reports it, and asks a better question: it holds the DECLARED list
 * against the disk, which a counter cannot do. Adding it here would be two answers to one question,
 * and the two would eventually disagree.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { foreignSurfacesOnDisk } from '../src/foreign-surfaces-on-disk.js'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'theocode-foreign-surfaces-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const surface = (dir: string, names: readonly string[]): void => {
  const d = join(root, '.claude', dir)
  mkdirSync(d, { recursive: true })
  for (const n of names) writeFileSync(join(d, n), 'x')
}

describe('counting what the foreign root holds', () => {
  it('test_a_populated_surface_is_counted_and_marked_read', () => {
    surface('agents', ['a.md', 'b.md'])
    expect(foreignSurfacesOnDisk(root)).toEqual([{ dir: 'agents', files: 2, state: 'read' }])
  })

  it('test_workflows_is_marked_refused_not_read', () => {
    // The distinction the row exists to preserve. `.claude/workflows/*.js` is REFUSED by the
    // loader; counting it beside the read surfaces without its state would present a refusal as a
    // capability, which is the accepted-and-ignored failure arriving through the diagnostic.
    surface('workflows', ['probe.js'])
    expect(foreignSurfacesOnDisk(root)).toEqual([{ dir: 'workflows', files: 1, state: 'refused' }])
  })

  it('test_an_absent_surface_yields_no_entry', () => {
    expect(foreignSurfacesOnDisk(root)).toEqual([])
  })

  it('test_an_empty_directory_yields_no_entry', () => {
    // A directory somebody created and never filled says nothing about what loads.
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true })
    expect(foreignSurfacesOnDisk(root)).toEqual([])
  })

  it('test_the_kits_own_directories_are_not_counted', () => {
    for (const d of ['mechanisms', 'records', 'squad', 'session-state']) surface(d, ['f.txt'])
    expect(foreignSurfacesOnDisk(root)).toEqual([])
  })

  it('test_skills_is_left_to_the_check_that_asks_a_better_question', () => {
    surface('skills', ['one.md'])
    expect(foreignSurfacesOnDisk(root)).toEqual([])
  })

  it('test_a_file_one_level_down_is_counted', () => {
    // `.claude/agent-memory/<agent>/MEMORY.md` is nested, so a shallow count would report the
    // surface as empty on exactly the layout the reference prescribes.
    const d = join(root, '.claude', 'agent-memory', 'researcher')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'MEMORY.md'), 'note')
    expect(foreignSurfacesOnDisk(root)).toEqual([{ dir: 'agent-memory', files: 1, state: 'read' }])
  })

  it('test_a_missing_foreign_root_is_not_an_error', () => {
    // The common case for a project that never adopted the dialect. Throwing here would make
    // `doctor` fail on an install that is working exactly as intended.
    expect(() => foreignSurfacesOnDisk(join(root, 'nowhere'))).not.toThrow()
  })
  it('test_an_audit_trail_subdirectory_is_not_counted_as_an_agent', () => {
    // MEASURED 2026-09-15 in this repository, and the reason the count follows each loader rather
    // than walking the tree: `.claude/agents/` held 139 files and 17 definitions. The other 122 sat
    // in `review-*/` subdirectories — per-review audit trails, which the kit's own `cycle-review.md`
    // says belong under `records/` precisely because "mixing the two put a run's trail where a
    // reader looks for a roster".
    //
    // A row reporting 139 would have repeated that mistake inside the diagnostic, and an operator
    // reading it would believe their roster was eight times its real size. `listSubagents` reads
    // `.md` at the top level over a flat `readdirSync`; this counts what it would take.
    surface('agents', ['real-one.md', 'real-two.md'])
    const trail = join(root, '.claude', 'agents', 'review-something-2026-09-09')
    mkdirSync(trail, { recursive: true })
    for (const n of ['a.md', 'b.md', 'c.md']) writeFileSync(join(trail, n), 'trail')
    expect(foreignSurfacesOnDisk(root)).toEqual([{ dir: 'agents', files: 2, state: 'read' }])
  })

  it('test_a_non_markdown_file_beside_the_definitions_is_not_counted', () => {
    // A README or a stray `.json` in the directory is not a subagent, and the loader skips it.
    surface('agents', ['real.md', 'README.txt', 'notes.json'])
    expect(foreignSurfacesOnDisk(root)).toEqual([{ dir: 'agents', files: 1, state: 'read' }])
  })

  it('test_an_agent_memory_directory_without_a_memory_file_is_not_counted', () => {
    // An empty `<agent>/` under `agent-memory/` is an agent that has written nothing yet, which is
    // an ordinary first run and not a configured memory.
    mkdirSync(join(root, '.claude', 'agent-memory', 'silent'), { recursive: true })
    expect(foreignSurfacesOnDisk(root)).toEqual([])
  })
})
