
export const TUI_MAX_FPS = 30

const screenReader = process.env['INK_SCREEN_READER'] === 'true'

export const COALESCE_WINDOW_MS = screenReader
  ? 0
  : TUI_MAX_FPS > 0
    ? Math.max(1, Math.ceil(1000 / TUI_MAX_FPS))
    : 0
