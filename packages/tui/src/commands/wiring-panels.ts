/**
 * B-070 — rendering what the agent actually wired.
 *
 * Reads the record `buildChatAgent` published, never the config. That is the DoD bullet all three
 * listing items share and the one B-071 was reopened for: config and reality can disagree, and the
 * disagreement is the bug worth catching.
 */
import type { WiredCapabilities, WiredEntity } from '@theocode/agent'

/**
 * One entity's lines.
 *
 * The suppressed case lists what was REMOVED rather than showing nothing, because "no skills" and
 * "your skills were dropped because this directory is untrusted" send a user to opposite places.
 */
export function renderWiredEntity(
  entity: WiredEntity | undefined,
  labels: { readonly empty: string; readonly suppressed: string },
): string {
  if (entity === undefined) {
    // Before the first turn no agent exists. Saying "none" here would answer for an agent that was
    // never built.
    return 'no agent has been built yet — send a message first, then ask again'
  }
  if (entity.suppressedByTrust) {
    return `${labels.suppressed}\n${entity.requested.map((n) => `  ${n} (not loaded)`).join('\n')}`
  }
  if (entity.active.length === 0) return labels.empty
  return entity.active.map((n) => `  ${n}`).join('\n')
}

export function skillsPanelBody(wired: WiredCapabilities | undefined): string {
  return renderWiredEntity(wired?.skills, {
    empty: 'no skills are enabled for this directory',
    suppressed:
      'DIRECTORY UNTRUSTED — these skills are configured and were NOT loaded, so nothing in them is steering the agent:',
  })
}
