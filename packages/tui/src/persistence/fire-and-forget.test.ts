/**
 * B-013 — a background write that fails must be reported, not crash the UI.
 *
 * Two persistence calls were fired with `void` and no handler. `enqueue` attaches a `catch` to the
 * TAIL it stores, not to the promise it returns, so a rejection reached the `void` expression
 * unhandled. `atomicWriteText` genuinely rejects — ENOSPC, EACCES, EROFS, EXDEV — and the declared
 * engine is `node >=22`, whose default is `--unhandled-rejections=throw`. A failed pointer write
 * would terminate the TUI rather than degrade it.
 *
 * Neither extreme is right here: crashing the whole session because a session-id pointer could not
 * be written is disproportionate, and swallowing it silently is Unbreakable Rule 8. So it degrades,
 * loudly, through the diagnostic sink the TUI already routes to `.theokit/tui-stderr.log`.
 */
import { describe, expect, it, vi } from 'vitest'

import { fireAndForget } from './fire-and-forget.js'

describe('B-013 — background writes degrade instead of crashing', () => {
  it('test_a_failing_write_is_reported_and_does_not_reject', async () => {
    const report = vi.fn()
    const boom = new Error('ENOSPC: no space left on device')

    // Must not reject: the caller is a `void` expression with no handler of its own.
    await expect(
      fireAndForget(Promise.reject(boom), 'session pointer', report),
    ).resolves.toBeUndefined()

    expect(report).toHaveBeenCalledOnce()
    expect(report.mock.calls[0]?.[0]).toMatch(/session pointer/)
    expect(report.mock.calls[0]?.[0]).toMatch(/ENOSPC/)
  })

  it('test_a_successful_write_reports_nothing', () => {
    // Anti-vacuity floor: reporting unconditionally would satisfy the assertion above.
    const report = vi.fn()

    return fireAndForget(Promise.resolve('ok'), 'session pointer', report).then(() => {
      expect(report).not.toHaveBeenCalled()
    })
  })

  it('test_a_non_error_rejection_is_still_reported', () => {
    const report = vi.fn()

    return fireAndForget(Promise.reject('plain string'), 'goal state', report).then(() => {
      expect(report).toHaveBeenCalledOnce()
      expect(report.mock.calls[0]?.[0]).toMatch(/goal state/)
    })
  })
})
