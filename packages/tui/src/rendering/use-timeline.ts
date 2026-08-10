import { useMemo } from 'react'

import { readTurnUsage, type UIMessageLike } from '@theokit/tui'

import { AGENT } from '@theocode/shared/agent'
import { formatToolHeader, formatToolResult } from '../formatting/index.js'
import { ultimoUsage } from '../formatting/index.js'
import { useCoalescedMemo } from './coalesced-memo.js'
import { COALESCE_WINDOW_MS } from './frame-budget.js'
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
  const events = useCoalescedMemo(
    () =>
      deriveTimeline([greeting, ...prepareThread(agent.thread)], {
        formatToolHeader,
        formatToolResult,
      }),
    agent.thread,
    COALESCE_WINDOW_MS,
  )
  const lastUsage = useMemo(() => ultimoUsage(agent.thread, readTurnUsage), [agent.thread])
  return { events, lastUsage }
}
