/**
 * `SessionStart` is parsed, translated, and cannot fire. The listing has to say so.
 *
 * Root cause, found in `@theokit/sdk` and filed as theokit-sdk#613: there are two hook subsystems,
 * and `on_session_start` exists in only one of them. `HooksExecutor`'s event union is
 * `preRun | postRun | preToolUse | postToolUse | stop` — the three events that DO fire here are
 * exactly the three with a member in it. The `PluginManager`, which is the only place the SDK ever
 * fires `on_session_start`, is populated exclusively from `options.plugins`; nothing routes a hook
 * handler into it.
 *
 * Until that is fixed upstream, this product must not report the event as active. A hook listed by
 * `/hooks` as wired and never running is worse than an unsupported event: `/hooks` is the one place
 * an operator checks, and there it makes a false statement with a UI attached.
 *
 * It is MARKED rather than hidden. Dropping the row would leave an operator who wrote a
 * `SessionStart` hook seeing nothing at all, and concluding their file was not read — a second
 * false answer in place of the first.
 */
import { describe, expect, it } from 'vitest'

import { INERT_EVENTS, markInertEvents } from './inert-events.js'

describe('an event that cannot fire', () => {
  it('test_it_is_marked_rather_than_reported_as_active', () => {
    expect(markInertEvents(['SessionStart  ./boot.sh'])).toEqual([
      'SessionStart  ./boot.sh  — DECLARED BUT NEVER RUNS (theokit-sdk#613)',
    ])
  })

  it('test_an_event_that_does_fire_is_left_exactly_as_it_was', () => {
    // Anti-vacuity floor: a function that annotated every row would satisfy the arm above, and the
    // annotation would then be noise on the three events that work.
    expect(markInertEvents(['Stop  ./check.sh'])).toEqual(['Stop  ./check.sh'])
  })

  it('test_it_is_not_hidden', () => {
    // The alternative to marking. Hiding the row answers "was my file read?" with silence, which is
    // a second false answer rather than a fix for the first.
    expect(markInertEvents(['SessionStart  ./boot.sh'])).toHaveLength(1)
  })

  it('test_the_inert_set_is_not_empty_so_these_arms_are_not_vacuous', () => {
    expect(INERT_EVENTS.length).toBeGreaterThan(0)
  })

  it('test_a_row_whose_command_contains_an_event_name_is_not_marked', () => {
    // The match is on the EVENT, which is the first token — not on the row. A command called
    // `SessionStart.sh` bound to `Stop` fires perfectly well.
    expect(markInertEvents(['Stop  ./SessionStart.sh'])).toEqual(['Stop  ./SessionStart.sh'])
  })
})
