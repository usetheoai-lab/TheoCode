export interface Drenavel {
  writeStdin(
    sessionId: string,
    chars: string,
    opts?: { yieldMs?: number },
  ): Promise<{ output: string; alive: boolean }>
}

const JANELA_DE_DRENAGEM_MS = 250

export async function lerAte(
  backend: Drenavel,
  sessionId: string,
  mark: string,
  inicial = '',
  tentativas = 20,
): Promise<string> {
  let buf = inicial
  for (let i = 0; i < tentativas; i++) {
    if (buf.includes(mark)) return buf
    const r = await backend.writeStdin(sessionId, '', { yieldMs: JANELA_DE_DRENAGEM_MS })
    buf += r.output
    if (buf.includes(mark)) return buf
    if (!r.alive)
      throw new Error(
        `lerAte: a sessão morreu (alive:false) antes da sentinela "${mark}", após ${i + 1} ` +
          `leitura(s); fim do buffer: ${buf.slice(-200)}`,
      )
  }
  throw new Error(
    `lerAte: a sentinela "${mark}" não apareceu em ${tentativas} leituras; ` +
      `fim do buffer: ${buf.slice(-200)}`,
  )
}
