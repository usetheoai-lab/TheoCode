import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_HOME_DIR } from './config/home-dir.js'

/** The project roots a skill may live under, in the order `#72` established for the other surfaces. */
const ROOTS = [DEFAULT_HOME_DIR, '.claude'] as const

export interface SkillsOnDisk {
  /** Declared in configuration, with no `SKILL.md` under any root. */
  readonly declaredButAbsent: readonly string[]
  /** A `SKILL.md` on disk that no configuration names, so nothing loads it. */
  readonly presentButUndeclared: readonly string[]
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
 * The two directions are reported apart because they have different remedies: one is a name to
 * delete or a file to write, the other is a line to add. Collapsing them into "skills disagree"
 * would leave the reader to work out which.
 *
 * This answers ONLY what is on disk. Whether a skill that exists is WIRED is the trust gate's
 * question, and it is already reported — folding them together would produce a row that is wrong in
 * a new way, which is the failure mode this whole check exists to end.
 */
export function skillsOnDisk(cwd: string, declared: readonly string[]): SkillsOnDisk {
  const onDisk = new Set(ROOTS.flatMap((root) => skillNamesIn(join(cwd, root, 'skills'))))
  const named = new Set(declared)
  return {
    declaredButAbsent: [...named].filter((name) => !onDisk.has(name)).sort(),
    presentButUndeclared: [...onDisk].filter((name) => !named.has(name)).sort(),
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
