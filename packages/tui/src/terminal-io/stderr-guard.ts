import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

import { KEEP, rotate, CAP_BYTES } from './log-rotation.js'

/**
 * Redirect `process.stderr.write` to a log file so a warning cannot corrupt the Ink frame, and
 * return the disposer that puts the real one back.
 *
 * B-039 — a write that FAILS is carried to teardown and reported there.
 *
 * The catch used to be empty and this returned `true` unconditionally, with `mkdirSync` failure
 * already commented as "guarded writes below will no-op". On a non-writable path the TUI ran with
 * every diagnostic dead and nothing said so — and this is the sole output channel of the B-031
 * degradation reports, of hook-approval failures, and of the backtrack fork trace.
 *
 * Falling back to the real stderr, which `shared/diagnostic-sink.ts` does, is wrong HERE: writing
 * mid-frame corrupts the display, which is the entire reason this guard exists. So the loss is
 * counted and surfaced once at teardown, when the terminal is free again.
 */
export function installStderrGuard(logPath: string): () => void {
  const original = process.stderr.write
  try {
    mkdirSync(dirname(logPath), { recursive: true })
  } catch {
    // Unwritable parent. Not fatal, and no longer silent: every append below will fail and the
    // teardown report says so.
  }
  rotate(logPath, CAP_BYTES, KEEP)

  let dropped = 0
  let firstError: string | undefined
  // B-039 — the log was rotated ONCE, at startup, and never again, so a long session grew it past
  // CAP_BYTES unbounded. Rotating on accumulated bytes avoids a `stat` on every write.
  let sinceRotation = 0

  process.stderr.write = ((chunk: unknown): boolean => {
    const text = typeof chunk === 'string' ? chunk : String(chunk)
    try {
      appendFileSync(logPath, text)
      sinceRotation += text.length
      if (sinceRotation >= CAP_BYTES) {
        rotate(logPath, CAP_BYTES, KEEP)
        sinceRotation = statSync(logPath).size
      }
      return true
    } catch (err) {
      dropped += 1
      firstError ??= (err as Error).message
      // `false` is the honest answer to "did this get written", and the Node stream contract
      // already defines it. Nothing in the TUI branches on it today; a future caller can.
      return false
    }
  }) as typeof process.stderr.write

  return () => {
    process.stderr.write = original
    if (dropped > 0) {
      original.call(
        process.stderr,
        `[theocode] ${String(dropped)} diagnostic message(s) could not be written to ${logPath} ` +
          `and were lost: ${firstError ?? 'unknown error'}\n`,
      )
    }
  }
}
