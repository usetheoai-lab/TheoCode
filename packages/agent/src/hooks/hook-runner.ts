import { runHookCommand as runInFramework } from '@theokit/agents/hooks'

import type { HookSpec } from './hooks-spec.js'

/**
 * Run one hook, bounded.
 *
 * ## What moved, and what could not
 *
 * The execution mechanics — the shell spawn, the detached process group and its SIGKILL, the output
 * ceiling, the drain budget for a grandchild holding the pipe (B-044), the timeout — moved to
 * `@theokit/agents/hooks` (M75) and were deleted here. That is ~150 lines of subprocess handling
 * this product no longer maintains.
 *
 * What stays is the SHAPE the callers speak. `HookRun` fuses stdout and stderr into one `output`
 * field, because a hook's decision channel is "what it printed" regardless of which stream carried
 * it. The framework keeps them apart — the right default for a primitive, the wrong one for the
 * call sites here.
 *
 * ## Why the rest of this family stayed
 *
 * The event vocabulary. `HookSpec.event` here is `PreToolUse` / `PostToolUse` / `Stop` /
 * `SessionStart` — Claude Code's names, which users write in `.theokit/hooks.json`. The framework
 * declares eight snake_case events with no one-to-one mapping, and its schema is `.strict()`, so
 * adopting its parser would reject every hooks file already on a user's disk. That is a
 * config-format break rather than a rename, and it needs a decision of its own.
 *
 * `cwd` is passed explicitly now. The deleted version inherited the process's, which worked and said
 * nothing about which directory a hook was trusted for.
 */

export interface HookRun {
  ok: boolean
  output: string
  timedOut: boolean
  truncated: boolean
}

export async function runHookCommand(spec: HookSpec, payload: unknown): Promise<HookRun> {
  const result = await runInFramework({
    command: spec.command,
    cwd: process.cwd(),
    timeoutMs: spec.timeout_ms,
    stdin: JSON.stringify(payload),
  })

  // Both streams, in that order. A hook that writes its verdict to stderr and its noise to stdout is
  // unusual and legal, and dropping either would silently discard a decision.
  const output = [result.stdout, result.stderr].filter((s) => s.length > 0).join('\n')

  if (result.timedOut) {
    return {
      ok: false,
      timedOut: true,
      truncated: result.truncated,
      output: [
        `hook timed out after ${String(spec.timeout_ms)}ms and was killed: ${spec.command}`,
        output,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  // `exitCode === null` means a signal ended it. Kept distinct from a non-zero exit: one is the hook
  // deciding, the other is something outside deciding FOR the hook, and an operator reading
  // "exited 1" when the OOM killer fired is sent to the wrong file.
  if (result.exitCode === null) {
    return {
      ok: false,
      timedOut: false,
      truncated: result.truncated,
      output: `hook was killed by a signal: ${spec.command}`,
    }
  }

  return {
    ok: result.exitCode === 0,
    timedOut: false,
    truncated: result.truncated,
    output,
  }
}
