import { spawn } from 'node:child_process'

import type { HookSpec } from './hooks-spec.js'

const MAX_OUTPUT_BYTES = 1024 * 1024

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
      return truncated ? `${out}\n[output truncated at ${String(MAX_OUTPUT_BYTES)} bytes]` : out
    },
  }
}

export function runHookCommand(spec: HookSpec, payload: unknown): Promise<HookRun> {
  return new Promise<HookRun>((resolve) => {
    const child = spawn(spec.command, { shell: true, detached: true, stdio: 'pipe' })

    const coletor = createOutputCollector()
    const collect = (buf: Buffer): void => {
      coletor.collect(buf)
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
      resolve(run)
    }

    child.on('error', (err) => {
      settle({ ok: false, timedOut: false, truncated: coletor.truncated, output: err.message })
    })

    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      const wasTimedOut = timedOut
      setTimeout(() => finish(code, signal, wasTimedOut), 20)
    })

    const finish = (
      code: number | null,
      signal: NodeJS.Signals | null,
      wasTimedOut: boolean,
    ): void => {
      settle(desfecho(spec, coletor, code, signal, wasTimedOut))
    }

    child.stdin.on('error', () => {
      /* EPIPE / already-closed stdin: benign, judged by exit status below. */
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

function desfecho(
  spec: HookSpec,
  coletor: ReturnType<typeof createOutputCollector>,
  code: number | null,
  signal: NodeJS.Signals | null,
  wasTimedOut: boolean,
): HookRun {
  if (wasTimedOut) {
    return {
      ok: false,
      timedOut: true,
      truncated: coletor.truncated,
      output: [
        `hook timed out after ${spec.timeout_ms}ms and was killed: ${spec.command}`,
        coletor.text(),
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }
  if (code === null) {
    return {
      ok: false,
      timedOut: false,
      truncated: coletor.truncated,
      output: `hook was killed by ${signal ?? 'an unknown signal'}: ${spec.command}`,
    }
  }
  return { ok: code === 0, timedOut: false, truncated: coletor.truncated, output: coletor.text() }
}
