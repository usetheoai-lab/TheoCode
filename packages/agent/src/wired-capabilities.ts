/**
 * B-069/B-070/B-071 — what the agent ACTUALLY wired, as opposed to what config asked for.
 *
 * Three items each needed a listing, and the obvious implementation for each was to re-read the
 * config from the surface. Their shared DoD bullet refuses that, in the same words: "the listing
 * comes from what was actually wired, not from re-reading the config file — those two can disagree,
 * and the disagreement is the bug worth catching." B-071 was REOPENED for shipping the re-read.
 *
 * So this is derived from the values the builder itself receives, at the point it receives them —
 * the same `posture`, `cfg` and loaded MCP map that reach `.mcp()`, `.skills()` and `.hooks()`.
 * Pure and parameterized: it performs no I/O, which is what makes "no second read" checkable rather
 * than promised.
 *
 * Built ONCE for every consumer. Building it privately per command is what B-085 had to undo for
 * the composer, and there would have been four of them.
 */

export interface WiredEntity {
  /** Names actually handed to the builder. Empty when trust removed them. */
  readonly active: readonly string[]
  /**
   * Names configuration ASKED for. Equal to `active` when nothing was suppressed; the difference is
   * exactly what a user cannot otherwise see.
   */
  readonly requested: readonly string[]
  /** True when the directory's trust posture is what emptied `active`. */
  readonly suppressedByTrust: boolean
}

export interface WiredCapabilities {
  readonly mcp: WiredEntity
  readonly skills: WiredEntity
  readonly hooks: WiredEntity
  /** Whether `.theokit/agents/*.md` were allowed to load — subagents and project hooks ride on it. */
  readonly projectSources: boolean
  /**
   * B-076 — the sandbox mode this build was given, AFTER any session override. The footer used to
   * resolve config itself and therefore kept showing the mode the session started with, while the
   * agent had already been rebuilt with another. Two sources, one label, and the label was wrong.
   */
  readonly sandboxMode: string
}

function entity(requested: readonly string[], allowed: boolean): WiredEntity {
  return {
    active: allowed ? requested : [],
    requested,
    // Only call it suppression when something was actually removed. A trusted directory with no
    // skills and an untrusted one with no skills are the same emptiness, and flagging the first
    // would teach the user to ignore the flag.
    suppressedByTrust: !allowed && requested.length > 0,
  }
}

export function wiredCapabilities(input: {
  readonly posture: { readonly allows: { mcp: boolean; skills: boolean; hooks: boolean } }
  readonly projectSourcesAllowed: boolean
  /** The map handed to `.mcp()` — already loaded, never re-read here. */
  readonly mcpServers: Readonly<Record<string, unknown>>
  readonly configuredSkills: readonly string[]
  /** The hook events handed to `.hooks()`, in the order they were registered. */
  readonly hookEvents: readonly string[]
  readonly sandboxMode: string
}): WiredCapabilities {
  return {
    mcp: entity(Object.keys(input.mcpServers).sort(), input.posture.allows.mcp),
    skills: entity([...input.configuredSkills], input.posture.allows.skills),
    hooks: entity([...input.hookEvents], input.posture.allows.hooks),
    projectSources: input.projectSourcesAllowed,
    sandboxMode: input.sandboxMode,
  }
}
