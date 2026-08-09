/**
 * B-045 — the exit code says what happened.
 *
 * `runShutdown` returned 1 on every path: a clean Ctrl-C, a cleanup that threw, and a watchdog
 * timeout were indistinguishable to a shell, to CI, and to anything wrapping the process. An exit
 * code is the only thing a caller has, and this one carried no information.
 */
import { describe, expect, it, vi } from 'vitest'

import { createShutdown } from './shutdown.js'

/** A shutdown wired to spies, with a timer that never fires unless the test fires it. */
function harness(timeoutMs = 1_000) {
  const exit = vi.fn()
  const onError = vi.fn()
  let watchdog: (() => void) | undefined
  const shutdown = createShutdown({
    timeoutMs,
    exit,
    onError,
    setTimer: (fn) => {
      watchdog = fn
      return 1 as unknown as NodeJS.Timeout
    },
    clearTimer: () => {
      watchdog = undefined
    },
  })
  return { shutdown, exit, onError, fireWatchdog: () => watchdog?.() }
}

describe('B-045 — a clean shutdown is distinguishable from a failed one', () => {
  it('test_a_clean_shutdown_exits_zero', async () => {
    const { shutdown, exit } = harness()
    shutdown.registerCleanup(() => Promise.resolve())

    await shutdown.runShutdown()

    expect(exit, 'a clean Ctrl-C reported failure to the shell').toHaveBeenCalledWith(0)
  })

  it('test_a_failed_cleanup_exits_non_zero', async () => {
    const { shutdown, exit, onError } = harness()
    shutdown.registerCleanup(() => Promise.reject(new Error('disk full')))

    await shutdown.runShutdown()

    expect(onError, 'the cleanup failure was not reported').toHaveBeenCalled()
    expect(exit, 'a cleanup that threw reported success').not.toHaveBeenCalledWith(0)
  })

  it('test_a_watchdog_timeout_exits_non_zero', () => {
    const { shutdown, exit, fireWatchdog } = harness()
    shutdown.registerCleanup(() => new Promise(() => undefined))

    void shutdown.runShutdown()
    fireWatchdog()

    expect(exit).toHaveBeenCalledWith(1)
  })

  it('test_a_second_signal_exits_non_zero', async () => {
    // Two Ctrl-Cs mean the user stopped waiting. That is not a clean exit.
    const { shutdown, exit } = harness()
    shutdown.registerCleanup(() => Promise.resolve())

    const first = shutdown.runShutdown()
    await shutdown.runShutdown()
    await first

    expect(exit).toHaveBeenCalledWith(1)
  })
})
