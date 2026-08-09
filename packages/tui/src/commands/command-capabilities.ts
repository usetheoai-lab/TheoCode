import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { ReasoningEffort } from '@theocode/agent/config'
import type { AttachedImage } from '@theocode/agent/context'
import type { ApprovalMode } from '../consent/index.js'
import type { Mode, ContentPanel, ToastPayload } from '../screen-types.js'
import type { CustomCommand } from './custom-commands.js'
import type { GoalRunState } from './goal.js'

export interface SessionTheInterpreterUses {
  attachImages: (images: AttachedImage[] | undefined) => void
  effort: () => ReasoningEffort
  setEffort: (level: ReasoningEffort) => void
  cfg: () => { modelLabel: string; sandboxLabel: string }
  sessionModel: () => string | undefined
  setSessionModel: (model: string) => void
  setModel: (model: string | undefined) => void
  session: () => string
}

export interface PtysTheInterpreterUses {
  backend: () => { activeSessionCount: () => number; killAll: () => void }
}

interface BacktrackUsedByInterpreter {
  setSeed: Dispatch<SetStateAction<string>>
}

export interface AgentTheInterpreterUses {
  send: (input: { message: string }) => void
  reset: () => void
  abort: () => void
}

export interface CommandCapabilities {
  readonly agent: AgentTheInterpreterUses
  readonly SESSION: SessionTheInterpreterUses
  readonly ptyOwner: PtysTheInterpreterUses
  readonly customCommands: ReadonlyMap<string, CustomCommand>
  readonly backtrack: BacktrackUsedByInterpreter
  readonly goalAbort: MutableRefObject<AbortController | null>
  readonly lastSentMessage: MutableRefObject<string | null>
  readonly stdout: { write: (s: string) => void } | undefined
  readonly approvalMode: ApprovalMode
  readonly goalRun: GoalRunState | null
  readonly goalActive: boolean
  readonly currentSessionId: () => string
  readonly forkCurrentSession: () => { newId: string; copied: boolean }
  readonly resetSession: () => void
  readonly startGoal: (
    objective: string,
    base?: { turns: number; tokens: number; startedAt: number },
  ) => void
  readonly exit: () => void
  readonly setToast: Dispatch<SetStateAction<ToastPayload | null>>
  readonly setPanel: Dispatch<SetStateAction<ContentPanel | undefined>>
  readonly setMode: Dispatch<SetStateAction<Mode>>
  readonly setShowHelp: Dispatch<SetStateAction<boolean>>
  readonly setShowUsage: Dispatch<SetStateAction<boolean>>
  readonly setClearEpoch: Dispatch<SetStateAction<number>>
  readonly setEffort: Dispatch<SetStateAction<ReasoningEffort>>
  readonly setApprovalMode: Dispatch<SetStateAction<ApprovalMode>>
  readonly setGoalRun: Dispatch<SetStateAction<GoalRunState | null>>
  readonly setGoalFeed: Dispatch<SetStateAction<string | null>>
  readonly setLoginProvider: Dispatch<SetStateAction<string | undefined>>
  readonly setReviewResult: Dispatch<SetStateAction<string | null>>
}

export type SessionAndScreenCapabilities = Pick<
  CommandCapabilities,
  | 'agent'
  | 'SESSION'
  | 'backtrack'
  | 'goalAbort'
  | 'stdout'
  | 'resetSession'
  | 'setToast'
  | 'setShowHelp'
  | 'setShowUsage'
  | 'setClearEpoch'
  | 'setEffort'
  | 'setGoalRun'
  | 'setGoalFeed'
>

export type IdentityCapabilities = Pick<
  CommandCapabilities,
  'currentSessionId' | 'forkCurrentSession' | 'resetSession' | 'setToast' | 'setLoginProvider'
>

export type TurnCapabilities = Pick<
  CommandCapabilities,
  | 'agent'
  | 'SESSION'
  | 'customCommands'
  | 'lastSentMessage'
  | 'setToast'
  | 'setMode'
  | 'setApprovalMode'
>

export type InspectionCapabilities = Pick<
  CommandCapabilities,
  | 'agent'
  | 'SESSION'
  | 'ptyOwner'
  | 'lastSentMessage'
  | 'approvalMode'
  | 'currentSessionId'
  | 'exit'
  | 'setToast'
  | 'setPanel'
>

export type ShellCapabilities = Pick<CommandCapabilities, 'ptyOwner' | 'setToast'>

export type SteeringCapabilities = Pick<
  CommandCapabilities,
  | 'agent'
  | 'backtrack'
  | 'goalAbort'
  | 'lastSentMessage'
  | 'goalRun'
  | 'goalActive'
  | 'currentSessionId'
  | 'startGoal'
  | 'setToast'
  | 'setClearEpoch'
  | 'setGoalRun'
  | 'setGoalFeed'
  | 'setReviewResult'
>
