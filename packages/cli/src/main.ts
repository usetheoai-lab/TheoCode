import { homedir } from 'node:os'
import process from 'node:process'

import { ensureAuthHome } from '@theocode/agent/auth'
import { createShutdown, WATCHDOG_MS } from '@theocode/shared/shutdown'
import { loadProjectEnv, gitGate, parseExecArgs, USAGE } from './runtime/index.js'
import { goalCommand } from './commands/goal.js'
import { reviewCommand } from './commands/review.js'
import { runCommand } from './commands/run.js'
import { sessionsCommand } from './commands/sessions.js'
import { doctorCommand } from './commands/doctor.js'
import { setDiagnosticsSink } from '@theokit/agents'
import { installDiagnosticSink } from '@theocode/shared/diagnostic-sink'

installDiagnosticSink(setDiagnosticsSink)

/**
 * B-026 — the bootstrap runs INSIDE main, after `chdir`, and not between import declarations.
 *
 * `loadProjectEnv()` and `ensureAuthHome()` used to sit between the imports above, which reads as
 * ordered setup and is not: ESM hoists every import declaration and evaluates all of them before
 * the first statement runs. So every command module was loaded before the project `.env` existed in
 * `process.env`, and any module-level read of it saw the pre-bootstrap state.
 *
 * The second half is user-visible (B-023): `process.loadEnvFile()` reads `.env` from the CWD AT
 * CALL TIME, and `-C/--cd` chdir'd inside `main` — after this had already run. `theocode -C other/
 * …` therefore loaded the `.env` of the directory the user was leaving.
 */
function bootstrap(): void {
  loadProjectEnv()
  ensureAuthHome(process.env, homedir())
}

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
  // B-023 — help is a SUCCESS. It used to be reachable only by triggering the error path above,
  // so asking for help exited 1 and printed a complaint about a mistake the user had not made.
  if (args.mode === 'help') {
    process.stdout.write(`${args.usage}\n`)
    return
  }
  if (args.cd !== undefined) process.chdir(args.cd)

  // AFTER chdir: `.env` belongs to the directory the user selected, not the one they started in.
  bootstrap()

  if (args.mode === 'sessions') return sessionsCommand(args)
  if (args.mode === 'doctor') return doctorCommand(args)

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
