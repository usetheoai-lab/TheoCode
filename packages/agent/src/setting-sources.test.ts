/**
 * #65 — the gate, and why `.claude/` is NOT declared here yet.
 *
 * `theokit-sdk#524` put `<cwd>/.claude/` behind an opt-in and `@theokit/agents@13.0.0-next.0`
 * forwards it — through two of its three authoring paths. `AgentBuilder`, the one this product uses,
 * stores the selection raw and never calls `resolveCompatSources`, so the field would compile to
 * nothing. Declaring it was written, measured, and taken back out; `setting-sources.ts` carries the
 * evidence and the one line that lands when the builder path is covered.
 *
 * What these tests pin is the gate that DOES work, and the floor a future `claudeCode` must not
 * fall below: an untrusted directory reaches nothing, and the operator's own home is unaffected by
 * a decision about this repository's code.
 */
import { describe, expect, it } from 'vitest'

import { settingSourcesFor } from './setting-sources.js'

const posture = (allows: Record<string, boolean>) =>
  ({
    allows,
    level: allows.projectConfig === true ? 'trusted' : 'untrusted',
    // `source` travels into the grant, so a refusal downstream can say WHERE the decision came
    // from. Omitting it here made the fixture disagree with every real posture.
    source: 'store',
  }) as never

// `projectSourceAllowed` reads `subagents && hooks` (B-008: the project source enables repository
// hooks too, not only subagent discovery, so it requires both).
const TRUSTED = posture({
  projectConfig: true,
  subagents: true,
  hooks: true,
  skills: true,
  mcp: true,
  memory: true,
  agentsMd: true,
})
const UNTRUSTED = posture({
  projectConfig: false,
  subagents: false,
  hooks: false,
  skills: false,
  mcp: false,
  memory: false,
  agentsMd: false,
})

describe('#65 — the setting-source gate', () => {
  it('test_a_trusted_directory_carries_the_evidence_that_authorised_it', () => {
    // Not a boolean. The grant carries the posture, so a refusal further down can say WHERE the
    // decision came from rather than only that it was refused.
    expect(settingSourcesFor(TRUSTED).project).toEqual({
      trustedBy: { level: 'trusted', source: 'store', allows: { projectSettings: true } },
    })
  })

  it('test_an_untrusted_directory_does_not_even_request_the_root', () => {
    // Absence, not a denying grant: a present-but-denying value would be a claim the gate is on
    // when it is not, and a requested-but-ungranted `project` is a hard refusal upstream.
    expect(settingSourcesFor(UNTRUSTED).project).toBeUndefined()
  })

  it('test_no_foreign_dialect_is_declared_while_the_forward_is_inert', () => {
    // The floor for the change that lands when `AgentBuilder` resolves it. Declaring the field
    // today compiles to nothing, and a control that reads as working and does nothing is worse
    // than an absent one.
    expect(
      (settingSourcesFor(TRUSTED) as Record<string, unknown>).claudeCode,
      'declared before the builder path can carry it — it would compile to nothing',
    ).toBeUndefined()
  })

  it('test_the_user_source_is_unaffected', () => {
    // `user: true` through an untrusted directory is the recorded asymmetry: that gate asks about
    // THIS repository's code, and the operator's home is not the repository.
    expect(settingSourcesFor(UNTRUSTED).user).toBe(true)
    expect(settingSourcesFor(TRUSTED).user).toBe(true)
  })
})
