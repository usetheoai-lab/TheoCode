/**
 * B-011 — the welcome banner is the SDK's, not a hand-rolled copy of it.
 *
 * This component rebuilt the two-column welcome box by hand: the bordered frame, the fixed-width
 * left column, the gutter, and the right-hand panel. `WelcomeBanner` does all of that, and the
 * docstring of its `aside` prop names the two headings written out here — "Tips for getting started"
 * and "What's new" — because that prop was built for this layout.
 *
 * It could not be adopted before: `WelcomeBanner` had `aside` but no `art`, and `Banner` had `art`
 * but no `aside`, so neither could draw ASCII art beside a hints panel. Fixed upstream and released
 * as `@theokit/tui@0.50.0`.
 *
 * These tests assert what the user sees, not which component draws it — so the migration is provable
 * rather than assumed, and a future upstream change that drops one of these turns red here.
 */
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'

import { Banner } from './Banner.js'
import { AGENT } from '@theocode/shared/agent'
import { BANNER_TIPS, LOGO } from '../theme.js'

/**
 * The state of `process.stdout.columns` BEFORE any test in this file touched it. Captured at module
 * load because that is the only vantage point that can see the leak: the old cleanup leaked exactly
 * ONCE, on the first probe in the worker, and every later restore then looked correct. A test that
 * captured its own `before` compared the leaked value to itself and passed on the defect — measured
 * with a standalone probe rather than assumed (B-048).
 */
const PRISTINE_COLUMNS = Object.getOwnPropertyDescriptor(process.stdout, 'columns')

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g
const strip = (s: string): string => s.replace(ANSI, '')

/**
 * The width gate reads `process.stdout.columns` GLOBALLY rather than Ink's `useStdout`, so the
 * component cannot be sized by the renderer and a second output would get the first one's layout.
 * Setting the global is therefore the only way to exercise the wide path — and the fact that this
 * is necessary is itself worth recording (see the note in Banner.tsx).
 */
function frame(columns = 120): string {
  const original = Object.getOwnPropertyDescriptor(process.stdout, 'columns')
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true })
  try {
    const instance = render(<Banner />)
    const out = strip(instance.lastFrame() ?? '')
    instance.unmount()
    return out
  } finally {
    // B-048 — restore BOTH ways. Under a non-TTY `process.stdout.columns` is undefined, so
    // `getOwnPropertyDescriptor` returns undefined and the old restore was skipped entirely: the
    // property stayed defined at 120 for whatever ran next in the same worker. Vitest runs files
    // concurrently in one process, so that leaks across files.
    if (original === undefined) delete (process.stdout as { columns?: number }).columns
    else Object.defineProperty(process.stdout, 'columns', original)
  }
}

describe('B-011 — the banner still shows everything it showed before', () => {
  it('test_the_ascii_logo_is_rendered', () => {
    const firstArtLine = LOGO.split('\n').find((l) => l.trim().length > 0) ?? ''

    expect(frame(), 'the ASCII wordmark disappeared from the welcome box').toContain(
      firstArtLine.trim().slice(0, 8),
    )
  })

  it('test_the_product_name_is_rendered', () => {
    expect(frame()).toContain(AGENT.name)
  })

  it('test_the_welcome_line_keeps_its_glyph', () => {
    // Caught by a render probe, not by this suite: migrating to WelcomeBanner I typed the wrong
    // Unicode escape and ✻ (U+273B) silently became ✛ (U+271B). Every presence assertion still
    // passed, because "Welcome to TheoCode" was there — the glyph is part of the identity too.
    expect(frame()).toContain('✻ Welcome to')
  })

  it('test_no_row_runs_past_the_border', () => {
    // Containment, not presence. The previous migration attempt passed every presence test while
    // the aside overflowed the right border — the text was there, just outside the frame.
    const rows = frame()
      .split('\n')
      .filter((l) => l.trim().length > 0)
    const border = rows.find((l) => l.includes('╭')) ?? ''

    expect(Math.max(...rows.map((l) => l.length))).toBeLessThanOrEqual(border.length)
  })

  it('test_the_model_is_rendered', () => {
    expect(frame()).toContain(AGENT.model)
  })

  it('test_the_tips_panel_is_rendered_on_a_wide_terminal', () => {
    const out = frame()

    expect(out).toContain('Tips for getting started')
    expect(out).toContain(BANNER_TIPS[0] ?? '')
  })

  it('test_the_whats_new_panel_is_rendered', () => {
    expect(frame()).toContain("What's new")
  })
})

describe('B-048 — the narrow branch is exercised, and the width probe leaves no trace', () => {
  it('test_a_narrow_terminal_drops_the_side_panel', () => {
    // The branch this file exists to keep visible, and the one that broke three times during the
    // 2026-08-07 remediation. Every other test here sets a WIDE terminal, so the narrow path was
    // never rendered at all.
    const narrow = frame(60)

    expect(narrow, 'the narrow terminal rendered nothing').not.toBe('')
    expect(
      narrow,
      'the tips panel was drawn on a 60-column terminal, where it cannot fit beside the art',
    ).not.toContain(BANNER_TIPS[0] ?? '@@no-tips@@')
  })

  it('test_a_wide_terminal_still_draws_the_side_panel', () => {
    // Anti-vacuity floor: never drawing the panel would satisfy the assertion above.
    expect(frame(120)).toContain(BANNER_TIPS[0] ?? '@@no-tips@@')
  })

  it('test_the_width_probe_leaves_no_trace_in_the_worker', () => {
    frame(200)

    // Captured at MODULE LOAD, before any frame() call — which is the only vantage point that can
    // see this. The old cleanup leaked exactly ONCE, on the first probe in the worker: after that
    // `original` was the leaked value and every later restore looked correct. A test that captured
    // its own `before` therefore compared 120 to 120 and passed on the defect. Measured with a
    // standalone probe rather than assumed.
    expect(
      Object.getOwnPropertyDescriptor(process.stdout, 'columns'),
      'the probe left process.stdout.columns defined for whatever runs next in this worker',
    ).toEqual(PRISTINE_COLUMNS)
  })
})
