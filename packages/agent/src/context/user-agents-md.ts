import { expandInstructionImports } from '@theokit/agents/config'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The instruction file that belongs to the PERSON rather than to the repository (#65).
 *
 * `~/.theocode/config.toml` and `~/.theocode/auth.json` have always existed; instructions never had
 * a user layer, so a preference of the operator's — "answer in Portuguese", "run the suite before
 * telling me it works" — could only be written into a project `AGENTS.md`, which commits it into a
 * shared repository and steers a teammate's agent too. The README already documents the precedence
 * model for configuration ("the same keys, as your defaults; the project layer wins"); this makes
 * that sentence true of instructions as well.
 *
 * ## Not trust-gated, deliberately
 *
 * `projectDocument` is gated behind `posture.allows.agentsMd`, and must be: an untrusted
 * repository's `AGENTS.md` is a prompt-injection vector, which is the reason that gate exists. This
 * file is the operator's own, on their own machine, and gating it would be answering a different
 * question — the gate asks "do I trust the code in this directory?", and nobody's home directory is
 * the directory in question. `settingSourcesFor` already encodes the same asymmetry by keeping
 * `user: true` through an untrusted cwd.
 *
 * ## Confined to its own root
 *
 * Imports resolve against `~/.theocode`, not against the repository. Pointing the expansion at the
 * project root would make an operator's `@shared.md` unreadable from inside a repo — and mean a
 * different file in each one. The confinement itself is NOT relaxed because the file is the
 * operator's: an import lands in the model's prompt, and `~/.theocode` is a directory other tools
 * write into too.
 */
export function userAgentsMdPath(home: string): string {
  return join(home, '.theocode', 'AGENTS.md')
}

export function loadUserAgentsMd(
  home: string,
  warn: (message: string) => void = (m) => process.stderr.write(`${m}\n`),
): string {
  const path = userAgentsMdPath(home)
  if (!existsSync(path)) return ''
  const text = readFileSync(path, 'utf8').trim()
  if (text.length === 0) return ''
  return expandInstructionImports({
    text,
    filePath: path,
    rootDir: join(home, '.theocode'),
    onWarn: warn,
    wrap: (name, content) => `\n--- import: ${name} ---\n${content}\n--- end import ---\n`,
    alreadyLoaded: [path],
  }).trim()
}
