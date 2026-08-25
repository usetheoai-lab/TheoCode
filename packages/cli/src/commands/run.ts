import process from 'node:process'
import {
  createHumanProcessor,
  createJsonlProcessor,
  type ExecProcessor,
  silentEmptyTurnDiagnostic,
} from '../runtime/index.js'
import { consumeWithForkIfBusy, availableIdOrFork } from '../runtime/index.js'
import { DEFAULT_WATCHDOG_MS } from '@theokit/agents/commands'
import { createDrainedProcessOutput } from '../runtime/index.js'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'
import type { ExecRun } from '../runtime/index.js'
import type { Shutdown } from '@theokit/agents/commands'
import { resolveSessionId } from '../runtime/index.js'
import { turnErrorText } from '@theocode/shared/turn-error'

function readPrompt(args: ExecRun): string {
  if (args.stdinBehavior === 'required' || args.stdinBehavior === 'forced') {
    const lido = readFileSync(0, 'utf8').trim()
    if (lido.length === 0) {
      process.stderr.write('No prompt provided\n')
      process.exit(1)
    }
    return lido
  }
  const base = args.prompt ?? ''
  if (args.stdinBehavior !== 'append') return base
  const stdin = readFileSync(0, 'utf8').trim()
  return stdin.length > 0 ? `${base}\n\n<stdin>\n${stdin}\n</stdin>` : base
}

function createProcessor(json: boolean, sessionId: string): ExecProcessor {
  const io = {
    out: (l: string) => process.stdout.write(`${l}\n`),
    err: (l: string) => process.stderr.write(`${l}\n`),
  }
  return json ? createJsonlProcessor(io, sessionId) : createHumanProcessor(io, sessionId)
}

export async function runCommand(args: ExecRun, shutdown: Shutdown): Promise<void> {
  const prompt = readPrompt(args)

  const { streamAgentTurnInProcess } = await import('@theokit/agents')
  const { composeRun } = await import('../run-composition.js')
  const { resolveCredentialForModel, routeToCredential } = await import('@theocode/agent/auth')

  // The ORDER here is the fix, and it is the TUI's order: route the model id for the credential
  // that will serve it, THEN resolve a credential for the routed id, THEN build on that same id.
  //
  // Headless used to resolve and build on the configured id directly. With a ChatGPT sign-in that
  // id is `openai/…`, which selects the API-key provider — and `api.openai.com` refuses an OAuth
  // token outright (`401 Missing scopes: api.responses.write`, measured 2026-08-25 by posting to
  // both endpoints with the stored token). So one credential worked in the TUI and failed in the
  // CLI, on a product whose README calls itself "one agent core, two surfaces". Worse, the failure
  // did not say `auth`: after the transport's retries it surfaced as `rate_limit (HTTP 429)`, which
  // reads as a quota problem and sends the user off to check a usage page.
  //
  // The first resolution is a PROBE: `routeToCredential` needs to know whether the credential is an
  // OAuth one before it can decide, and that answer only comes from resolving. It is cheap (a file
  // read plus, at most, a token refresh) and the second call reuses the refreshed token.
  const probe = await resolveCredentialForModel(args.model, { env: process.env, home: homedir() })
  const {
    policy: headlessPolicy,
    mod,
    model,
  } = composeRun({
    ...args,
    routeModel: (id) => routeToCredential(probe, id),
  })
  const cred = await resolveCredentialForModel(model, { env: process.env, home: homedir() })
  const sessionId = availableIdOrFork(await resolveSessionId(args), process.cwd())
  const processor = createProcessor(args.json === true, sessionId)

  let status: 'finished' | 'error' = 'finished'
  let errorMsg: string | undefined
  // Named, because the framework's watchdog reports WHICH cleanup hung, not merely that one did.
  shutdown.register({
    name: 'finish-processor',
    run: () => {
      processor.finish('error', { error: 'interrupted' })
    },
  })
  try {
    const openStream = (sessionId: string): AsyncIterable<unknown> =>
      streamAgentTurnInProcess(mod, cred.apiKey, {
        message: prompt,
        sessionId: sessionId,
        awaitApproval: async () => headlessPolicy,
        // Without this the framework masks every failure to "An error occurred." — the right
        // default for a public HTTP endpoint and the wrong one here, where the caller IS the
        // operator. See `@theocode/shared/turn-error`.
        onError: turnErrorText,
      }) as AsyncIterable<unknown>
    await consumeWithForkIfBusy(
      sessionId,
      openStream,
      (chunk) => {
        processor.process(chunk as never)
      },
      (line) => process.stderr.write(line),
    )
  } catch (err) {
    status = 'error'
    errorMsg = err instanceof Error ? err.message : String(err)
  }
  const result = processor.finish(status, errorMsg !== undefined ? { error: errorMsg } : {})
  const emptyTurn = silentEmptyTurnDiagnostic(result, status)
  if (emptyTurn !== undefined) process.stderr.write(`${emptyTurn}\n`)
  if (args.outputLastMessage !== undefined) {
    try {
      writeFileSync(args.outputLastMessage, `${result.finalText}\n`)
    } catch (err) {
      process.stderr.write(
        `failed to write -o file: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
  }
  const drainedExit = createDrainedProcessOutput(DEFAULT_WATCHDOG_MS)
  drainedExit(result.errorSeen || emptyTurn !== undefined ? 1 : 0)
}
