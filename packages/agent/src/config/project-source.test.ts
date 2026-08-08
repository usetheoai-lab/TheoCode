/**
 * B-008 — the `project` setting source enables more than subagent discovery.
 *
 * `chat.ts` gated `.settingSources(['project', 'user'])` on `posture.allows.subagents`. But that
 * source is not scoped to subagents: the SDK states twice in its own typings that enabling
 * `"project"` also turns on hooks declared in `.theokit/hooks.json`, and a hook is arbitrary command
 * execution on every tool call.
 *
 * TheoCode's own hooks pass a SECOND gate that the SDK path does not: a per-hook sha256 fingerprint
 * whose entire purpose is catching a hook whose command changed after it was approved
 * (`hook-trust.ts`). Gating the source on the wrong capability meant the fingerprint gate could be
 * sidestepped by declaring the hook where the SDK loads it instead.
 *
 * The trust catalog described the capability as covering `discoverSubagents` only, so the code and
 * its own documentation agreed with each other and both were wrong.
 */
import { describe, expect, it } from 'vitest'

import { projectSourceAllowed } from './project-source.js'

const allows = (over: Partial<{ subagents: boolean; hooks: boolean }> = {}) => ({
  subagents: true,
  hooks: true,
  ...over,
})

describe('B-008 — the project source requires every capability it enables', () => {
  it('test_allowed_when_both_subagents_and_hooks_are_trusted', () => {
    // Anti-vacuity floor: refusing always would satisfy the assertions below.
    expect(projectSourceAllowed(allows())).toBe(true)
  })

  it('test_refused_when_hooks_are_not_trusted', () => {
    expect(
      projectSourceAllowed(allows({ hooks: false })),
      'the source was enabled on the strength of the subagents capability alone, while it also ' +
        'turns on SDK-loaded hooks — arbitrary command execution that skips the fingerprint gate',
    ).toBe(false)
  })

  it('test_refused_when_subagents_are_not_trusted', () => {
    expect(projectSourceAllowed(allows({ subagents: false }))).toBe(false)
  })

  it('test_refused_when_neither_is_trusted', () => {
    expect(projectSourceAllowed(allows({ subagents: false, hooks: false }))).toBe(false)
  })
})
