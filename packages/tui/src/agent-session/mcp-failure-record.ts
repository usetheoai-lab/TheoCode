/**
 * B-088 — where the TUI keeps the MCP servers that did not answer during the current turn.
 *
 * A sibling of `wiring-record`, deliberately NOT merged into it: the two answer different questions
 * and have different lifetimes. Wiring is what the last BUILD decided, replaced wholesale per build.
 * A failure is what happened during one RUN, and a server that failed last turn may answer on the
 * next one — so this record is cleared when a turn starts. Without that, the panel would report a
 * recovered server as broken, which is the same class of lie the item was opened about.
 *
 * A module-level holder for the same reason `wiring-record` uses one: there is exactly one agent in
 * this process, the value changes outside render, and threading it through React state would make it
 * pretend to change during one.
 */

/** One server that was configured and could not be listed, as the SDK reported it. */
export interface McpFailure {
  readonly serverName: string
  readonly message: string
}

/**
 * Keyed by server name so the same server failing twice in one turn is ONE broken server. A plain
 * array would list it twice, and a panel showing two entries for one server overstates the damage.
 */
const failures = new Map<string, string>()

export function recordMcpFailure(failure: McpFailure): void {
  failures.set(failure.serverName, failure.message)
}

/** Called when a turn begins — see the note on lifetime above. */
export function startMcpFailureTurn(): void {
  failures.clear()
}

export function currentMcpFailures(): readonly McpFailure[] {
  return [...failures].map(([serverName, message]) => ({ serverName, message }))
}

/** Tests only — the holder outlives a single test otherwise. */
export function resetMcpFailures(): void {
  failures.clear()
}
