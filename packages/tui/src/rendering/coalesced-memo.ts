import { useEffect, useRef, useState } from 'react'

/**
 * The coalescing clock. **`performance.now()`, not `Date.now()`, and this is a bug fix, not a style
 * choice:** `Date.now()` is not monotonic — an NTP adjustment backwards (or a resume from suspend)
 * torna `agora - ultima` negativo e a timeline **congelaria** pelo tamanho do desvio.
 * `performance.now()` is monotonic by specification.
 *
 * **Exported even though the only importer is a test, and this is the reason:** the symbol is
 * consumed three times inside this file, and the `export` exists solely so
 * `test_the_clock_is_monotonic_non_decreasing` exercises the clock choice DIRECTLY. Un-exporting
 * would delete the only assertion pinning the `performance.now` over `Date.now` decision — which is
 * a bug fix, not a style choice. The class is the one `ADR-0023` already records for `ConfigError`:
 * knip counts a test file as an `entry`, so this is not a detector finding; it is a written
 * decision, and it lives here.
 */
export const clock = (): number => performance.now()

export function shouldDerive(agora: number, last: number | undefined, previewWindow: number): boolean {
  if (!Number.isFinite(previewWindow) || previewWindow < 0) {
    throw new RangeError(`invalid window: ${String(previewWindow)}`)
  }
  if (last === undefined) return true
  if (agora < last) return true
  return agora - last >= previewWindow
}

const NO_KEY_SENTINEL: unique symbol = Symbol('m102/sem-key')

interface State<T> {
  value: T | undefined
  key: unknown
  em: number | undefined
  timer: ReturnType<typeof setTimeout> | undefined
}

export function useCoalescedMemo<T>(computar: () => T, key: unknown, previewWindow: number): T {
  const ref = useRef<State<T>>({
    value: undefined,
    key: NO_KEY_SENTINEL,
    em: undefined,
    timer: undefined,
  })
  const [, forcar] = useState(0)

  const state = ref.current
  if (state.key !== key && shouldDerive(clock(), state.em, previewWindow)) {
    state.value = computar()
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
      forcar((n) => n + 1)
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
