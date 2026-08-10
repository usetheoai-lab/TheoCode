/**
 * B-080 — telling the user the context is running out BEFORE it does.
 *
 * `/compact` was the only compaction path and nothing warned: the failure arrived mid-turn, at the
 * point where the work is least recoverable. The footer showed `used/window` all along, which is
 * data, not a signal — a number climbing slowly is exactly what people stop reading.
 *
 * Pure and parameterized, so the near-limit path is testable without arranging a huge conversation.
 */
export type ContextPressure = 'ok' | 'warn' | 'critical'

/** Fractions of the window at which the two signals fire. */
export const WARN_AT = 0.75
export const CRITICAL_AT = 0.9

export function contextPressure(usedTokens: number, windowTokens: number): ContextPressure {
  // A window of zero or less carries no information — reporting `critical` there would fire the
  // alarm on every session whose model has no declared window.
  if (windowTokens <= 0) return 'ok'
  const used = usedTokens / windowTokens
  if (used >= CRITICAL_AT) return 'critical'
  if (used >= WARN_AT) return 'warn'
  return 'ok'
}

/**
 * The message for a pressure level, or `undefined` when there is nothing to say.
 *
 * It names `/compact` because a warning without the remedy is just anxiety, and it says what
 * compaction costs — a summary replaces the older turns — so the user is choosing, not obeying.
 */
export function contextWarning(level: ContextPressure): string | undefined {
  if (level === 'critical') {
    return 'context is nearly full — run /compact now, or the next turn may fail mid-answer. Compacting summarizes the older turns and keeps the recent ones.'
  }
  if (level === 'warn') {
    return 'context is filling up — /compact summarizes the older turns when you want the room back.'
  }
  return undefined
}
