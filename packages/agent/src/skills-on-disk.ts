import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_HOME_DIR } from './config/home-dir.js'

/** The project roots a skill may live under, in the order `#72` established for the other surfaces. */
const ROOTS = [DEFAULT_HOME_DIR, '.claude'] as const

/**
 * The root a skill written FOR this product lives under.
 *
 * Only this one can be missing a config line, so only this one is searched for the undeclared
 * direction — see the note on `presentButUndeclared` below.
 */
const NATIVE_ROOT = DEFAULT_HOME_DIR

export interface SkillsOnDisk {
  /** Declared in configuration, with no `SKILL.md` under any root — the operator's included. */
  readonly declaredButAbsent: readonly string[]
  /**
   * A `SKILL.md` under this product's OWN project root that no configuration names, so nothing
   * loads it.
   *
   * The foreign root is deliberately excluded. Dogfooded on this repository 2026-09-05:
   * `.claude/skills/` held forty entries installed by a Claude Code kit and `.theokit/skills/` was
   * empty, so this list named thirty-nine skills belonging to another tool. Each entry was true and
   * the row was useless — and `rules/english-only.md` states the cost of that in this project's own
   * words: the first thing anyone does with a noisy gate is turn it off.
   *
   * The line is drawn by the REMEDY, not by the root. "Add a config line" is the fix for a skill
   * someone wrote for this product and forgot to declare. Said about another tool's inventory, the
   * same sentence is an instruction to adopt it.
   */
  readonly presentButUndeclared: readonly string[]
  /**
   * Declared, and on disk ONLY under the operator's own root — where nothing reads it (`#65`).
   *
   * Its own field rather than a member of `declaredButAbsent`, because the remedy is the opposite
   * one: that list asks for a file to be written, and this file exists. Merging them would send the
   * reader to create what they already created.
   */
  readonly declaredUserOnlySoNotLoaded: readonly string[]
}

/**
 * What configuration claims about skills, held against what is on disk (#67).
 *
 * `theocode doctor` reported its skills row from the DECLARED list alone, so both directions were
 * wrong and neither said so. Measured on the built binary: a configuration naming `exists` and
 * `ghost`, with only the first on disk, produced `✓ skills: exists, ghost` — a green tick for a
 * capability that is not there. And a real `SKILL.md` created the documented way, with the config
 * line forgotten, produced `✓ skills: daily-briefing` — the default value, which exists nowhere
 * either, while the actual file went unmentioned.
 *
 * The directions are reported apart because they have different remedies: a name to delete, a file
 * to write, a config line to add. Collapsing them into "skills disagree" would leave the reader to
 * work out which.
 *
 * ## Why the operator's root is searched but never counted as present
 *
 * Measured 2026-09-05, with the same file copied into the project as a positive control: a skill at
 * `~/.theokit/skills/<name>/SKILL.md`, declared in config, leaves the model with no skill tool at
 * all, while the project copy answers. `@theokit/sdk@5.0.1` builds every skill root from `cwd`
 * (`SkillsCapability.refresh`), so the operator's root contributes nothing to the resolver.
 *
 * Ignoring that root produced a diagnostic that named a FALSE cause — "declared with no SKILL.md"
 * over a file that is there. Counting it as present would produce the opposite failure, and the
 * worse one: a green tick over a skill that does not load. So it is found, and reported as what it
 * is.
 *
 * This answers ONLY what is on disk. Whether a skill that exists is WIRED is the trust gate's
 * question, and it is already reported — folding them together would produce a row that is wrong in
 * a new way, which is the failure mode this whole check exists to end.
 */
export function skillsOnDisk(
  cwd: string,
  declared: readonly string[],
  home: string = homedir(),
): SkillsOnDisk {
  const inProject = new Set(ROOTS.flatMap((root) => skillNamesIn(join(cwd, root, 'skills'))))
  const inNativeRoot = new Set(skillNamesIn(join(cwd, NATIVE_ROOT, 'skills')))
  const inUserRoot = new Set(skillNamesIn(join(home, DEFAULT_HOME_DIR, 'skills')))
  const named = new Set(declared)
  return {
    declaredButAbsent: [...named]
      .filter((name) => !inProject.has(name) && !inUserRoot.has(name))
      .sort(),
    // This product's own project root only. "Declare it and it loads" is false under the operator's
    // root (nothing reads it) and wrong under the foreign one (it is another tool's inventory), so
    // neither is offered a remedy that does not fit it.
    presentButUndeclared: [...inNativeRoot].filter((name) => !named.has(name)).sort(),
    declaredUserOnlySoNotLoaded: [...named]
      .filter((name) => inUserRoot.has(name) && !inProject.has(name))
      .sort(),
  }
}

/**
 * The skill names under one directory.
 *
 * A folder without a `SKILL.md` is NOT a skill: an empty `skills/half-written/` is a skill someone
 * started, and calling it present would send a reader hunting for a defect in a file nobody wrote.
 */
function skillNamesIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries.filter((name) => existsSync(join(dir, name, 'SKILL.md')))
}
