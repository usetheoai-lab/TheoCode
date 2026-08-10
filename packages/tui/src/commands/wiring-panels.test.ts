/**
 * B-070 — `/skills` reports the agent that exists.
 *
 * The three states a user can be in are genuinely different and the panel must not collapse them:
 * no agent built yet, an agent with no skills, and an agent whose skills trust removed.
 */
import { describe, expect, it } from 'vitest'

import { hooksPanelBody, mcpPanelBody, skillsPanelBody } from './wiring-panels.js'

type Entity = { active: string[]; requested: string[]; suppressedByTrust: boolean }
const EMPTY: Entity = { active: [], requested: [], suppressedByTrust: false }

const wiredMcp = (mcp: Entity) =>
  ({ mcp, skills: EMPTY, hooks: EMPTY, projectSources: true }) as never

const wired = (skills: Entity) =>
  ({
    skills,
    mcp: { active: [], requested: [], suppressedByTrust: false },
    hooks: { active: [], requested: [], suppressedByTrust: false },
    projectSources: true,
  }) as never

describe('B-070 — skillsPanelBody', () => {
  it('test_lists_the_skills_the_agent_actually_loaded', () => {
    const body = skillsPanelBody(
      wired({ active: ['daily-briefing'], requested: ['daily-briefing'], suppressedByTrust: false }),
    )
    expect(body).toContain('daily-briefing')
  })

  it('test_no_agent_yet_is_not_reported_as_no_skills', () => {
    // Before the first turn nothing has been built. Answering "none" would describe an agent that
    // was never constructed — at exactly the moment a user opens the listing.
    expect(skillsPanelBody(undefined)).toContain('no agent has been built yet')
  })

  it('test_trust_suppression_names_what_was_dropped', () => {
    // "No skills" and "your skills were dropped" send a user to opposite places, so the suppressed
    // case LISTS them rather than showing an empty panel.
    const body = skillsPanelBody(
      wired({ active: [], requested: ['daily-briefing'], suppressedByTrust: true }),
    )
    expect(body).toContain('DIRECTORY UNTRUSTED')
    expect(body).toContain('daily-briefing')
    expect(body).toContain('not loaded')
  })

  it('test_a_trusted_directory_with_no_skills_says_so_plainly', () => {
    // Anti-vacuity floor: a panel that always warned would pass the test above.
    expect(skillsPanelBody(wired({ active: [], requested: [], suppressedByTrust: false }))).toBe(
      'no skills are enabled for this directory',
    )
  })
})

/**
 * B-069 — the same three states for MCP, and the suppressed message carries the reason trust gates
 * it at all: these are external processes SPAWNED before any per-tool approval.
 */
describe('B-069 — mcpPanelBody', () => {
  it('test_lists_the_servers_the_agent_started', () => {
    expect(
      mcpPanelBody(wiredMcp({ active: ['fixtures'], requested: ['fixtures'], suppressedByTrust: false })),
    ).toContain('fixtures')
  })

  it('test_no_agent_yet_is_not_reported_as_no_servers', () => {
    expect(mcpPanelBody(undefined)).toContain('no agent has been built yet')
  })

  it('test_trust_suppression_names_the_servers_and_the_reason', () => {
    const body = mcpPanelBody(
      wiredMcp({ active: [], requested: ['fixtures'], suppressedByTrust: true }),
    )
    expect(body).toContain('DIRECTORY UNTRUSTED')
    expect(body).toContain('fixtures')
    expect(body).toContain('spawn external processes')
  })

  it('test_a_trusted_directory_with_no_servers_names_the_file', () => {
    // Anti-vacuity floor, and the file name is the useful half: a user who declared servers
    // elsewhere needs to know where this looked.
    expect(mcpPanelBody(wiredMcp(EMPTY))).toContain('.mcp.json')
  })
})

/**
 * B-088 — the panel must not let a listed name imply health.
 */
describe('B-069/B-088 — /mcp states what it cannot know', () => {
  it('test_a_listed_server_carries_the_caveat', () => {
    const body = mcpPanelBody(
      wiredMcp({ active: ['probe'], requested: ['probe'], suppressedByTrust: false }),
    )
    expect(body).toContain('whether each one answered is not reported here')
  })

  it('test_the_caveat_is_absent_when_nothing_is_listed', () => {
    // Anti-noise floor: a caveat on an empty panel is a warning about nothing.
    expect(mcpPanelBody(wiredMcp(EMPTY))).not.toContain('whether each one answered')
  })
})

/**
 * B-071 — reopened because the first version re-read config. The panel now reports the record, and
 * the untrusted case must not read as protection: those hooks are declared and are NOT running.
 */
describe('B-071 — hooksPanelBody', () => {
  const wiredHooks = (hooks: Entity) =>
    ({ hooks, mcp: EMPTY, skills: EMPTY, projectSources: true }) as never

  it('test_lists_the_wired_hooks_with_event_and_command', () => {
    const body = hooksPanelBody(
      wiredHooks({
        active: ['PreToolUse  ./guard.sh'],
        requested: ['PreToolUse  ./guard.sh'],
        suppressedByTrust: false,
      }),
    )
    expect(body).toContain('PreToolUse')
    expect(body).toContain('./guard.sh')
  })

  it('test_untrusted_says_nothing_below_can_block', () => {
    const body = hooksPanelBody(
      wiredHooks({ active: [], requested: ['PreToolUse  ./guard.sh'], suppressedByTrust: true }),
    )
    expect(body).toContain('DIRECTORY UNTRUSTED')
    expect(body).toContain('NOT wired')
    expect(body.indexOf('DIRECTORY UNTRUSTED')).toBeLessThan(body.indexOf('./guard.sh'))
  })

  it('test_no_agent_yet_is_not_reported_as_no_hooks', () => {
    expect(hooksPanelBody(undefined)).toContain('no agent has been built yet')
  })
})
