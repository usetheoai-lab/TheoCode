/**
 * Durable memory is OFF unless someone asked for it, and it is a CONFIG key rather than a mood.
 *
 * It shipped the other way round: on for every trusted directory, with no key in `config.toml` and
 * only a volatile session switch (`memory-switch.ts`) that reset on the next launch. Codex ships the
 * same capability as a feature with `default_enabled: false` — `codex/codex-rs/features/src/lib.rs`,
 * `key: "memories"`, `Stage::Stable` — so this is not a difference of taste; the reference agent
 * these tests measure against does not turn it on either.
 *
 * Measured 2026-08-25, both halves of the cost:
 *
 *   WRITES  — a summary of every session lands in `<cwd>/.theokit/memory/sessions/`. Running the
 *             agent in someone's repository left files there nobody asked for; 332 KB had
 *             accumulated in this checkout, and a fresh benchmark directory grew one on its first
 *             turn.
 *   READS   — recall from earlier sessions enters later turns, so two identical runs of the same
 *             task can diverge because the second one saw the first. That is the one property a
 *             benchmark against another agent must not have.
 *   SCHEMA  — `memory_search` + `memory_get` add 1,462 chars to the tool set, re-sent on every
 *             round of every turn (17 tools in a directory with no store, 19 with one).
 *
 * These tests pin the DEFAULT and the fact that the key exists. Whether the composed agent honours
 * it is `chat.ts`'s business and is covered there.
 */
import { describe, expect, it } from 'vitest'

import { resolveConfig } from './config.js'

describe('memory is opt-in', () => {
  it('test_it_is_off_when_nobody_configured_it', () => {
    // The whole point. A tool that runs inside someone else's repository does not start writing to
    // it on the strength of a default.
    expect(resolveConfig({}).memory, 'memory defaults to on again').toBe(false)
  })

  it('test_a_user_who_wants_it_can_turn_it_on', () => {
    // Anti-vacuity: hard-coding `false` would satisfy the test above. The capability is real and
    // worth having — the correction is to the default, not to its existence.
    expect(resolveConfig({ user: { memory: true } }).memory).toBe(true)
  })

  it('test_the_project_layer_wins_over_the_user_layer_like_every_other_key', () => {
    // Memory is an ordinary last-wins setting, not a special case. A repository that declares it
    // wants memory gets it; the security floor covers `sandbox_mode`/`approval_policy` and this is
    // deliberately not in that family.
    expect(resolveConfig({ user: { memory: false }, project: { memory: true } }).memory).toBe(true)
    expect(resolveConfig({ user: { memory: true }, project: { memory: false } }).memory).toBe(false)
  })

  it('test_a_non_boolean_is_rejected_rather_than_coerced', () => {
    // `memory = "yes"` in TOML must fail loudly. Coercing it would silently enable writing to the
    // user's repository off a typo.
    expect(() => resolveConfig({ user: { memory: 'yes' } })).toThrow()
  })
})
