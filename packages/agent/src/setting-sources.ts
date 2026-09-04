import { projectSettingsPosture, projectSourceAllowed } from './config/project-source.js'
import type { TrustPosture } from './config/index.js'

type Grant = { trustedBy: ReturnType<typeof projectSettingsPosture> }

/**
 * Which configuration roots the framework may read.
 *
 * Lifted out of `chat.ts` when it stopped being a ternary: it is a TRUST GATE, and a gate that has
 * grown a second door belongs where a reader looking for gates will find it.
 *
 * `user: true` survives an untrusted directory, and that asymmetry is deliberate — the gate asks
 * whether THIS repository's code is trusted, and the operator's home is not the repository.
 * `user-agents-md.ts` sets out the reasoning at length.
 *
 * `claudeCode` is NOT declared, and the reason is measured rather than cautious.
 *
 * `@theokit/agents@13.0.0-next.0` forwards it (usetheokit/theokit#634) — through two of its three
 * authoring paths. `defineAgent` resolves it, `SettingSourcesCapability` resolves it, and
 * `AgentBuilder` — the path THIS product uses — stores the selection raw:
 *
 *     settingSources: (selection) => makeBuilder({ ...config, settingSources: selection })
 *
 * So nothing calls `resolveCompatSources`, the compiled agent carries no `compatSources` key
 * (verified against the real builder, not a mock), and `local.compatSources` never reaches
 * `Agent.create`. Declaring it here would be a control that reads as working and does nothing —
 * which is the exact failure #634 held itself back to avoid, one authoring path over. End-to-end
 * check on the built binary: with the field declared, a skill under `.claude/skills/` still never
 * reached the prompt.
 *
 * When the builder path is covered, the change is one line — `claudeCode: grant` — and the grant is
 * already the right one: the SAME evidence `project` takes, because `.claude/` is
 * repository-controlled, usually arrived with the clone, and holds a `hooks.json` that executes
 * shell. A second door with another product's name on it must not be easier to open than the first.
 */
export function settingSourcesFor(posture: TrustPosture): {
  user: true
  project?: Grant
} {
  if (!projectSourceAllowed(posture.allows)) return { user: true }
  return { user: true, project: { trustedBy: projectSettingsPosture(posture) } }
}
