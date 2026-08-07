import { randomUUID } from 'node:crypto'

import { sessionHasWriter, transcriptPath, transcriptRoot } from '@theokit/agents/persistence'

function forkIdForBusySession(original: string): string {
  return `${original}-fork-${randomUUID().slice(0, 8)}`
}

export async function consumirComForkSeOcupada(
  sessionIdInicial: string,
  abrir: (sessionId: string) => AsyncIterable<unknown>,
  consumir: (chunk: unknown) => void,
  warning: (line: string) => void,
): Promise<string> {
  const first = await consumirDetectandoDisputa(abrir(sessionIdInicial), consumir)
  if (!first.disputa) return sessionIdInicial

  const novoId = forkIdForBusySession(sessionIdInicial)
  warning(
    `[exec] sessão ${sessionIdInicial} está sendo escrita por outro processo — forkando para ${novoId}\n`,
  )
  const segunda = await consumirDetectandoDisputa(abrir(novoId), consumir, { emitir: true })
  if (segunda.disputa) {
    throw new Error(`[exec] the forked session ${novoId} is busy too`)
  }
  return novoId
}

interface ResultadoDaPassagem {
  disputa: boolean
}

const ESTRUTURAIS = new Set(['start', 'start-step', 'finish', 'finish-step'])

async function consumirDetectandoDisputa(
  stream: AsyncIterable<unknown>,
  consumir: (chunk: unknown) => void,
  opts: { emitir?: boolean } = {},
): Promise<ResultadoDaPassagem> {
  const retidos: unknown[] = []
  let liberado = false
  let disputa = false

  for await (const chunk of stream) {
    if (isSessionContention(chunk)) {
      disputa = true
      continue
    }
    if (liberado) {
      consumir(chunk)
      continue
    }
    if (opts.emitir !== true && ehEstrutural(chunk)) {
      retidos.push(chunk)
      continue
    }
    liberado = true
    for (const r of retidos) consumir(r)
    retidos.length = 0
    consumir(chunk)
  }

  if (!disputa) {
    for (const r of retidos) consumir(r)
  }
  return { disputa }
}

function ehEstrutural(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null) return false
  const kind = (chunk as { type?: unknown }).type
  return typeof kind === 'string' && ESTRUTURAIS.has(kind)
}

function isSessionContention(chunk: unknown): boolean {
  if (typeof chunk !== 'object' || chunk === null) return false
  const c = chunk as { type?: unknown; errorCode?: unknown }
  return c.type === 'error' && c.errorCode === 'session_busy'
}

export function idDisponivelOuFork(sessionId: string, cwd: string): string {
  const target = transcriptPath(transcriptRoot(), cwd, sessionId)
  return sessionHasWriter(target) ? forkIdForBusySession(sessionId) : sessionId
}
