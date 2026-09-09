/**
 * B-171, second attempt — rules follow the state directory config already follows.
 *
 * The finding is real and was measured in isolation: `THEOKIT_HOME=/srv/state` with `home=/home/op`
 * gave config `/srv/state` and rules `/home/op/.theokit/rules`. One build, two operator roots.
 *
 * The FIRST attempt (`f51f69c`, reversed by `97a8358`) assembled each base and merged the results,
 * which defeated the 64,000-char prompt ceiling — 126,012 chars with `truncated: false`, measured by
 * a reviewer. This one collects blocks from both bases and assembles ONCE, so the ceiling applies to
 * everything that reaches the prompt, which is what it is a ceiling OF.
 *
 * The skills half of that attempt is NOT repeated. `user-skills.ts` deliberately does not read
 * `~/.claude/skills/`, says so, and is backed by two sibling files; routing it through the state dir
 * imported another kit's corpus and dropped the operator's own.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadUserRules } from '../../src/context/rules.js'

const realStateDir = process.env.THEOKIT_HOME

afterEach(() => {
  if (realStateDir === undefined) delete process.env.THEOKIT_HOME
  else process.env.THEOKIT_HOME = realStateDir
})

const silent = () => {}

function ruleAt(root: string, name: string, body: string): void {
  mkdirSync(join(root, 'rules'), { recursive: true })
  writeFileSync(join(root, 'rules', name), `# R\n\n${body}\n`)
}

describe('the rules follow the state directory the operator configured', () => {
  it('test_rules_follow_a_state_dir_outside_the_home', () => {
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    const outside = mkdtempSync(join(tmpdir(), 'b171-state-'))
    ruleAt(outside, 'r.md', 'MARKER-FROM-THE-CONFIGURED-STATE-DIR')
    process.env.THEOKIT_HOME = outside

    expect(
      loadUserRules(home, silent).text,
      'config reads $THEOKIT_HOME and the rules did not, so one build served two operator roots',
    ).toContain('MARKER-FROM-THE-CONFIGURED-STATE-DIR')
  })

  it('test_the_default_root_is_still_read_when_a_state_dir_is_configured', () => {
    // The first attempt could have returned ONLY the configured root and passed the test above.
    // This is what makes following the configured root additive rather than a replacement.
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    const outside = mkdtempSync(join(tmpdir(), 'b171-state-'))
    ruleAt(join(home, '.theokit'), 'a.md', 'MARKER-FROM-THE-DEFAULT-ROOT')
    ruleAt(outside, 'b.md', 'MARKER-FROM-THE-CONFIGURED-STATE-DIR')
    process.env.THEOKIT_HOME = outside

    const load = loadUserRules(home, silent)

    expect(load.text).toContain('MARKER-FROM-THE-DEFAULT-ROOT')
    expect(load.text).toContain('MARKER-FROM-THE-CONFIGURED-STATE-DIR')
    expect(load.read, 'both roots were read, so both must be counted').toBe(2)
  })

  it('test_the_prompt_ceiling_still_applies_across_both_roots', () => {
    // The BLOCKER that reversed the first attempt. Each root fits alone; together they must not
    // exceed the ceiling silently. `truncated` is what `/status` reports, so a merge that loses it
    // reports "N loaded" while a rule file was dropped.
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    const outside = mkdtempSync(join(tmpdir(), 'b171-state-'))
    const big = 'x'.repeat(40_000)
    ruleAt(join(home, '.theokit'), 'a.md', big)
    ruleAt(outside, 'b.md', big)
    process.env.THEOKIT_HOME = outside

    const load = loadUserRules(home, silent)

    expect(load.text.length, 'the merged corpus exceeded the prompt ceiling').toBeLessThanOrEqual(64_000)
    expect(load.truncated, 'a block was dropped and nothing said so').toBe(true)
    expect(load.kept, 'kept must describe the text that survived').toBe(load.text.length)
  })

  it('test_with_no_state_dir_configured_the_home_roots_still_load', () => {
    delete process.env.THEOKIT_HOME
    const home = mkdtempSync(join(tmpdir(), 'b171-home-'))
    ruleAt(join(home, '.theokit'), 'r.md', 'MARKER-FROM-THE-DEFAULT-ROOT')

    expect(loadUserRules(home, silent).text).toContain('MARKER-FROM-THE-DEFAULT-ROOT')
  })
})
