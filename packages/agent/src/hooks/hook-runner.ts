import { spawn } from 'node:child_process'

import type { HookSpec } from './hooks-spec.js'

const MAX_OUTPUT_BYTES = 1024 * 1024

/**
 * How long to keep reading after the hook process exits, waiting for `close`.
 *
 * B-044 — this replaces a bare `20` with a name and a reason. `detached: true` means a background
 * grandchild can hold the pipe open indefinitely, so the wait must be bounded; but hook stdout is
 * the decision channel, so the bound must be generous enough that an ordinary hook is never cut off.
 */
const DRAIN_BUDGET_MS = 2_000

export interface HookRun {
  ok: boolean
  output: string
  timedOut: boolean
  truncated: boolean
}

function createOutputCollector() {
  const chunks: Buffer[] = []
  let size = 0
  let truncated = false
  return {
    get truncated(): boolean {
      return truncated
    },
    /** B-044 — the drain budget elapsed with a writer still holding the pipe. */
    markTruncated(): void {
      truncated = true
    },
    collect(buf: Buffer): void {
      if (size >= MAX_OUTPUT_BYTES) {
        truncated = true
        return
      }
      chunks.push(buf)
      size += buf.length
    },
    text(): string {
      const out = Buffer.concat(chunks).toString('utf8').trim()
      return truncated ? `${out}\n[output truncated — a writer held the pipe, or ${String(MAX_OUTPUT_BYTES)} bytes were exceeded]` : out
    },
  }
}

export function runHookCommand(spec: HookSpec, payload: unknown): Promise<HookRun> {
  return new Promise<HookRun>((resolve) => {
    const child = spawn(spec.command, { shell: true, detached: true, stdio: 'pipe' })

    const collector = createOutputCollector()
    const collect = (buf: Buffer): void => {
      collector.collect(buf)
    }
    let timedOut = false
    let settled = false

    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const pid = child.pid

    const killGroup = (): void => {
      try {
        if (pid !== undefined) process.kill(-pid, 'SIGKILL')
      } catch {
        // Group already gone — nothing to kill. Not a hook verdict, so not surfaced.
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      killGroup()
    }, spec.timeout_ms)

    const settle = (run: HookRun): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (drainTimer !== undefined) clearTimeout(drainTimer)
      resolve(run)
    }

    child.on('error', (err) => {
      settle({ ok: false, timedOut: false, truncated: collector.truncated, output: err.message })
    })

    // B-044 — settle on `close`, not on `exit` plus a sleep.
    //
    // Node documents `exit` as possibly preceding the closing of the stdio streams; `close` fires
    // once every writer has released the pipe. Hook stdout is the DECISION channel — `parseFeedback`
    // reads `decision: block` out of it, and a PreToolUse non-zero exit turns it into the veto
    // reason — so settling early can downgrade a block to an empty output.
    //
    // `close` alone is not safe either: `detached: true` puts the hook in its own process group, so
    // a background grandchild can hold the pipe open indefinitely. The wait is therefore BOUNDED,
    // with a named budget instead of the bare `20` that used to be here, and a run that hits the
    // bound reports truncation rather than pretending it read everything.
    let exited: { code: number | null; signal: NodeJS.Signals | null } | undefined
    let drainTimer: NodeJS.Timeout | undefined

    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      exited = { code, signal }
      drainTimer = setTimeout(() => {
        collector.markTruncated()
        finish(code, signal, timedOut)
      }, DRAIN_BUDGET_MS)
    })

    child.on('close', (code, signal) => {
      if (drainTimer !== undefined) clearTimeout(drainTimer)
      clearTimeout(timer)
      finish(exited?.code ?? code, exited?.signal ?? signal, timedOut)
    })

    const finish = (
      code: number | null,
      signal: NodeJS.Signals | null,
      wasTimedOut: boolean,
    ): void => {
      settle(outcome(spec, collector, code, signal, wasTimedOut))
    }

    child.stdin.on('error', () => {
      /* EPIPE / already-closed stdin: benign, judged by exit status below. */
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

function outcome(
  spec: HookSpec,
  collector: ReturnType<typeof createOutputCollector>,
  code: number | null,
  signal: NodeJS.Signals | null,
  wasTimedOut: boolean,
): HookRun {
  if (wasTimedOut) {
    return {
      ok: false,
      timedOut: true,
      truncated: collector.truncated,
      output: [
        `hook timed out after ${spec.timeout_ms}ms and was killed: ${spec.command}`,
        collector.text(),
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }
  if (code === null) {
    return {
      ok: false,
      timedOut: false,
      truncated: collector.truncated,
      output: `hook was killed by ${signal ?? 'an unknown signal'}: ${spec.command}`,
    }
  }
  return { ok: code === 0, timedOut: false, truncated: collector.truncated, output: collector.text() }
}
