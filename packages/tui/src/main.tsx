import { getTuiRoot } from './agent-session/index.js'
import { TUI_MAX_FPS } from './rendering/index.js'
import { drainAll, installStderrGuard, installTerminalTitle } from './terminal-io/index.js'
import { join } from 'node:path'

import { render } from 'ink'

import { App } from './App.js'

import { setDiagnosticsSink } from '@theokit/agents'

import { installDiagnosticSink } from '@theocode/shared/diagnostic-sink'
import { setWorkingDirectory, workingDirectory } from './working-directory.js'

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

await instance.waitUntilExit()
await drainAll()
restoreTerminalTitle()

getTuiRoot().ptyOwner.shutdown()
