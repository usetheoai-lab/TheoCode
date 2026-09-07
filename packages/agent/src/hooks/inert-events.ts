/**
 * Hook events this product parses and cannot fire.
 *
 * `SessionStart` is the only member, and it is here rather than removed from `HOOK_EVENTS` on
 * purpose: the event is real in Claude Code's vocabulary, this product's parser accepts it, and
 * removing it would turn every existing file that declares one into a boot-time parse failure.
 *
 * Root cause, filed as theokit-sdk#613 and reproduced here so the next reader does not re-derive it:
 * the SDK has two hook subsystems. `HooksExecutor`'s event union is
 * `preRun | postRun | preToolUse | postToolUse | stop`; the `PluginManager` is the only place
 * `on_session_start` is ever fired, and it is populated exclusively from `options.plugins`, which no
 * hook handler reaches. The three events that DO fire here are exactly the three with a member in
 * `HooksExecutor` — the cause predicts the measurement rather than being fitted to it.
 *
 * Delete this file when the upstream fix lands. A list of known-broken things is a liability the
 * moment it stops being true.
 */

/** Events that parse, translate, and never run. */
export const INERT_EVENTS = ['SessionStart'] as const

const NOTE = '— DECLARED BUT NEVER RUNS (theokit-sdk#613)'

/**
 * Annotate the rows of a `/hooks` listing whose event cannot fire.
 *
 * MARKED, not hidden. Dropping the row would answer "was my file read?" with silence, which is a
 * second false answer in place of the first — and `/hooks` is the one place an operator checks.
 *
 * Rows arrive as `${event}  ${command}`, so the event is the first token. Matching on the whole row
 * would mark a `Stop` hook that runs a script called `SessionStart.sh`.
 */
export function markInertEvents(rows: readonly string[]): string[] {
  return rows.map((row) => {
    const event = row.split(/\s+/)[0] ?? ''
    return (INERT_EVENTS as readonly string[]).includes(event) ? `${row}  ${NOTE}` : row
  })
}
