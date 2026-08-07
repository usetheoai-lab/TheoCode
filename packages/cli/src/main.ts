import { homedir } from 'node:os'
import process from 'node:process'

import { ensureAuthHome } from '@theocode/agent/auth'
import { createShutdown, WATCHDOG_MS } from '@theocode/shared/shutdown'
import { loadProjectEnv, gitGate, parseExecArgs, USAGE } from './runtime/index.js'

loadProjectEnv()

ensureAuthHome(process.env, homedir())
import { goalCommand } from './commands/goal.js'

import { reviewCommand } from './commands/review.js'
import { runCommand } from './commands/run.js'
import { sessionsCommand } from './commands/sessions.js'

import { setDiagnosticsSink } from '@theokit/agents'

import { installDiagnosticSink } from '@theocode/shared/diagnostic-sink'

installDiagnosticSink(setDiagnosticsSink)

async function main(): Promise<void> {
  const shutdown = createShutdown({
    timeoutMs: WATCHDOG_MS,
    exit: (code) => {
      process.exit(code)
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => {
      clearTimeout(t)
    },
    onError: (err) => process.stderr.write(`[exec] cleanup failed: ${String(err)}\n`),
  })
  shutdown.installSignalHandler((sig, fn) => {
    process.on(sig, fn)
  })

  const args = parseExecArgs(process.argv.slice(2), process.stdin.isTTY === true)
  if (args.mode === 'error') {
    process.stderr.write(`${args.message}\n\n${USAGE}\n`)
    process.exit(1)
  }
  if (args.cd !== undefined) process.chdir(args.cd)

  if (args.mode === 'sessions') return sessionsCommand(args)

  gitGate(args.skipGitCheck)

  switch (args.mode) {
    case 'review':
      return reviewCommand(args, shutdown)
    case 'goal':
      return goalCommand(args, shutdown)
    case 'run':
    case 'resume':
      return runCommand(args, shutdown)
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
