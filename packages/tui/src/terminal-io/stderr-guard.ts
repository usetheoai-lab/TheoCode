import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import { KEEP, rotate, CAP_BYTES } from './log-rotation.js'

export function installStderrGuard(logPath: string): () => void {
  const original = process.stderr.write
  try {
    mkdirSync(dirname(logPath), { recursive: true })
  } catch {
    // unwritable parent — guarded writes below will no-op
  }
  rotate(logPath, CAP_BYTES, KEEP)
  process.stderr.write = ((chunk: unknown): boolean => {
    try {
      appendFileSync(logPath, typeof chunk === 'string' ? chunk : String(chunk))
    } catch {
      // never let a warning crash the app or corrupt the frame
    }
    return true
  }) as typeof process.stderr.write
  return () => {
    process.stderr.write = original
  }
}
