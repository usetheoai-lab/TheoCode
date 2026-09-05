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
 * `claudeCode` reads `<cwd>/.claude/` (#65, usetheokit/theokit#634). It takes the SAME grant
 * `project` takes, and that is the security decision worth stating plainly: `.claude/` is
 * repository-controlled — it usually arrived with the clone — and holds a `hooks.json` that executes
 * shell. A second door with another product's name on it must not be easier to open than the first.
 *
 * Declaring the field and trusting the directory answer two different questions, which is why the
 * framework keeps them in one value: the field says "import another product's configuration", the
 * `TrustPosture` inside says "run code from this directory". This product answers the first yes
 * unconditionally — an adopter's `.claude/` is the reason they are here — and leaves the second to
 * the gate that already existed.
 *
 * Verified end to end on the built binary, one project holding both, trusted directory:
 *
 *     .theokit/agents/native.md   -> delegated, NATIVE-OK
 *     .claude/agents/foreign.md   -> delegated, FOREIGN-OK
 *     .claude/skills/x/SKILL.md   -> body reached the prompt
 *
 * and `local` arriving at the SDK as
 * `{"settingSources":["user","project"],"compatSources":["claude-code"]}`.
 *
 */
export function settingSourcesFor(posture: TrustPosture): {
  user: true
  project?: Grant
  claudeCode?: Grant
} {
  if (!projectSourceAllowed(posture.allows)) return { user: true }
  // One grant object for both, so they cannot drift apart into a weaker gate for the foreign root.
  const grant: Grant = { trustedBy: projectSettingsPosture(posture) }
  return { user: true, project: grant, claudeCode: grant }
}
