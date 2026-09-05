/**
 * #67 — a green tick for a skill that is not there, and silence about one that is.
 *
 * `theocode doctor` reports the skills row from the DECLARED list in configuration. Nothing compares
 * it with the disk, so both directions are wrong and neither says so. Measured on the built binary:
 *
 *     config declares ["exists","ghost"], only `exists` has a SKILL.md
 *       →  ✓ skills: exists, ghost
 *
 *     a SKILL.md on disk, declared nowhere
 *       →  ✓ skills: daily-briefing      (the default value, which exists nowhere either)
 *
 * The first is a capability advertised and absent — the shape this repository has fixed three times.
 * The second is the documented way to create a skill doing nothing, silently: the panel shows a
 * phantom and hides the real file.
 *
 * This module answers only what is on disk. Whether a found skill is WIRED is a separate question the
 * trust gate already answers, and conflating them would produce a row that is wrong in a new way.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { skillsOnDisk } from './skills-on-disk.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'theocode-skills-'))
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function write(root: string, name: string): void {
  mkdirSync(join(cwd, root, 'skills', name), { recursive: true })
  writeFileSync(join(cwd, root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\nbody\n`)
}

describe('#67 — declared against what is on disk', () => {
  it('test_a_declared_skill_with_no_file_is_named', () => {
    write('.theokit', 'exists')

    expect(skillsOnDisk(cwd, ['exists', 'ghost']).declaredButAbsent).toEqual(['ghost'])
  })

  it('test_a_file_declared_nowhere_is_named_too', () => {
    // The other direction, and the one the documented instructions produce: create the file, forget
    // the config line, and nothing anywhere says the skill is inert.
    write('.theokit', 'undeclared')

    expect(skillsOnDisk(cwd, []).presentButUndeclared).toEqual(['undeclared'])
  })

  it('test_the_foreign_root_counts_as_present', () => {
    // `.claude/skills/` is read since #72, so a skill living only there is NOT missing.
    write('.claude', 'foreign')

    const found = skillsOnDisk(cwd, ['foreign'])
    expect(found.declaredButAbsent).toEqual([])
    expect(found.presentButUndeclared).toEqual([])
  })

  it('test_a_matching_pair_reports_nothing', () => {
    // Anti-vacuity: a function that always returned names would satisfy the cases above.
    write('.theokit', 'exists')

    expect(skillsOnDisk(cwd, ['exists'])).toEqual({
      declaredButAbsent: [],
      presentButUndeclared: [],
    })
  })

  it('test_a_directory_without_a_SKILL_md_is_not_a_skill', () => {
    // An empty folder under `skills/` is a half-finished skill, and calling it present would send
    // the reader looking for a defect in a file that was never written.
    mkdirSync(join(cwd, '.theokit', 'skills', 'hollow'), { recursive: true })

    expect(skillsOnDisk(cwd, ['hollow']).declaredButAbsent).toEqual(['hollow'])
  })

  it('test_no_skills_anywhere_is_not_an_error', () => {
    expect(skillsOnDisk(cwd, [])).toEqual({ declaredButAbsent: [], presentButUndeclared: [] })
  })
})
