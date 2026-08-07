import type { TheoThemeProp } from '@theokit/tui'

export const ACCENT = '#d97757'

export const THEME: TheoThemeProp = {
  base: 'dark', // 'dark' · 'light' · 'no-color'
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

export const PLACEHOLDER = 'Ask Theokit Builder anything…'

export const WIDE_COLS = 90
