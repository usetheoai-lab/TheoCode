/**
 * B-075 — putting text on the system clipboard, or saying clearly that there is none.
 *
 * No dependency is added (parsimony ladder rung 3): every desktop already ships a clipboard binary,
 * and Node has no clipboard API to reuse. Candidates are tried in order; the first that exists wins.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'

import { CLIPBOARD_COMMANDS, type ClipboardCommand } from './clipboard-commands.js'
import { NoClipboardError } from './clipboard-errors.js'
import { ClipboardWriteError } from './clipboard-write-error.js'

type Runner = (bin: string, args: readonly string[], input: string) => SpawnSyncReturns<string>

const defaultRunner: Runner = (bin, args, input) =>
  spawnSync(bin, [...args], { input, encoding: 'utf8' })

/**
 * Copy `text` to the system clipboard.
 *
 * @throws NoClipboardError when no candidate binary exists.
 * @throws ClipboardWriteError when one exists and refuses the text.
 */
export function copyToClipboard(
  text: string,
  opts: { runner?: Runner; candidates?: readonly ClipboardCommand[] } = {},
): { bin: string } {
  const run = opts.runner ?? defaultRunner
  for (const { bin, args } of opts.candidates ?? CLIPBOARD_COMMANDS) {
    const result = run(bin, args, text)
    // ENOENT means this binary is absent — try the next. Any OTHER error is a real failure of a
    // clipboard that IS installed, and swallowing it would be the silent no-op this guards against.
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') continue
    if (result.error !== undefined) throw new ClipboardWriteError(bin, result.error.message)
    if (result.status !== 0) {
      throw new ClipboardWriteError(bin, `exited ${String(result.status)}: ${result.stderr ?? ''}`)
    }
    return { bin }
  }
  throw new NoClipboardError()
}
