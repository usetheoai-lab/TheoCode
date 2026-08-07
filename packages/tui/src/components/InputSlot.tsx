import type { Dispatch, ReactElement, SetStateAction } from 'react'

import { PermissionPrompt, type PendingApproval } from '@theokit/tui'

import { formatApproval } from '../formatting/index.js'
import type { ApprovalMode } from '../consent/index.js'
import type { ReasoningEffort } from '@theocode/agent/config'
import type { Mode, ToastPayload } from '../screen-types.js'
import { TrustGate, HooksGate } from './ConsentGates.js'
import { ConversationSlot } from './ConversationSlot.js'

export interface InputSlotProps {
  readonly trusted: boolean
  readonly consent: SlotConsent
  readonly pendingHooks: SlotConsent['pendingHooks']
  readonly pendingApproval: PendingApproval | undefined
  readonly pendingQuestion: string | undefined
  readonly loginProvider: string | undefined
  readonly mode: Mode
  readonly elapsed: number
  readonly exitArmed: boolean
  readonly clearEpoch: number
  readonly lastUsage: { totalTokens?: number } | undefined
  readonly backtrack: { sementeDoComposer: string }
  readonly SESSION: {
    cfg: () => { approvalMode: ApprovalMode }
    reloadConfig: () => void
    effort: () => ReasoningEffort
  }
  readonly currentSessionId: () => string
  readonly handleSubmit: (text: string) => void
  readonly settleApproval: (approvalId: string, approved: boolean) => void
  readonly backToChat: () => void
  readonly exit: () => void
  readonly setToast: Dispatch<SetStateAction<ToastPayload | null>>
  readonly setComposerText: Dispatch<SetStateAction<string>>
  readonly setPendingQuestion: Dispatch<SetStateAction<string | undefined>>
  readonly setLoginProvider: Dispatch<SetStateAction<string | undefined>>
  readonly setApprovalMode: Dispatch<SetStateAction<ApprovalMode>>
  readonly setEffort: Dispatch<SetStateAction<ReasoningEffort>>
  readonly setShowHelp: Dispatch<SetStateAction<boolean>>
}

type SlotConsent = ReturnType<typeof import('../consent/index.js').useConsent>
// B-011 — the SDK exports this exact shape as `PendingApproval`, and it is the shape
// `findPendingApproval` returns. This file declared a byte-identical copy, making three independent
// declarations of one fact; a field added upstream would reach none of them.

function ApprovalCard({
  approval,
  settleApproval,
}: {
  approval: PendingApproval
  settleApproval: (approvalId: string, approved: boolean) => void
}): ReactElement {
  return (
    <PermissionPrompt
      {...formatApproval(approval)}
      onDecision={(decision) => {
        settleApproval(approval.approvalId, decision === 'yes')
      }}
    />
  )
}

export function InputSlot(props: InputSlotProps): ReactElement {
  return (
    <>
      {props.trusted && !props.consent.hooksRevisados && props.pendingHooks.length > 0 ? (
        <HooksGate consent={props.consent} pendingHooks={props.pendingHooks} />
      ) : !props.trusted ? (
        <TrustGate
          consent={props.consent}
          SESSION={props.SESSION}
          setToast={props.setToast}
          setApprovalMode={props.setApprovalMode}
          setEffort={props.setEffort}
          exit={props.exit}
        />
      ) : props.pendingApproval !== undefined ? (
        <ApprovalCard
          approval={props.pendingApproval}
          settleApproval={props.settleApproval}
        />
      ) : (
        <ConversationSlot {...props} />
      )}
    </>
  )
}
