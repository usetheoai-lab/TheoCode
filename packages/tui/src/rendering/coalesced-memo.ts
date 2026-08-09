import { useEffect, useRef, useState } from 'react'

/**
 * The coalescing clock. **`performance.now()`, not `Date.now()`, and this is a bug fix, not a style
 * choice:** `Date.now()` is not monotonic — an NTP adjustment backwards (or a resume from suspend)
 * makes `now - last` negative and the timeline would **freeze** for the size of the skew.
 * `performance.now()` is monotonic by specification.
 *
 * **Exported even though the only importer is a test, and this is the reason:** the symbol is
 * consumed three times inside this file, and the `export` exists so
 * `test_the_clock_is_monotonic_non_decreasing` (`coalesced-memo.test.ts`) exercises the clock choice
 * DIRECTLY. Un-exporting would delete the only assertion pinning `performance.now` over `Date.now`.
 *
 * B-030 — that test did not exist when this paragraph first claimed it, and neither did the
 * `ADR-0023` the paragraph cited. The comment disarmed the dead-code detector on the strength of two
 * artifacts nobody checked. The test is written now, and its detection power is verified by
 * mutation: swapping in `Date.now()` turns it red. The ADR reference is gone rather than invented —
 * the reasoning above stands without one.
 */
export const clock = (): number => performance.now()

export function shouldDerive(now: number, last: number | undefined, previewWindow: number): boolean {
  if (!Number.isFinite(previewWindow) || previewWindow < 0) {
    throw new RangeError(`invalid window: ${String(previewWindow)}`)
  }
  if (last === undefined) return true
  if (now < last) return true
  return now - last >= previewWindow
}

const NO_KEY_SENTINEL: unique symbol = Symbol('m102/no-key')

interface State<T> {
  value: T | undefined
  key: unknown
  em: number | undefined
  timer: ReturnType<typeof setTimeout> | undefined
}

export function useCoalescedMemo<T>(compute: () => T, key: unknown, previewWindow: number): T {
  const ref = useRef<State<T>>({
    value: undefined,
    key: NO_KEY_SENTINEL,
    em: undefined,
    timer: undefined,
  })
  const [, force] = useState(0)

  const state = ref.current
  if (state.key !== key && shouldDerive(clock(), state.em, previewWindow)) {
    state.value = compute()
    state.key = key
    state.em = clock()
  }

  useEffect(() => {
    const est = ref.current
    if (est.key === key) return
    if (est.timer !== undefined) return
    const wait = Math.max(0, (est.em ?? 0) + previewWindow - clock())
    est.timer = setTimeout(() => {
      est.timer = undefined
      force((n) => n + 1)
    }, wait)
  })

  useEffect(
    () => () => {
      const est = ref.current
      if (est.timer !== undefined) {
        clearTimeout(est.timer)
        est.timer = undefined
      }
    },
    [],
  )

  return state.value as T
}
