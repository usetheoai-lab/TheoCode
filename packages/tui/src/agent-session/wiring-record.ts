/**
 * B-069/B-070/B-071 — where the TUI keeps what the last agent build actually wired.
 *
 * `buildChatAgent` publishes the record through `onWired` at the moment it decides, and the agent is
 * rebuilt per turn. A module-level holder is the honest shape for that: the record describes THE
 * PROCESS's current agent, there is exactly one, and threading it through React state would make a
 * value that changes outside render pretend it changes during one.
 *
 * `undefined` before the first turn is meaningful and is NOT flattened into an empty record: "no
 * agent has been built yet" and "an agent was built and wired nothing" are different answers, and a
 * listing that showed the second for the first would be lying at exactly the moment a user opens it.
 */
import type { WiredCapabilities } from '@theocode/agent'

let lastWired: WiredCapabilities | undefined

export function recordWiring(wired: WiredCapabilities): void {
  lastWired = wired
}

export function currentWiring(): WiredCapabilities | undefined {
  return lastWired
}

/** Tests only — the holder outlives a single test otherwise. */
export function resetWiring(): void {
  lastWired = undefined
}
