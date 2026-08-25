import type { TheoThemeOverride, TheoThemeProp } from '@theokit/tui'
import { AGENT } from '@theocode/shared/agent'
import { resolveThemeBase, THEME_BASES, type ThemeBase } from './theme-base.js'

export const ACCENT = '#d97757'

/**
 * B-073 — resolved once at module load, from the process environment. The resolver itself takes an
 * env argument so it stays deterministic under test; this is the single place that reads the real
 * one. `invalid` is surfaced by `App` rather than dropped here — a module-level side effect would
 * print during test collection.
 *
 * It is the DEFAULT now rather than the decision: `/theme` can override it for the session
 * (`theme-session.tsx`). What the environment resolved stays readable here so `/status` can report
 * both facts — the base being drawn, and the one the terminal would have picked.
 */
export const THEME_RESOLUTION = resolveThemeBase(process.env)

/**
 * The product's own marks, applied on top of whichever base is active.
 *
 * Hoisted to module scope and shared by all three themes below because it is identical in each: the
 * glyphs and the empty accent are TheoCode's, not the palette's, and writing them out per base
 * would be three copies of one decision.
 */
const OVERRIDE: TheoThemeOverride = {
  accent: '', // the input border (the banner uses ACCENT directly, so it always stays colored)
  role: {
    assistant: { glyph: '•  ', prefix: '' },
    user: { prefix: '' }, // the `>` prompt (conversation + input)
  },
  toolStatus: { pending: { glyph: '•' }, success: { glyph: '•' }, failed: { glyph: '•' } },
}

/**
 * One prop object per base, built ONCE.
 *
 * Not a `themeFor(base)` that composes on demand, and the reason is in the toolkit's own contract:
 * `TheoTUIProvider` memoizes the merged theme on the IDENTITY of the prop, so a freshly allocated
 * object — even one describing the same colours — re-merges and re-renders every consumer on every
 * parent render. Three frozen objects cost three allocations at import and make that class of
 * defect unrepresentable.
 *
 * Keyed by `ThemeBase` rather than the toolkit's own name union so the vocabulary this product
 * validates against (`THEME_BASES`) is the vocabulary it can actually render — a value that parses
 * and then has no theme to draw would be a runtime `undefined` reaching the provider.
 */
export const THEMES: Readonly<Record<ThemeBase, TheoThemeProp>> = Object.freeze(
  Object.fromEntries(THEME_BASES.map((base) => [base, { base, override: OVERRIDE }])) as Record<
    ThemeBase,
    TheoThemeProp
  >,
)

/**
 * The width of the art column, in columns.
 *
 * It is a DECISION, not a measurement of the art. The previous wordmark was 34 columns wide and the
 * column was whatever it happened to measure, so `cwd:` — the longest identity line — was truncated
 * by the size of the logo above it. The column is sized for its widest tenant now and the art is
 * centred INTO it, which is the direction Claude Code sizes its own left column (measured at 52 on
 * a 204-column terminal).
 */
export const LOGO_COLUMNS = 46

/**
 * Pad a line so it sits in the middle of the art column.
 *
 * Padding the STRING is the only lever available: `WelcomeBanner` renders `tagline` and `hints` as
 * plain left-aligned `<Text>` inside a column it owns and the slots take no layout props.
 *
 * BOTH sides are padded, and that is load-bearing rather than tidy: the SDK measures the art block
 * to size the column, so a line padded only on the left leaves the column narrower than
 * `LOGO_COLUMNS` and the centring computed against it lands off. A line already wider than the
 * column is returned untouched — clipping it would be worse than letting it run.
 */
export function centred(line: string): string {
  const width = [...line].length
  if (width >= LOGO_COLUMNS) return line
  const left = Math.floor((LOGO_COLUMNS - width) / 2)
  return ' '.repeat(left) + line + ' '.repeat(LOGO_COLUMNS - width - left)
}

/**
 * The wordmark.
 *
 * Six rows of box-drawing capitals, unchanged — this is the mark the product is recognised by and
 * it is kept deliberately. What changed around it is only the COLUMN it sits in: the art used to
 * define that column at whatever it happened to measure (34), and `cwd:` — the longest identity
 * line under it — was truncated by the size of the logo above it. `LOGO_COLUMNS` sizes the column
 * for its widest tenant now and the art is centred INTO it, so the drawing is identical and the
 * working directory fits.
 *
 * `padEnd` before `centred` is not cosmetic: row 0 is one column short of the other five, and
 * centring a ragged block shifts that row half a column left of the rest. Padding to the widest row
 * first keeps the glyphs in their columns; `Banner.test.tsx` asserts the block comes out uniform,
 * which is what would catch a future edit knocking a row out of line.
 */
const WORDMARK = [
  '████████╗██╗  ██╗███████╗ ██████╗',
  '╚══██╔══╝██║  ██║██╔════╝██╔═══██╗',
  '   ██║   ███████║█████╗  ██║   ██║',
  '   ██║   ██╔══██║██╔══╝  ██║   ██║',
  '   ██║   ██║  ██║███████╗╚██████╔╝',
  '   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ',
]

const WORDMARK_COLUMNS = Math.max(...WORDMARK.map((row) => [...row].length))

export const LOGO = WORDMARK.map((row) =>
  centred(row + ' '.repeat(WORDMARK_COLUMNS - [...row].length)),
).join('\n')

export const BANNER_TIPS = [
  'Ask me anything — I stream a reply',
  '/help  ·  @ mention a file  ·  esc interrupts',
]
export const BANNER_WHATS_NEW = ['Human-in-the-loop approvals', 'Live token usage in the footer']

export const THINKING_PHRASES = [
  'Thinking',
  'Pondering',
  'Noodling',
  'Percolating',
  'Baking',
  'Brewing',
  'Simmering',
  'Conjuring',
  'Musing',
  'Marinating',
]

export const PLACEHOLDER = `Ask ${AGENT.name} anything…`

/**
 * The narrowest terminal that draws the two-column banner.
 *
 * Measured, not guessed. The art column is `LOGO_COLUMNS` and the frame spends 9 more columns on
 * borders, padding, the divider and the gutter, so the panel gets `columns - 55`. The widest row it
 * has to hold is the longest entry of `BANNER_TIPS` (45 columns), and 55 + 45 = 100. Below that the
 * panel is dropped rather than squeezed: at 90 the tips ran ten columns past the right border,
 * which `Banner.test.tsx` now asserts against at exactly this threshold.
 */
export const WIDE_COLS = 100
