import { existsSync, renameSync, statSync, unlinkSync } from 'node:fs'

export const CAP_BYTES = 10 * 1024 * 1024

export const KEEP = 10

function exigirArgumentosValidos(capBytes: number, keep: number): void {
  if (!Number.isFinite(capBytes) || capBytes <= 0) {
    throw new RangeError(`invalid cap: ${String(capBytes)}`)
  }
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError(`keep deve ser >= 1 (0 equivale a truncate): ${String(keep)}`)
  }
}

export function rotate(path: string, capBytes: number, keep: number): void {
  exigirArgumentosValidos(capBytes, keep)
  try {
    if (!existsSync(path) || statSync(path).size < capBytes) return
    const oldest = `${path}.${String(keep - 1)}`
    if (existsSync(oldest)) unlinkSync(oldest)
    for (let i = keep - 2; i >= 0; i--) {
      const de = `${path}.${String(i)}`
      if (existsSync(de)) renameSync(de, `${path}.${String(i + 1)}`)
    }
    renameSync(path, `${path}.0`)
  } catch {
    // Fail-clear, not fail-fast: `stderr-guard.ts` establishes that a log cannot bring the app down,
    // and starting without rotating is strictly better than not starting. This is not swallowing a
    // domain error — it is an ENVIRONMENT error (disk full, permissions) on a best-effort path.
    // Sunset: revisit if rotation gains telemetry of its own.
  }
}
