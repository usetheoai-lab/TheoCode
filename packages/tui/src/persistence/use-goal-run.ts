import { useEffect, useState } from 'react'

import { useTurnElapsed } from '@theokit/tui'

import type { GoalRunState } from '../commands/index.js'
import { loadGoalRun, persistGoalRun } from './goal-store.js'

export interface GoalRun {
  readonly goalRun: GoalRunState | null
  readonly setGoalRun: React.Dispatch<React.SetStateAction<GoalRunState | null>>
  readonly goalActive: boolean
  readonly goalBadge: string
}

export function useGoalRun(pointer: string): GoalRun {
  const [goalRun, setGoalRun] = useState<GoalRunState | null>(() => {
    const loaded = loadGoalRun(pointer)
    return loaded !== null && loaded.status === 'active' ? { ...loaded, status: 'paused' } : loaded
  })
  const goalActive = goalRun?.status === 'active'

  useEffect(() => {
    void persistGoalRun(pointer, goalRun)
  }, [pointer, goalRun])

  const goalElapsed = useTurnElapsed(goalActive)
  const goalBadge = rotuloDoGoal(goalRun, goalActive, goalElapsed)
  return { goalRun, setGoalRun, goalActive, goalBadge }
}

function rotuloDoGoal(
  goalRun: GoalRunState | null,
  goalActive: boolean,
  goalElapsed: number,
): string {
  if (goalRun === null) return ''
  if (goalActive) return ` · goal:pursuing (${String(goalElapsed)}s)`
  const total = Math.round(((goalRun.endedAt ?? Date.now()) - goalRun.startedAt) / 1000)
  return ` · goal:${goalRun.status} (${String(total)}s)`
}
