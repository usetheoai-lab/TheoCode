import {
  CONTEXT_WINDOW_FLOOR,
  CONTEXT_WINDOW_MARGIN,
  type EffectiveContextWindow,
  resolveEffectiveContextWindow,
} from '@theokit/agents'

export const AGENT = {
  name: 'Theokit Builder',
  model: 'gpt-5.4',
  greeting:
    "Hi — I'm Theokit Builder, a Codex-style coding agent on @theokit/sdk. Ask me anything and I'll stream a reply.",
} as const

export function modelContextWindow(opts: {
  catalogWindow?: number
  override?: number
}): EffectiveContextWindow {
  return resolveEffectiveContextWindow({
    ...(opts.catalogWindow !== undefined ? { catalog: opts.catalogWindow } : {}),
    ...(opts.override !== undefined ? { override: opts.override } : {}),
    margin: CONTEXT_WINDOW_MARGIN,
    floor: CONTEXT_WINDOW_FLOOR,
  })
}
