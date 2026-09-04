import { homedir } from 'node:os'
import { join } from 'node:path'

import { rootIsOurs, claimRoot } from './root-ownership.js'

/**
 * Claim the transcript root only when it is the one this product picked for itself.
 *
 * Unconditional claiming would mark `.claude` the moment an operator points us there, which defeats
 * the marker entirely. No claiming at all would refuse every existing installation: they all have a
 * `~/.theokit/projects` full of our transcripts and no marker, so retention would switch off for
 * everyone on upgrade — the silent non-collection this work exists to remove, delivered by the fix
 * for it.
 *
 * The rule is historical rather than clever. The built-in default root is ours by fact; anything an
 * operator pointed us at is theirs to consent for, by writing the marker themselves.
 *
 * A root already marked by someone else is never re-marked, even at the default path: claiming must
 * not be a way to take a directory from whoever marked it first.
 *
 * `defaultRoot` is the BUILT-IN path and deliberately not `projectsRoot()`. That function already
 * honours `THEOKIT_HOME`, so passing it compares a value with itself and claims every root the
 * operator points us at — which is the whole thing the marker exists to prevent. Caught end to end
 * on 2026-09-04: the unit tests passed both arguments explicitly and could not see it, while the
 * built binary happily claimed a scratch directory.
 */
export function builtInDefaultRoot(home = homedir()): string {
  return join(home, '.theokit', 'projects')
}

export function claimDefaultRoot(root: string, defaultRoot: string = builtInDefaultRoot()): void {
  if (root !== defaultRoot) return
  if (rootIsOurs(root)) return
  claimRoot(root)
}
