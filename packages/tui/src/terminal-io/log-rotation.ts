import { existsSync, renameSync, statSync, unlinkSync } from 'node:fs'

export const CAP_BYTES = 10 * 1024 * 1024

export const KEEP = 10

function exigirArgumentosValidos(capBytes: number, keep: number): void {
  if (!Number.isFinite(capBytes) || capBytes <= 0) {
    throw new RangeError(`invalid cap: ${String(capBytes)}`)
  }
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError(`manter deve ser >= 1 (0 equivale a truncar): ${String(keep)}`)
  }
}

export function rotate(path: string, capBytes: number, keep: number): void {
  exigirArgumentosValidos(capBytes, keep)
  try {
    if (!existsSync(path) || statSync(path).size < capBytes) return
    const maisAntigo = `${path}.${String(keep - 1)}`
    if (existsSync(maisAntigo)) unlinkSync(maisAntigo)
    for (let i = keep - 2; i >= 0; i--) {
      const de = `${path}.${String(i)}`
      if (existsSync(de)) renameSync(de, `${path}.${String(i + 1)}`)
    }
    renameSync(path, `${path}.0`)
  } catch {
    // Fail-clear, não fail-fast: `stderr-guard.ts:12` estabelece que um log não pode derrubar a app,
    // e subir sem rotacionar é estritamente melhor que não subir. Não é swallow de erro de domínio —
    // é um erro de AMBIENTE (disco cheio, permissão) num path best-effort.
    // Sunset: revisitar se a rotação ganhar telemetria própria.
  }
}
