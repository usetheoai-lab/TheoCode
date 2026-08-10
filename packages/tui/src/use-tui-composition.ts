
import {
  credential,
  credentialError,
  credentialSource,
  makeInterruptTurn,
  getTuiRoot,
} from './agent-session/index.js'
import { composerDeps } from './composition/composer-deps.js'
import { useTuiSession } from './composition/use-tui-session.js'
import { useComposerCommands } from './commands/index.js'
import { type ApprovalMode, useApprovals, useConsent } from './consent/index.js'
import { useGoalRun } from './persistence/index.js'
import { useTimeline, useScreenState } from './rendering/index.js'
import { useTuiKeyboard } from './terminal-io/index.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { homedir } from 'node:os'

import { currentQuestion, setListener } from '@theocode/agent/ask'
import { credentialHome } from '@theocode/agent/auth'

import { useBacktrack } from './backtrack/index.js'
import type { ReasoningEffort } from '@theocode/agent/config'

process.env.THEOKIT_AUTH_HOME ??= credentialHome(homedir(), process.env)


function useConversationState(s: ReturnType<typeof useTuiSession>) {
  const { currentSessionId, SESSION } = s
  const consent = useConsent()
  const trusted = consent.trusted
  const pendingHooks = consent.pendingHooks

  const [pendingQuestion, setPendingQuestion] = useState<string | undefined>(undefined)
  useEffect(
    () => setListener(() => setPendingQuestion(currentQuestion(currentSessionId()))),
    [currentSessionId],
  )
  const { goalRun, setGoalRun, goalActive, goalBadge } = useGoalRun(s.GOAL_POINTER)
  const goalAbort = useRef<AbortController | null>(null)
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(() => SESSION.cfg().approvalMode)
  const lastSentMessage = useRef<string | null>(null)
  return {
    consent,
    trusted,
    pendingHooks,
    pendingQuestion,
    setPendingQuestion,
    goalRun,
    setGoalRun,
    goalActive,
    goalBadge,
    goalAbort,
    approvalMode,
    setApprovalMode,
    lastSentMessage,
  }
}


function turnInterrupt(d: {
  agent: { abort: () => void }
  streaming: boolean
  pendingApproval: unknown
  forkCurrentSession: ReturnType<typeof getTuiRoot>['sessionFork']
  screen: { setToast: ReturnType<typeof useScreenState>['setToast'] }
}) {
  const { agent, streaming, pendingApproval, forkCurrentSession, screen } = d
  const interruptTurn = makeInterruptTurn({
    abort: () => {
      agent.abort()
    },
    forkSession: forkCurrentSession,
    hasActiveTurn: () => streaming,
    hasPendingApproval: () => pendingApproval !== undefined && pendingApproval !== null,
    onForkFailure: (e) => {
      screen.setToast({
        message: `Interrupt: fork failed — ${(e as Error).message}`,
        variant: 'error',
      })
    },
  })

  return interruptTurn
}

function useInterruptAndBacktrack(d: {
  screen: ReturnType<typeof useScreenState>
  agent: Parameters<typeof useBacktrack>[0]['agent'] & { abort: () => void }
  stdout: Parameters<typeof useBacktrack>[0]['stdout']
  streaming: boolean
  pendingApproval: unknown
  pendingQuestion: string | undefined
  trusted: boolean
  goalActive: boolean
  goalAbort: { current: AbortController | null }
  currentSessionId: () => string
  forkCurrentSession: ReturnType<typeof getTuiRoot>['sessionFork']
  setSessionAndPersist: ReturnType<typeof getTuiRoot>['pointToSession']
  setPendingQuestion: Dispatch<SetStateAction<string | undefined>>
  exit: () => void
}) {
  const {
    screen,
    agent,
    stdout,
    streaming,
    pendingApproval,
    pendingQuestion,
    trusted,
    goalActive,
    goalAbort,
    currentSessionId,
    setSessionAndPersist,
    setPendingQuestion,
    exit,
  } = d
  const interruptTurn = turnInterrupt(d)
  const backtrack = useBacktrack({
    agent,
    stdout,
    setToast: screen.setToast,
    setClearEpoch: screen.setClearEpoch,
    currentSessionId,
    setSessionAndPersist,
  })

  useTuiKeyboard({
    screen,
    agent,
    backtrack,
    goalAbort,
    pendingQuestion,
    pendingApproval,
    trusted,
    streaming,
    goalActive,
    currentSessionId,
    setPendingQuestion,
    interruptTurn,
    exit,
  })

  return backtrack
}

/**
 * B-055 — show a hook veto.
 *
 * It is invisible on the wire: the SDK surfaces a blocked call as a tool_result with
 * `isError: false` and the message as content, so the model can self-correct. The terminal cannot
 * tell a blocked call from a completed one by looking at the result — which is what made B-027's
 * renderer unreachable — so the signal comes from the veto site instead.
 */
function useHookVetoToasts(
  root: ReturnType<typeof getTuiRoot>,
  setToast: ReturnType<typeof useScreenState>['setToast'],
): void {
  useEffect(() => {
    root.onHookVeto((veto) => {
      setToast({ message: `Blocked ${veto.tool} — ${veto.reason}`, variant: 'error' })
    })
  }, [root, setToast])
}

