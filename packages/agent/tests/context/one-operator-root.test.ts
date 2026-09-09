/**
 * B-171 — config and instructions must resolve from ONE operator root.
 *
 * Measured before the fix, with the two functions extracted verbatim: `THEOKIT_HOME=/srv/state` and
 * `home=/home/op` gave config `/srv/state` and rules `/home/op/.theokit/rules`. One build, two roots,
 * nothing reported.
 *
 * `homeStateDir` returns the env value verbatim, so the state dir may be anywhere; `userRuleRoots`
 * then dropped it whenever `relative(home, …)` came out absolute or started with `..`. Neither is
 * wrong alone — the guard exists because `loadInstructionTree` joins root NAMES against a base, and
 * `join('/home/op', '/srv/state/rules')` is `/home/op/srv/state/rules`. Following the root means
 * loading it as a base of its own, not deleting the guard.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadUserRules } from '../../src/context/rules.js'
import { userSkills } from '../../src/context/user-skills.js'

const realStateDir = process.env.THEOKIT_HOME

afterEach(() => {
  if (realStateDir === undefined) delete process.env.THEOKIT_HOME
  else process.env.THEOKIT_HOME = realStateDir
})

const silent = () => {}

function ruleAt(root: string, marker: string): void {
  mkdirSync(join(root, 'rules'), { recursive: true })
  writeFileSync(join(root, 'rules', 'r.md'), `# R\n\n${marker}\n`)
}

describe('the rules follow the state directory the operator configured', () => {
  it('test_rules_follow_a_state_dir_outside_the_home', () => {
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    const outside = mkdtempSync(join(tmpdir(), 'b171-state-'))
    ruleAt(outside, 'MARKER-FROM-THE-CONFIGURED-STATE-DIR')
    process.env.THEOKIT_HOME = outside

    expect(
      loadUserRules(home, silent).text,
      'config reads $THEOKIT_HOME and the rules did not, so one build served two operator roots',
    ).toContain('MARKER-FROM-THE-CONFIGURED-STATE-DIR')
  })

  it('test_with_no_state_dir_configured_the_home_roots_still_load', () => {
    // Anti-vacuity, and a compatibility guarantee: following the configured root must not stop the
    // default one from loading. Without this, deleting the whole lookup would pass the test above.
    delete process.env.THEOKIT_HOME
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    ruleAt(join(home, '.theokit'), 'MARKER-FROM-THE-DEFAULT-ROOT')

    expect(loadUserRules(home, silent).text).toContain('MARKER-FROM-THE-DEFAULT-ROOT')
  })
})

describe('the skills follow the same state directory', () => {
  function skillAt(root: string, name: string): void {
    const dir = join(root, 'skills', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: operator skill\n---\n\nBody.\n`)
  }

  it('test_skills_follow_a_state_dir_outside_the_home', async () => {
    // `user-skills.ts` joined `.theokit` to the home and never asked `homeStateDir`. Under the
    // SUPPORTED `home_dir = .claude`, a reviewer measured rules reading both roots, AGENTS.md
    // following `.claude`, and skills reading only `.theokit/skills` — silently, which is the part
    // that makes it worth a test rather than a comment.
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    const outside = mkdtempSync(join(tmpdir(), 'b171-state-'))
    skillAt(outside, 'from-the-configured-root')
    process.env.THEOKIT_HOME = outside

    const names = (await userSkills(home)).map((s) => s.name)

    expect(names, 'the skills ignored the configured state dir').toContain('from-the-configured-root')
  })

  it('test_with_no_state_dir_configured_the_default_skills_root_still_loads', async () => {
    delete process.env.THEOKIT_HOME
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    skillAt(join(home, '.theokit'), 'from-the-default-root')

    const names = (await userSkills(home)).map((s) => s.name)

    expect(names).toContain('from-the-default-root')
  })
})
