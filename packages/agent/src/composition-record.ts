import type { EffectiveConfig, TrustPosture } from './config/index.js'
import { projectSourceAllowed } from './config/project-source.js'
import { agentsMdChain } from './context/index.js'
import { parseHooks } from './hooks/index.js'
import type { McpScopes } from './mcp-scopes.js'
import { wiredCapabilities } from './wired-capabilities.js'

/** The hook events, each with the command it runs — see the comment inside for why both. */
function configuredHookEvents(cfg: EffectiveConfig): readonly string[] {
  try {
    // B-071 — event AND command: a listing that showed only the event would tell a user something
    // is allowed to block them without saying what runs, which is the half that matters when the
    // directory came from a clone.
    return parseHooks(cfg.hooks).map((h) => `${h.event}  ${h.command}`)
  } catch {
    return []
  }
}

/**
 * The record of what was just wired, from the values the builder received.
 *
 * Its own function so `buildChatAgent` keeps one statement for it. That was forced by the linter's
 * length ceiling and the ceiling was right: the derivation now carries two MCP scopes, and a record
 * that has grown its own rules is no longer a line of the composition.
 */
export function wiringRecord(
  posture: TrustPosture,
  cwd: string,
  cfg: EffectiveConfig,
  mcp: McpScopes,
): ReturnType<typeof wiredCapabilities> {
  return wiredCapabilities({
    posture,
    projectSourcesAllowed: projectSourceAllowed(posture.allows),
    mcpServers: mcp.servers,
    mcpPersonal: mcp.personal,
    mcpWithheld: mcp.projectWithheld,
    configuredSkills: cfg.skills,
    hookEvents: configuredHookEvents(cfg),
    // The same walk `projectDocument` runs below, so the record and the prompt cannot name
    // different files. Paths only — the record is a listing, never a copy of the instructions.
    agentsMdFiles: agentsMdChain(cwd),
    // Already carries the session override — `chatContext` applied it once, above.
    sandboxMode: cfg.sandbox_mode,
  })
}
