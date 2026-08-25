/**
 * B-069/B-070/B-071 — the record reports what was WIRED, and names what trust removed.
 *
 * The distinction the three items share: a directory that is untrusted wires nothing, which is NOT
 * the same as nothing being configured. Collapsing them sends a user to approve something that was
 * never going to run, or to debug a config that is fine.
 */
import { describe, expect, it } from 'vitest'

import { wiredCapabilities } from './wired-capabilities.js'

const allows = (mcp: boolean, skills: boolean, hooks: boolean, agentsMd = hooks) => ({
  allows: { mcp, skills, hooks, agentsMd },
})

const input = (over: Partial<Parameters<typeof wiredCapabilities>[0]> = {}) => ({
  posture: allows(true, true, true),
  projectSourcesAllowed: true,
  mcpServers: { fixtures: {}, api: {} },
  configuredSkills: ['daily-briefing'],
  hookEvents: ['PreToolUse'],
  agentsMdFiles: ['/repo/AGENTS.md'],
  sandboxMode: 'workspace-write',
  ...over,
})

describe('B-069/B-070/B-071 — wiredCapabilities', () => {
  it('test_reports_what_was_handed_to_the_builder', () => {
    const w = wiredCapabilities(input())
    expect(w.mcp.active).toEqual(['api', 'fixtures'])
    expect(w.skills.active).toEqual(['daily-briefing'])
    expect(w.hooks.active).toEqual(['PreToolUse'])
  })

  it('test_trust_suppression_empties_active_and_keeps_requested', () => {
    // The whole point: `requested` is the only place a user can see what trust took away.
    const w = wiredCapabilities(input({ posture: allows(false, false, false) }))
    expect(w.mcp.active).toEqual([])
    expect(w.mcp.requested).toEqual(['api', 'fixtures'])
    expect(w.mcp.suppressedByTrust).toBe(true)
    expect(w.skills.suppressedByTrust).toBe(true)
    expect(w.hooks.suppressedByTrust).toBe(true)
  })

  it('test_nothing_configured_is_not_reported_as_suppression', () => {
    // A trusted directory with no skills and an untrusted one with no skills are the same
    // emptiness. Flagging the first teaches the user to ignore the flag.
    const w = wiredCapabilities(
      input({
        posture: allows(false, false, false),
        mcpServers: {},
        configuredSkills: [],
        hookEvents: [],
    agentsMdFiles: [],
      }),
    )
    expect(w.mcp.suppressedByTrust).toBe(false)
    expect(w.skills.suppressedByTrust).toBe(false)
    expect(w.hooks.suppressedByTrust).toBe(false)
  })

  it('test_suppression_is_per_capability', () => {
    // Anti-vacuity: a record that flipped all three together would pass the tests above and hide
    // the case that actually happens — MCP gated while skills are fine.
    const w = wiredCapabilities(input({ posture: allows(false, true, true) }))
    expect(w.mcp.active).toEqual([])
    expect(w.skills.active).toEqual(['daily-briefing'])
    expect(w.hooks.active).toEqual(['PreToolUse'])
  })

  it('test_project_sources_reports_whether_they_were_allowed', () => {
    // Found by mutation: pinning this to `true` passed the whole suite. It gates whether
    // `.theokit/agents/*.md` load, and subagents plus repository-declared hooks ride on it — so a
    // stuck `true` means an untrusted repository gets to redirect the model of a squad member.
    expect(wiredCapabilities(input()).projectSources).toBe(true)
    expect(wiredCapabilities(input({ projectSourcesAllowed: false })).projectSources).toBe(false)
  })

  it('test_it_performs_no_io', () => {
    // "No second read" is the DoD bullet B-071 was reopened for. It is checkable here because the
    // function takes already-resolved values: a nonexistent cwd cannot change the answer.
    expect(wiredCapabilities(input()).skills.active).toEqual(['daily-briefing'])
  })
})

/**
 * The wiring half (pillar a). A record nothing publishes is dead code, and the whole point is that
 * a SURFACE can read what the build decided — so the listener is asserted against a real build.
 */
describe('B-069/B-070/B-071 — buildChatAgent publishes the record', () => {
  it('test_the_listener_receives_what_the_build_wired', async () => {
    const { buildChatAgent } = await import('./chat.js')
    let seen: unknown
    buildChatAgent({
      cwd: process.cwd(),
      surface: 'headless',
      onWired: (w) => {
        seen = w
      },
    })
    // Shape, not contents: the contents depend on this repository's own config, and asserting them
    // would make the test a mirror of whatever `.theocode/config.toml` happens to hold.
    expect(seen).toMatchObject({
      mcp: { active: expect.any(Array), requested: expect.any(Array) },
      skills: { active: expect.any(Array) },
      hooks: { active: expect.any(Array) },
      agentsMd: { active: expect.any(Array) },
      projectSources: expect.any(Boolean),
    })
  })
})

/**
 * B-076 — the sandbox mode travels in the record so the footer stops resolving config itself.
 */
describe('B-076 — the record carries the sandbox mode', () => {
  it('test_it_reports_the_mode_the_build_was_given', () => {
    expect(wiredCapabilities(input()).sandboxMode).toBe('workspace-write')
  })

  it('test_it_reports_a_session_override_rather_than_the_configured_value', () => {
    // The whole point: `chatContext` applies the override before this is built, so what arrives
    // here is what the agent got — not what config says.
    expect(wiredCapabilities(input({ sandboxMode: 'read-only' })).sandboxMode).toBe('read-only')
  })
})
