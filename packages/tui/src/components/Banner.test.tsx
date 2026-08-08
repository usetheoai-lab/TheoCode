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
    if (original !== undefined) Object.defineProperty(process.stdout, 'columns', original)
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
