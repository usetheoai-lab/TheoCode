import type { TheoThemeProp } from '@theokit/tui'
import { AGENT } from '@theocode/shared/agent'
import { resolveThemeBase } from './theme-base.js'

export const ACCENT = '#d97757'

/**
 * B-073 — resolved once at module load, from the process environment. The resolver itself takes an
 * env argument so it stays deterministic under test; this is the single place that reads the real
 * one. `invalid` is surfaced by `App` rather than dropped here — a module-level side effect would
 * print during test collection.
 */
export const THEME_RESOLUTION = resolveThemeBase(process.env)

export const THEME: TheoThemeProp = {
  base: THEME_RESOLUTION.base, // 'dark' · 'light' · 'no-color'
  override: {
    accent: '', // the input border (the banner uses ACCENT directly, so it always stays colored)
    role: {
      assistant: { glyph: '•  ', prefix: '' },
      user: { prefix: '' }, // the `>` prompt (conversation + input)
    },
    toolStatus: { pending: { glyph: '•' }, success: { glyph: '•' }, failed: { glyph: '•' } },
  },
}

export const LOGO = [
  '████████╗██╗  ██╗███████╗ ██████╗',
  '╚══██╔══╝██║  ██║██╔════╝██╔═══██╗',
  '   ██║   ███████║█████╗  ██║   ██║',
  '   ██║   ██╔══██║██╔══╝  ██║   ██║',
  '   ██║   ██║  ██║███████╗╚██████╔╝',
  '   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ',
].join('\n')

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

export const WIDE_COLS = 90
