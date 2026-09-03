import { getTuiRoot } from './agent-session/index.js'
import { TUI_MAX_FPS } from './rendering/index.js'
import { drainAll, installStderrGuard, installTerminalTitle } from './terminal-io/index.js'
import { join } from 'node:path'

import { render } from 'ink'

import { App } from './App.js'

import { setDiagnosticsSink } from '@theokit/agents'

import { installDiagnosticSink } from '@theocode/shared/diagnostic-sink'
import { setWorkingDirectory, workingDirectory } from './working-directory.js'
import { collectSessionsAutomatically } from '@theocode/agent/session'
import { resolveEffectiveConfig } from '@theocode/agent/config'

installDiagnosticSink(setDiagnosticsSink)

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile()
  } catch {
    // no .env on disk — rely on the ambient environment
  }
}

// B-057 — chosen ONCE, here, before anything reads it. The TUI has no directory flag yet, so this
// is the process directory today; when a `--cd` arrives it becomes a one-line change instead of
// twenty-three, and a second write throws rather than leaving trust and configuration describing
// different directories.
setWorkingDirectory(process.cwd())

installStderrGuard(join(workingDirectory(), '.theokit', 'tui-stderr.log'))

// BEFORE the first frame, so the push captures the title the shell set rather than one of ours.
// The disposer is idempotent, which is why it can be both the normal shutdown step below and a
// backstop on `exit`: the ordinary path runs it after the queue drains, and the hook covers the
// paths that never reach that line — a throw out of the render, or a `process.exit` from anywhere.
const restoreTerminalTitle = installTerminalTitle()
process.once('exit', restoreTerminalTitle)

const instance = render(<App />, { exitOnCtrlC: false, maxFps: TUI_MAX_FPS })

// B-131 / B-132 — AFTER the render call and deliberately NOT awaited: the retention policy already
// declared 30-day transcripts collectable and nothing applied it, but housekeeping must never be
// something the operator waits for. `collectSessionsAutomatically` runs at most once a day, never
// throws, and reports through the diagnostics sink; the `void` is the point rather than an
// oversight, and the `.catch` is the belt to its braces.
void collectSessionsAutomatically({
  enabled: resolveEffectiveConfig({ cwd: workingDirectory() }).session_gc,
  onReport: (line) => {
    process.stderr.write(`${line}\n`)
  },
}).catch((err: unknown) => {
  // `maybeCollectSessions` converts every failure into a report and is tested for it, so reaching
  // here means that contract broke. Reporting it is the point: an empty handler would turn a broken
  // invariant into silence, which is the shape this whole change exists to remove.
  process.stderr.write(
    `[sessions gc] collector broke its no-throw contract: ${err instanceof Error ? err.message : String(err)}\n`,
  )
})

await instance.waitUntilExit()
await drainAll()
restoreTerminalTitle()

getTuiRoot().ptyOwner.shutdown()
