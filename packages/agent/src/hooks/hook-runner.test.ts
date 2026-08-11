/**
 * B-044 — hook output is harvested on `close`, not on `exit` plus a sleep.
 *
 * `runHookCommand` settled from the `exit` event deferred by a fixed 20 ms timer. Node documents
 * `exit` as possibly preceding the closing of the stdio streams; `close` is the event that
 * guarantees drained pipes. Twenty milliseconds is a sleep, not a synchronisation, and it was a bare
 * literal with no name.
 *
 * What can be lost is the DECISION channel: `parseFeedback` reads `decision: block` and `reason` out
 * of hook stdout, and a PreToolUse non-zero exit turns its stdout into the veto reason. A hook
 * writing more than the 64 KiB pipe buffer, or scheduled out under load, could have its block
 * silently downgraded to an empty output — the gate opening because a timer was too short.
 */
import { describe, expect, it } from 'vitest'

import { runHookCommand } from './hook-runner.js'

const spec = (command: string, timeout_ms = 10_000) =>
  ({ command, event: 'PreToolUse', timeout_ms }) as never

describe('B-044 — the decision channel is drained before the run settles', () => {
  it('test_a_small_output_is_captured', async () => {
    // Anti-vacuity floor: capturing nothing would satisfy the assertion below.
    const run = await runHookCommand(spec('printf hello'), {})

    expect(run.output).toContain('hello')
  })

  it('test_output_written_after_the_parent_exits_is_still_captured', async () => {
    // The documented race, made deterministic. `spawn(..., { detached: true })` puts the hook in its
    // own process group, so a background grandchild inherits the pipe and can write to it AFTER the
    // parent has exited. Node fires `exit` at that moment and `close` only once every writer has
    // let the pipe go.
    //
    // A fixed 20 ms sleep after `exit` loses this. A 300 KiB burst does NOT reproduce it — the
    // sleep happens to be long enough on this machine, which is exactly what makes a sleep the
    // wrong instrument: it works until the day it does not.
    const run = await runHookCommand(
      spec(`{ sleep 0.4; printf 'decision: block'; } & printf 'early '`),
      {},
    )

    expect(
      run.output,
      'the run settled before the pipe was drained: a hook decision written after the shell exited ' +
        'was lost, and a block would have been silently downgraded to an empty output',
    ).toContain('decision: block')
  })

  it('test_a_non_zero_exit_still_carries_its_output', async () => {
    // The veto path: a PreToolUse hook that exits non-zero turns its stdout into the reason.
    const run = await runHookCommand(spec('printf "denied: policy X"; exit 3'), {})

    expect(run.ok).toBe(false)
    expect(run.output).toContain('denied: policy X')
  })
})
