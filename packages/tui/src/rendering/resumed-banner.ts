import { AGENT } from '@theocode/shared/agent'

/**
 * What the transcript area says when it opens.
 *
 * #70 — after `/resume` the screen is the welcome banner and an empty transcript, which is exactly
 * what a command that did nothing looks like. The context IS there (ask about the previous turn and
 * the model answers), so the one thing the user needs — did this work? — is the one thing the screen
 * does not say.
 *
 * Extracted so the sentence has a test. It was an inline ternary inside `useTimeline`, reachable
 * only by rendering the whole timeline, which is why nothing pinned it and why the half that was
 * missing stayed missing.
 *
 * It names `/new` in the same breath deliberately: a user who did not mean to resume needs the way
 * out where they read the state, not somewhere they have to go looking for it.
 */
export function greetingFor(resumed: boolean): string {
  return resumed
    ? `${AGENT.greeting} (resumed — I remember our last conversation; /new to start fresh)`
    : AGENT.greeting
}