export function useTuiComposition() {
  const s = useTuiSession()
  const { agent, currentSessionId, stdout, streaming } = s
  const screen = useScreenState()

  useHookVetoToasts(s.ROOT, screen.setToast)

  const conv = useConversationState(s)
  const { setMode } = screen
  const backToChat = useCallback(() => setMode('chat'), [setMode])

  const { events, lastUsage } = useTimeline(agent, s.ROOT.resumeOnStartup)
  const posture = s.SESSION.cfg().sandboxPosture
  const { pendingApproval, settleApproval } = useApprovals(agent, conv.approvalMode, posture)

  const backtrack = useInterruptAndBacktrack({
    screen,
    agent,
    stdout,
    streaming,
    pendingApproval,
    pendingQuestion: conv.pendingQuestion,
    trusted: conv.trusted,
    goalActive: conv.goalActive,
    goalAbort: conv.goalAbort,
    currentSessionId,
    forkCurrentSession: s.forkCurrentSession,
    setSessionAndPersist: s.setSessionAndPersist,
    setPendingQuestion: conv.setPendingQuestion,
    exit: s.exit,
  })

  const { handleSubmit } = useComposerCommands(
    composerDeps(s, screen, {
      backtrack,
      goalAbort: conv.goalAbort,
      lastSentMessage: conv.lastSentMessage,
      approvalMode: conv.approvalMode,
      goalRun: conv.goalRun,
      goalActive: conv.goalActive,
      setGoalRun: conv.setGoalRun,
      setApprovalMode: conv.setApprovalMode,
      credential,
    }, events),
  )

  const c = {
    ...s,
    ...conv,
    screen,
    backToChat,
    pendingApproval,
    settleApproval,
    events,
    lastUsage,
    backtrack,
    handleSubmit,
    credentialError,
    credentialSource,
  }
  return {
    conversationProps: conversationProps(c),
    slotProps: slotProps(c),
    footerProps: footerProps(c),
  }
}

type Composition = Parameters<typeof conversationProps>[0]

function conversationProps(c: {
  screen: ReturnType<typeof useScreenState>
  events: ReturnType<typeof useTimeline>['events']
  streaming: boolean
  elapsed: number
  lastUsage: ReturnType<typeof useTimeline>['lastUsage']
  agent: { error?: Error }
  credentialError: () => string | undefined
  SESSION: { cfg: () => { contextWindow: { window: number } } }
  backtrack: ReturnType<typeof useBacktrack>
  customCommands: ReturnType<typeof getTuiRoot>['customCommands']
}) {
  return {
    clearEpoch: c.screen.clearEpoch,
    events: c.events,
    streaming: c.streaming,
    elapsed: c.elapsed,
    lastUsage: c.lastUsage,
    agentError: c.agent.error,
    credentialError: c.credentialError,
    panel: c.screen.panel,
    showUsage: c.screen.showUsage,
    reviewResult: c.screen.reviewResult,
    goalFeed: c.screen.goalFeed,
    toast: c.screen.toast,
    contextWindow: c.SESSION.cfg().contextWindow.window,
    backtrack: c.backtrack,
    showHelp: c.screen.showHelp,
    customCommands: c.customCommands,
    setToast: c.screen.setToast,
  }
}

function slotProps(c: Composition & SlotExtras) {
  return {
    customCommands: c.customCommands,
    trusted: c.trusted,
    consent: c.consent,
    pendingHooks: c.pendingHooks,
    pendingApproval: c.pendingApproval,
    pendingQuestion: c.pendingQuestion,
    loginProvider: c.screen.loginProvider,
    mode: c.screen.mode,
    elapsed: c.elapsed,
    exitArmed: c.screen.exitArmed,
    clearEpoch: c.screen.clearEpoch,
    lastUsage: c.lastUsage,
    backtrack: c.backtrack,
    SESSION: c.SESSION,
    currentSessionId: c.currentSessionId,
    handleSubmit: c.handleSubmit,
    settleApproval: c.settleApproval,
    backToChat: c.backToChat,
    exit: c.exit,
    setToast: c.screen.setToast,
    setComposerText: c.screen.setComposerText,
    setPendingQuestion: c.setPendingQuestion,
    setLoginProvider: c.screen.setLoginProvider,
    setApprovalMode: c.setApprovalMode,
    setEffort: c.setEffort,
    setShowHelp: c.screen.setShowHelp,
  }
}

function footerProps(c: Composition & FooterExtras) {
  return {
    SESSION: c.SESSION,
    effort: c.effort,
    approvalMode: c.approvalMode,
    goalBadge: c.goalBadge,
    credentialSource: c.credentialSource,
    lastUsage: c.lastUsage,
    // B-046 — the same condition `input-router.ts` gates `?` on. The footer advertised the shortcut
    // unconditionally, including while another surface was mounted or the composer had text, when
    // pressing it does nothing.
    shortcutsAvailable: c.screen.composerText.trim().length === 0,
  }
}

interface SlotExtras {
  trusted: boolean
  consent: ReturnType<typeof useConsent>
  pendingHooks: ReturnType<typeof useConsent>['pendingHooks']
  pendingApproval: ReturnType<typeof useApprovals>['pendingApproval']
  pendingQuestion: string | undefined
  currentSessionId: () => string
  handleSubmit: (text: string) => void
  settleApproval: ReturnType<typeof useApprovals>['settleApproval']
  backToChat: () => void
  exit: () => void
  setPendingQuestion: Dispatch<SetStateAction<string | undefined>>
  setApprovalMode: Dispatch<SetStateAction<ApprovalMode>>
  setEffort: Dispatch<SetStateAction<ReasoningEffort>>
  SESSION: ReturnType<typeof getTuiRoot>['session']
}

interface FooterExtras {
  effort: ReasoningEffort
  approvalMode: ApprovalMode
  goalBadge: string
  credentialSource: () => string
  SESSION: ReturnType<typeof getTuiRoot>['session']
}
