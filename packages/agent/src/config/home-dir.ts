import { join } from 'node:path'

import { ConfigError } from './config.js'

/**
 * The directory this product keeps its state in, under the operator's home.
 *
 * `.theokit` is the framework's own name and stays the default: it is where every existing
 * installation already has its transcripts, its trust store and its hook approvals, and moving that
 * by default would strand all of it.
 */
export const DEFAULT_HOME_DIR = '.theokit'

/**
 * A NAME, never a path.
 *
 * `.claude` and `.theocode` are names under the operator's home. Accepting an arbitrary path would
 * let a typo in a config file point the transcript root — and therefore the DELETE path — at `/etc`
 * or at a project directory. Input validation at the boundary is the one thing the parsimony ladder
 * never trades away.
 */
export function isValidHomeDirName(name: string): boolean {
  if (name.trim() !== name || name.length === 0) return false
  if (name === '.' || name === '..') return false
  return !/[/\\]/.test(name)
}

/**
 * Point the SDK's state root at the directory this product was configured to use.
 *
 * `THEOKIT_HOME` and not `sessionDir`, deliberately. The SDK exposes both, and they answer different
 * halves of one fact: `sessionDir` is where transcripts are WRITTEN, `THEOKIT_HOME` is what
 * `projectsRoot()` resolves for the collector that DELETES them. Setting only the first was measured
 * on 2026-09-04 to leave the sweep reporting `0 would remove; 0 kept` over a root nothing writes to
 * any more. One variable that both halves already read cannot disagree with itself.
 *
 * An explicit `THEOKIT_HOME` WINS. An operator who exports it is addressing the SDK directly, and a
 * config key that overrode that would make the environment silently inert — the same reasoning
 * `ensureAuthHome` records for reading `env.X ?? default` rather than assigning.
 *
 * An invalid name THROWS rather than falling back to the default: falling back moves the state root
 * without saying so, and the operator's transcripts appear to have vanished when in fact the product
 * is looking somewhere they never asked for.
 */
export function installTheokitHome(
  env: Record<string, string | undefined>,
  home: string,
  name: string = DEFAULT_HOME_DIR,
): string {
  if (!isValidHomeDirName(name)) {
    throw new ConfigError(
      `home_dir: ${JSON.stringify(name)} is not a directory name — expected a single segment ` +
        `under your home, such as ${JSON.stringify(DEFAULT_HOME_DIR)} or ".claude"`,
    )
  }
  const resolved = env.THEOKIT_HOME ?? join(home, name)
  env.THEOKIT_HOME = resolved
  return resolved
}
