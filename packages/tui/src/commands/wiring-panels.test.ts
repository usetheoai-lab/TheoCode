/**
 * B-070 — `/skills` reports the agent that exists.
 *
 * The three states a user can be in are genuinely different and the panel must not collapse them:
 * no agent built yet, an agent with no skills, and an agent whose skills trust removed.
 */
import { describe, expect, it } from 'vitest'

import { skillsPanelBody } from './wiring-panels.js'

const wired = (skills: { active: string[]; requested: string[]; suppressedByTrust: boolean }) =>
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
