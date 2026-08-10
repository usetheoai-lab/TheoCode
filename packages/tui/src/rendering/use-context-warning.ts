/**
 * B-080 — warn once when the context pressure RISES, never on every turn.
 *
 * A message that repeats each turn is how a warning gets ignored, and the failure this exists to
 * prevent arrives mid-turn where the work is least recoverable. So it fires on the TRANSITION
 * upward and stays quiet until the level changes again — including after a `/compact`, which drops
 * the level and re-arms it honestly.
 */
import { useEffect, useRef } from 'react'

import { contextPressure, contextWarning, type ContextPressure } from '../formatting/index.js'

export function useContextWarning(
  usedTokens: number | undefined,
  windowTokens: number,
  warn: (message: string) => void,
): void {
  const lastLevel = useRef<ContextPressure>('ok')
  useEffect(() => {
    if (usedTokens === undefined) return
    const level = contextPressure(usedTokens, windowTokens)
    const previous = lastLevel.current
    lastLevel.current = level
    // Only upward. Falling back to `ok` after a compaction is good news and needs no toast, and
    // announcing it would train the user to dismiss the channel the bad news arrives on.
    const rose =
      (previous === 'ok' && level !== 'ok') || (previous === 'warn' && level === 'critical')
    if (!rose) return
    const message = contextWarning(level)
    if (message !== undefined) warn(message)
  }, [usedTokens, windowTokens, warn])
}
