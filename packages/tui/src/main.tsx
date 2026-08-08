import { getTuiRoot } from './agent-session/index.js'
import { TUI_MAX_FPS } from './rendering/index.js'
import { drainAll, installStderrGuard } from './terminal-io/index.js'
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
const instancia = render(<App />, { exitOnCtrlC: false, maxFps: TUI_MAX_FPS })

await instancia.waitUntilExit()
await drainAll()

getTuiRoot().ptyOwner.shutdown()
