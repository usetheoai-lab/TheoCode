/**
 * #74 — a delegated role reads the directory the way the agent that spawned it does.
 *
 * The parent declares `project` and `claudeCode` (`setting-sources.ts`); the child, built through
 * `Agent.create` in `roles.ts`, declared neither. Two consequences, one visible and one not:
 *
 *   trusted, no delegation        -> 0 notices        (measured on the built binary)
 *   trusted, delegating to a role -> 1 notice         ← the child, not the parent
 *
 * The notice is `@theokit/sdk@5.0.1` reporting an undeclared `.claude/`, and it became visible only
 * because usetheokit/theokit-sdk#563 moved it off a channel that is off by default. Behind it sits
 * the real cost: an undeclared directory is not read, so a squad member was held to a narrower view
 * of the workspace than the agent that created it — nobody chose that, and nothing said so.
 *
 * The grant travels as ONE object in the parent for the same reason it is one decision here: a
 * weaker gate on the foreign root would be a bypass named after another product.
 */
import { describe, expect, it, vi } from 'vitest'

import { buildRoleAgent } from './roles.js'

vi.mock('@theokit/agents', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  discoverSubagents: vi.fn(async () => ({
    explorer: { name: 'explorer', prompt: 'explore', description: 'x', sandbox: true },
  })),
}))

const posture = (allows: Record<string, boolean>) =>
  ({ allows, level: allows.subagents === true ? 'trusted' : 'untrusted', source: 'store' }) as never

async function localOf(allows: Record<string, boolean>): Promise<Record<string, unknown>> {
  let seen: Record<string, unknown> = {}
  await buildRoleAgent('explorer', {
    cwd: '/p',
    posture: posture(allows),
    apiKey: 'k',
    parent: { model: 'openai/gpt-5', reasoning_effort: 'medium' },
    sandbox: { kind: 'none' },
    createAgent: async (opts: unknown) => {
      seen = (opts as unknown as { local: Record<string, unknown> }).local
      return {} as never
    },
  } as never)
  return seen
}

describe('#74 — what a delegated role is allowed to read', () => {
  it('test_a_trusted_role_declares_both_roots', async () => {
    const local = await localOf({ subagents: true, hooks: true })

    expect(local.settingSources, 'the child cannot read the project it was spawned in').toEqual([
      'project',
    ])
    expect(
      local.compatSources,
      'the child reads a narrower view of the directory than the agent that spawned it',
    ).toEqual(['claude-code'])
  })

  it('test_an_untrusted_role_declares_neither', async () => {
    // The gate is unchanged: the foreign root never travels further than the native one.
    const local = await localOf({ subagents: false, hooks: false })

    expect(local.settingSources).toEqual([])
    expect(local.compatSources).toBeUndefined()
  })


  it('test_inheriting_the_roots_does_not_cost_the_role_its_sandbox', async () => {
    // The one way this fix could have gone wrong, named by the theokit-sdk session while implementing
    // the same inheritance upstream: `local` is assembled from several conditional pieces, and a
    // second spread of it overwrites rather than merges. Adding the roots that way would drop
    // `sandboxOptions` — trading a capability bug for a default-OPEN security one, which is the wrong
    // direction to trade in.
    //
    // It is correct here by construction (one object literal, no re-spread), and nothing said so:
    // no test in this repository asserted a child's `sandboxOptions` at all. A refactor that
    // extracted a helper between these fields would break it in silence.
    const local = await localOf({ subagents: true, hooks: true })

    expect(local.compatSources, 'precondition: the roots are the thing being inherited').toEqual([
      'claude-code',
    ])
    expect(
      local.sandboxOptions,
      'the role kept its roots and lost its sandbox — a default-open trade',
    ).toEqual({ enabled: true })
  })

  it('test_the_cwd_is_still_there', async () => {
    // Anti-vacuity: a `local` that lost its other fields would satisfy the assertions above.
    expect((await localOf({ subagents: true, hooks: true })).cwd).toBe('/p')
  })
})
