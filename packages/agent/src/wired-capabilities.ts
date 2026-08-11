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
 *
 * B-108 — the derivation is now `@theokit/sdk`'s `recordWiring`, which takes the trust posture as
 * its gate. What stays here is this product's shape: which three capabilities are lists of NAMES
 * (the posture gates eight things, and durable memory is not a list), plus the two fields that are
 * not entities at all — whether project sources loaded, and which sandbox mode the build was given.
 */
import { recordWiring, type WiredEntity } from '@theokit/sdk'

export type { WiredEntity }

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
  const record = recordWiring({
    posture: input.posture,
    requested: {
      // Sorted because the map's key order is insertion order from a JSON file, and a listing whose
      // order changes when someone reorders `.mcp.json` looks like something moved.
      mcp: Object.keys(input.mcpServers).sort(),
      skills: input.configuredSkills,
      hooks: input.hookEvents,
    },
  })

  return {
    ...record,
    projectSources: input.projectSourcesAllowed,
    sandboxMode: input.sandboxMode,
  }
}
