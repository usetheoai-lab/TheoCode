/**
 * B-030 — the test `coalesced-memo.ts` cited to justify its own export.
 *
 * The docstring said the `export` on `clock` exists "solely so
 * `test_the_clock_is_monotonic_non_decreasing` exercises the clock choice DIRECTLY", and cited
 * `ADR-0023` for the pattern. Neither existed anywhere in the tree. The comment pre-emptively
 * disarmed the dead-code detector, so the export survived on the strength of an artifact nobody
 * checked — the same shape as a fabricated citation in a plan, one level down.
 *
 * The citation is answered rather than deleted, because the decision it names is real: `Date.now()`
 * is not monotonic, and a backwards NTP step or a resume from suspend makes `now - last` negative,
 * which freezes the timeline for the size of the skew. That is a bug fix, and it deserves an
 * assertion. The ADR reference is gone: there is no ADR-0023, and the reasoning stands on its own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clock, shouldDerive } from './coalesced-memo.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('B-030 — the coalescing clock is monotonic', () => {
  it('test_the_clock_is_monotonic_non_decreasing', () => {
    // The name the docstring promised. Successive reads never go backwards.
    const readings = Array.from({ length: 50 }, () => clock())

    for (let i = 1; i < readings.length; i += 1) {
      expect(readings[i], `reading ${String(i)} went backwards`).toBeGreaterThanOrEqual(
        readings[i - 1] ?? 0,
      )
    }
  })

  it('test_the_clock_does_not_move_backwards_when_the_wall_clock_does', () => {
    // The actual decision under test. A backwards NTP adjustment moves `Date.now()` into the past;
    // `performance.now()` is monotonic by specification and is unaffected. Reading the wall clock
    // here would make this assertion fail.
    const before = clock()
    vi.spyOn(Date, 'now').mockReturnValue(0)
    const after = clock()

    expect(after, 'the coalescing clock followed the wall clock backwards').toBeGreaterThanOrEqual(
      before,
    )
  })

  it('test_a_backwards_clock_does_not_freeze_the_timeline', () => {
    // Why the monotonicity matters, at the consumer. With `now < last`, `now - last` is negative and
    // never reaches the window, so the memo would stop deriving for the size of the skew.
    // `shouldDerive` guards it independently, and this pins that guard.
    expect(shouldDerive(5, 1_000_000, 16), 'a backwards clock froze the timeline').toBe(true)
  })

  it('test_the_window_is_still_honoured_going_forwards', () => {
    // Anti-vacuity floor: always returning true would satisfy the assertion above.
    expect(shouldDerive(1_010, 1_000, 16)).toBe(false)
    expect(shouldDerive(1_020, 1_000, 16)).toBe(true)
  })
})
