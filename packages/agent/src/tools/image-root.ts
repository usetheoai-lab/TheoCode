/**
 * B-082 — resolving an image path against the root the agent may read.
 *
 * Kept separate from the tool itself so the containment rule is testable without constructing an
 * SDK tool. It is the only part that can be wrong in a way that matters: a path escaping the root
 * hands the model file contents from outside the workspace.
 */
import { isAbsolute, relative, resolve } from 'node:path'

import { TheokitAgentError } from '@theokit/agents'

export class ImageOutsideRootError extends TheokitAgentError {
  override readonly name = 'ImageOutsideRootError'
  readonly path: string

  constructor(path: string, root: string) {
    super(
      `refusing to read ${path}: it resolves outside ${root}, the directory this session may read. ` +
        `Pass a path inside the workspace.`,
    )
    this.path = path
  }
}

/**
 * Resolve `requested` against `root`, refusing anything that escapes it.
 *
 * Refuses rather than clamping. Silently rewriting a path to something inside the root would answer
 * a question the model did not ask, and the model would treat the contents as the file it named
 * (`rules/error-handling.md` § 2 — return explicit errors, never a magic substitute).
 */
export function resolveImagePath(root: string, requested: string): string {
  const absolute = isAbsolute(requested) ? requested : resolve(root, requested)
  const rel = relative(resolve(root), absolute)
  // `..` at the head means it climbed out; an absolute `rel` means a different device/root entirely.
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new ImageOutsideRootError(requested, root)
  }
  return absolute
}
