/**
 * B-022 — the usage text taught a subcommand the parser does not route.
 *
 * All five USAGE lines read `theocode exec <sub>`. There is no `exec` branch: the token falls
 * through to the prompt, so following the CLI's own documentation starts a BILLABLE model turn
 * instead of running the collector, the reviewer or a goal. `README.md` has it right
 * (`node dist/theocode.mjs sessions gc`), which is what makes this drift rather than ambiguity —
 * and the wrong text is the one shown at the moment the user is already lost.
 *
 * B-025 — this is also the first test in `packages/cli`, which shipped 1292 LOC with none. The
 * parser is pure, has no I/O, and decides whether a command runs or a model turn starts, which
 * makes it the cheapest possible thing to cover and the most expensive thing to leave uncovered.
 */
import { describe, expect, it } from 'vitest'

import { USAGE, parseExecArgs } from './args.js'

/** Every invocation the usage text teaches, as a user would type it after `theocode`. */
const DOCUMENTED = [
  ['sessions', 'gc'],
  ['sessions', 'gc', '--all-projects'],
  ['review', '--uncommitted'],
  ['goal', 'ship the release'],
  ['resume', '--last'],
]

describe('B-022 — every documented invocation routes to its command', () => {
  it.each(DOCUMENTED)('test_documented_invocation_routes: %s %s', (...argv) => {
    const parsed = parseExecArgs(
      argv.filter((a): a is string => a !== undefined),
      false,
    )

    expect(
      parsed.mode,
      `\`${argv.join(' ')}\` fell through to a prompt, which starts a billable model turn`,
    ).not.toBe('run')
  })

  it('test_a_bare_prompt_still_runs_a_turn', () => {
    // Anti-vacuity floor: routing everything away from `run` would satisfy the assertions above.
    expect(parseExecArgs(['explain this repository'], false).mode).toBe('run')
  })

  it('test_the_usage_text_does_not_teach_an_unrouted_subcommand', () => {
    // The drift itself. `exec` is the npm SCRIPT name (`npm run exec`), not a subcommand of the
    // built binary — the usage text baked one into the other.
    const taught = [...USAGE.matchAll(/^\s*(?:Usage:)?\s*theocode\s+(\S+)/gm)].map((m) => m[1])
    const routed = new Set(['resume', 'review', 'goal', 'sessions', '[OPTIONS]'])

    for (const token of taught) {
      expect(routed.has(token ?? ''), `usage teaches \`theocode ${token ?? ''}\`, which is not routed`).toBe(
        true,
      )
    }
  })
})
