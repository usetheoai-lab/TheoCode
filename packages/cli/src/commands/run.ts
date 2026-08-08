import process from 'node:process'
import {
  createHumanProcessor,
  createJsonlProcessor,
  type ExecProcessor,
  silentEmptyTurnDiagnostic,
} from '../runtime/index.js'
import { consumirComForkSeOcupada, idDisponivelOuFork } from '../runtime/index.js'
import { WATCHDOG_MS } from '@theocode/shared/shutdown'
import { createDrainedProcessOutput } from '../runtime/index.js'
import { homedir } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'
import type { ExecRun } from '../runtime/index.js'
import type { Shutdown } from '@theocode/shared/shutdown'
import { resolveSessionId } from '../runtime/index.js'

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
  const { policy: politicaHeadless, mod } = composeRun({ ...args })
  const { resolveCredentialForModel } = await import('@theocode/agent/auth')
  const cred = await resolveCredentialForModel(args.model, { env: process.env, home: homedir() })
  const sessionId = idDisponivelOuFork(await resolveSessionId(args), process.cwd())
  const processor = createProcessor(args.json === true, sessionId)

  let status: 'finished' | 'error' = 'finished'
  let errorMsg: string | undefined
  shutdown.registerCleanup(() => {
    processor.finish('error', { error: 'interrupted' })
  })
  try {
    const abrirStream = (sessionId: string): AsyncIterable<unknown> =>
      streamAgentTurnInProcess(mod, cred.apiKey, {
        message: prompt,
        sessionId: sessionId,
        awaitApproval: async () => politicaHeadless,
      }) as AsyncIterable<unknown>
    await consumirComForkSeOcupada(
      sessionId,
      abrirStream,
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
  const sair = createDrainedProcessOutput(WATCHDOG_MS)
  sair(result.errorSeen || emptyTurn !== undefined ? 1 : 0)
}
