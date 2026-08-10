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

/**
 * B-069/B-088 — the servers this agent was GIVEN, which is not the same as the servers that
 * answered. The SDK owns the spawn and returns no per-server outcome here, so a listed name means
 * "handed to the builder", not "healthy". Said out loud rather than left for a reader to assume:
 * a listing that overstates what it knows is worse than none, which B-067 cost a reopened item.
 */
export function mcpPanelBody(wired: WiredCapabilities | undefined): string {
  const body = renderWiredEntity(wired?.mcp, {
    empty: 'no MCP servers are configured for this directory (.mcp.json)',
    suppressed:
      'DIRECTORY UNTRUSTED — these MCP servers are declared and were NOT started. They spawn external processes before any per-tool approval, which is why trust gates them:',
  })
  const listed = wired?.mcp !== undefined && wired.mcp.active.length > 0
  return listed
    ? `${body}\n\nthese were handed to the agent; whether each one answered is not reported here (B-088)`
    : body
}

/**
 * B-071 — the hooks the agent actually wired.
 *
 * This item was REOPENED because its first implementation re-read the config, which its own DoD
 * refuses: "the listing comes from what was actually wired, not from re-reading the config file —
 * those two can disagree, and the disagreement is the bug worth catching." It now reads the record.
 */
export function hooksPanelBody(wired: WiredCapabilities | undefined): string {
  return renderWiredEntity(wired?.hooks, {
    empty: 'no hooks are wired for this directory',
    suppressed:
      'DIRECTORY UNTRUSTED — these hooks are declared and are NOT wired. Nothing below can block a tool call:',
  })
}
