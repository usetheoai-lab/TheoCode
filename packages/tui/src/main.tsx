import { getTuiRoot } from './agent-session/index.js'
import { TUI_MAX_FPS } from './rendering/index.js'
import { drainAll, installStderrGuard } from './terminal-io/index.js'
import { join } from 'node:path'

import { render } from 'ink'

import { App } from './App.js'

import { setDiagnosticsSink } from '@theokit/agents'

import { installDiagnosticSink } from '@theocode/shared/diagnostic-sink'

installDiagnosticSink(setDiagnosticsSink)

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile()
  } catch {
    // no .env on disk — rely on the ambient environment
  }
}

installStderrGuard(join(process.cwd(), '.theokit', 'tui-stderr.log'))
const instancia = render(<App />, { exitOnCtrlC: false, maxFps: TUI_MAX_FPS })

await instancia.waitUntilExit()
await drainAll()

getTuiRoot().ptyOwner.shutdown()
