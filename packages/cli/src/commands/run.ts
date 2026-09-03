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
import { collectSessionsAutomatically } from '@theocode/agent/session'
import { resolveEffectiveConfig } from '@theocode/agent/config'
import { diagnosticsEnabled } from '@theocode/shared/diagnostic-sink'
import { createRetryRecord } from '@theocode/shared/retry-record'
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

/**
 * Resolve the credential and the model id the turn will actually run on.
 *
 * Extracted from `runCommand` because it is a self-contained decision with its own long reason, and
 * because that reason is about CREDENTIAL ROUTING rather than about running a turn — keeping it
 * inline made the caller read as if the routing order were part of the turn loop.
 */
/**
 * The three seams the ordering below depends on, injectable so the order can be ASSERTED.
 *
 * B-141 — the order is what `run.ts` calls "the fix", it cost a real user a misdiagnosed turn, and
 * nothing tested it: it survived as a comment over dynamic imports no test could reach. Production
 * passes nothing and gets the real modules.
 */
export interface RunTargetDeps {
  readonly resolveCredentialForModel: typeof import('@theocode/agent/auth').resolveCredentialForModel
  readonly routeToCredential: typeof import('@theocode/agent/auth').routeToCredential
  readonly composeRun: typeof import('../run-composition.js').composeRun
}

export async function resolveRunTarget(args: ExecRun, injected?: RunTargetDeps) {
  const { composeRun, resolveCredentialForModel, routeToCredential } =
    injected ??
    (await (async () => {
      const auth = await import('@theocode/agent/auth')
      const composition = await import('../run-composition.js')
      return {
        composeRun: composition.composeRun,
        resolveCredentialForModel: auth.resolveCredentialForModel,
        routeToCredential: auth.routeToCredential,
      }
    })())

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
  // `model` is deliberately not returned: it is consumed here and nowhere else, and a value
  // nobody reads is the dead surface the audit that produced B-128..B-134 exists to find.
  return { headlessPolicy, mod, apiKey: cred.apiKey }
}

export async function runCommand(args: ExecRun, shutdown: Shutdown): Promise<void> {
  const prompt = readPrompt(args)

  const { streamAgentTurnInProcess } = await import('@theokit/agents')
  const { headlessPolicy, mod, apiKey } = await resolveRunTarget(args)

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
    // B-130 — the transport's retries were invisible: after three attempts an auth failure reached
    // the user as `rate_limit (HTTP 429)` (see the ORDER note above, which fixed that specific
    // case). The count comes from the SDK's own `rate_limit` event, not from anything invented here.
    const retries = createRetryRecord()
    const openStream = (sessionId: string): AsyncIterable<unknown> =>
      streamAgentTurnInProcess(mod, apiKey, {
        message: prompt,
        sessionId: sessionId,
        awaitApproval: async () => headlessPolicy,
        // Without this the framework masks every failure to "An error occurred." — the right
        // default for a public HTTP endpoint and the wrong one here, where the caller IS the
        // operator. See `@theocode/shared/turn-error`.
        onError: (error) =>
          turnErrorText(error, {
            attempts: retries.attempts(),
            diagnosticsEnabled: diagnosticsEnabled(),
          }),
        // The only member read is `rate_limit`; every other event is ignored, the same discipline
        // the TUI's MCP sink applies to the same stream.
        onRunEvent: retries.sink,
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
  // B-131 / B-132 — after the answer has been delivered and before the process leaves. AWAITED
  // here, unlike the TUI: a one-shot process that backgrounds this either delays its own exit or
  // has the sweep killed halfway. It runs at most once a day, so the cost lands on one invocation
  // in twenty-four hours and never on the path to the user's output.
  await collectSessionsAutomatically({
    enabled: resolveEffectiveConfig({ cwd: process.cwd() }).session_gc,
    onReport: (line) => process.stderr.write(`${line}\n`),
  })
  const drainedExit = createDrainedProcessOutput(DEFAULT_WATCHDOG_MS)
  drainedExit(result.errorSeen || emptyTurn !== undefined ? 1 : 0)
}
