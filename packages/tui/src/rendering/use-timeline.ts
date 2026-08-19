import { useMemo } from 'react'

import { readTurnUsage, useCoalesced, type UIMessageLike } from '@theokit/tui'

import { AGENT } from '@theocode/shared/agent'
import { formatToolHeader, formatToolResult } from '../formatting/index.js'
import { latestUsage } from '../formatting/index.js'
import { TUI_MAX_FPS, coalesceWindowMs } from './frame-budget.js'
import { deriveTimeline, prepareThread } from './timeline-memo.js'

interface AgentWithThread {
  thread: Parameters<typeof prepareThread>[0]
}

export interface TuiTimeline {
  readonly events: ReturnType<typeof deriveTimeline>
  readonly lastUsage: ReturnType<typeof readTurnUsage> | undefined
}

export function useTimeline(agent: AgentWithThread, resumed: boolean): TuiTimeline {
  const greeting: UIMessageLike = {
    id: 'greeting',
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: resumed
          ? `${AGENT.greeting} (resumed — I remember our last conversation; /new to start fresh)`
          : AGENT.greeting,
      },
    ],
  }
  const events = useCoalesced(
    () =>
      deriveTimeline([greeting, ...prepareThread(agent.thread)], {
        formatToolHeader,
        formatToolResult,
      }),
    agent.thread,
    // Explicit rather than defaulted: the library's 34ms equals ceil(1000/30) only while
    // TUI_MAX_FPS is 30, and the window must follow the frame rate rather than shadow it.
    { windowMs: coalesceWindowMs(TUI_MAX_FPS) },
  )
  const lastUsage = useMemo(() => latestUsage(agent.thread, readTurnUsage), [agent.thread])
  return { events, lastUsage }
}
