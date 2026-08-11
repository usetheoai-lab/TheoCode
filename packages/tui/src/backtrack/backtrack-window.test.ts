/**
 * B-011 — the backtrack window diverges from the SDK's `windowFor`, deliberately.
 *
 * The review flagged `windowAroundSelection` as re-deriving windowing the SDK already computes. It
 * does compute windowing — and two different windowing:
 *
 * - `windowFor` is a TRAILING window: the active row is kept at the BOTTOM ("the M15 trailing
 *   window", per its own docstring). It is the slash-menu behaviour, where new matches arrive below.
 * - This one is CENTRED: the selection sits mid-window, which is what a history scrubber wants —
 *   you move through turns and need to see what is on both sides of where you are.
 *
 * - `WindowView` reports overflow as `overflowUp`/`overflowDown` BOOLEANS. The overlay renders
 *   "N hidden", so it needs counts. A boolean cannot be recovered into a count.
 *
 * So the divergence is real and justified, and the finding's actual point stands: it was nowhere
 * recorded, so the two would drift apart with nothing to notice. These tests are that record — they
 * pin the centred behaviour and the counts, which is what would have to change if anyone ever
 * migrated to `windowFor` (and, per gap U-10, the SDK would first have to report counts at all).
 */
import { describe, expect, it } from 'vitest'

import { windowAroundSelection } from './BacktrackOverlay.js'

const previews = (n: number): string[] => Array.from({ length: n }, (_, i) => `turn-${i}`)

describe('B-011 — the backtrack window is centred, not trailing', () => {
  it('test_the_selection_sits_mid_window_not_at_the_bottom', () => {
    const view = windowAroundSelection(previews(20), 10, 5)

    // Trailing would put index 10 last (start = 6). Centred puts it in the middle (start = 8).
    expect(view.rows[Math.floor(5 / 2)]?.index).toBe(10)
    expect(view.rows.at(-1)?.index).not.toBe(10)
  })

  it('test_it_reports_how_many_are_hidden_not_merely_that_some_are', () => {
    const view = windowAroundSelection(previews(20), 10, 5)

    // `WindowView` would give booleans here; the overlay renders these numbers.
    expect(view.hiddenBefore).toBe(8)
    expect(view.hiddenAfter).toBe(7)
  })

  it('test_the_window_never_starts_before_the_head', () => {
    const view = windowAroundSelection(previews(20), 0, 5)

    expect(view.rows[0]?.index).toBe(0)
    expect(view.hiddenBefore).toBe(0)
  })

  it('test_the_window_never_runs_past_the_tail', () => {
    const view = windowAroundSelection(previews(20), 19, 5)

    expect(view.rows.at(-1)?.index).toBe(19)
    expect(view.hiddenAfter).toBe(0)
  })

  it('test_a_list_that_fits_is_shown_whole', () => {
    const view = windowAroundSelection(previews(3), 1, 5)

    expect(view.rows).toHaveLength(3)
    expect(view.hiddenBefore + view.hiddenAfter).toBe(0)
  })

  it('test_an_empty_list_windows_to_nothing', () => {
    // Anti-vacuity floor: the guard clause has to survive refactors of the arithmetic below it.
    expect(windowAroundSelection([], 0, 5)).toEqual({ rows: [], hiddenBefore: 0, hiddenAfter: 0 })
  })

  it('test_no_selection_anchors_on_the_most_recent_turn', () => {
    const view = windowAroundSelection(previews(20), -1, 5)

    expect(view.rows.at(-1)?.index).toBe(19)
  })
})
