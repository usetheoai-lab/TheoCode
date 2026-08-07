import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ApprovalMode } from './approval-mode.js'
import { shouldAutoApprove } from './approval-mode.js'
import {
  createApprovalLedger,
  findNextApproval,
  ingest,
  settle,
  type ApprovalLedger,
} from './pending-approvals.js'

interface AgentWithApproval {
  thread: Parameters<typeof ingest>[1]
  approve: (approvalId: string, decisao: { approved: boolean }) => unknown
}

export interface Approvals {
  readonly pendingApproval: ReturnType<typeof findNextApproval>
  readonly settleApproval: (approvalId: string, approved: boolean) => void
}

export function useApprovals(agent: AgentWithApproval, approvalMode: ApprovalMode): Approvals {
  const registry = useRef<ApprovalLedger>(createApprovalLedger())
  const [epoch, setEpoch] = useState(0)

  const pendingApproval = useMemo(() => {
    void epoch 
    ingest(registry.current, agent.thread)
    return findNextApproval(registry.current)
  }, [agent.thread, epoch])

  const aprovar = agent.approve
  const settleApproval = useCallback(
    (approvalId: string, approved: boolean): void => {
      settle(registry.current, approvalId)
      setEpoch((n) => n + 1)
      void aprovar(approvalId, { approved })
    },
    [aprovar],
  )

  useEffect(() => {
    if (pendingApproval && shouldAutoApprove(approvalMode, pendingApproval.toolName)) {
      settleApproval(pendingApproval.approvalId, true)
    }
  }, [pendingApproval, approvalMode, settleApproval])

  return { pendingApproval, settleApproval }
}
