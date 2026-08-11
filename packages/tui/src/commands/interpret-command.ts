import { existsSync } from 'node:fs'
import {
  handleCopy,
  handleExport,
  handleListHooks,
  handleListMcp,
  handleListSkills,
  handleSandbox,
  handleListSubagents,
} from './transcript-commands.js'
import { join } from 'node:path'

import { CLEAR_SCREEN } from '../terminal-io/index.js'
import {
  handleApprovalMode,
  handleCustomCommand,
  handleEffort,
  handleImage,
  handleRetry,
} from './config-commands.js'
import {
  handleArchive,
  handleDelete,
  handleCompact,
  handleFork,
  handleListSessions,
  handleLogin,
  handleLogout,
  handleMemoryInfo,
  handleResume,
  handleRename,
} from './session-commands.js'
import type {
  CommandCapabilities,
  SessionAndScreenCapabilities,
  IdentityCapabilities,
  TurnCapabilities,
  InspectionCapabilities,
  ShellCapabilities,
  SteeringCapabilities,
} from './command-capabilities.js'
import {
  AGENTS_MD_REQUEST,
  sendMessage,
  diffPanel,
  statusPanel,
  switchModel,
} from './command-content.js'
import { handleGoalVerb } from './goal.js'
import { runReviewCommand } from './review.js'
import type { CommandAction } from './registry.js'
import { workingDirectory } from '../working-directory.js'

export function interpretCommand(
  action: CommandAction,
  text: string,
  cap: CommandCapabilities,
): void {
  for (const group of GROUPS) {
    if (group(action, text, cap)) return
  }
}

const GROUPS: readonly ((
  action: CommandAction,
  text: string,
  cap: CommandCapabilities,
) => boolean)[] = [sessionAndScreen, identity, turn, inspection, transcriptOut, shells, conduct]

function sessionAndScreen(
  action: CommandAction,
  _text: string,
  cap: SessionAndScreenCapabilities,
): boolean {
  const {
    agent,
    SESSION,
    backtrack,
    goalAbort,
    stdout,
    resetSession,
    setToast,
    setShowHelp,
    setShowUsage,
    setClearEpoch,
    setEffort,
    setGoalRun,
    setGoalFeed,
  } = cap
  switch (action.kind) {
    case 'noop':
      return true
    case 'new':
    case 'clear':
      resetSession()
      agent.reset()
      SESSION.attachImages(undefined)
      backtrack.setSeed('')
      goalAbort.current?.abort()
      goalAbort.current = null
      setGoalRun(null)
      setGoalFeed(null)
      stdout?.write(CLEAR_SCREEN)
      setClearEpoch((e) => e + 1)
      return true
    case 'effort':
      handleEffort(action.arg, {
        getEffort: () => SESSION.effort(),
        setModuleEffort: (level) => {
          SESSION.setEffort(level)
        },
        setEffort,
        setToast,
      })
      return true
    case 'toggleHelp':
      setShowHelp((h) => !h)
      return true
    case 'toggleUsage':
      setShowUsage((u) => !u)
      return true
    default:
      return false
  }
}

function identity(action: CommandAction, _text: string, cap: IdentityCapabilities): boolean {
  const { currentSessionId, forkCurrentSession, resetSession, setToast, setLoginProvider } = cap
  switch (action.kind) {
    case 'logout':
      handleLogout(setToast)
      return true
    case 'login':
      handleLogin(action.arg, setToast, (provider) => {
        setLoginProvider(provider)
      })
      return true
    case 'fork':
      handleFork(forkCurrentSession, setToast)
      return true
    case 'listSessions':
      handleListSessions(currentSessionId, setToast)
      return true
    case 'resume':
      handleResume(action.arg, {
        currentSessionId,
        streaming: cap.streaming,
        setSessionAndPersist: cap.setSessionAndPersist,
        setClearEpoch: cap.setClearEpoch,
        setToast,
      })
      return true
    case 'archive':
      handleArchive(action.arg, { currentSessionId, resetSession, setToast })
      return true
    case 'delete':
      handleDelete(action.arg, { setToast })
      return true
    case 'rename':
      handleRename(action.arg, currentSessionId, setToast)
      return true
    default:
      return false
  }
}

function turn(action: CommandAction, text: string, cap: TurnCapabilities): boolean {
  const { agent, SESSION, customCommands, lastSentMessage, setToast, setMode, setApprovalMode } = cap
  switch (action.kind) {
    case 'image':
      handleImage(action.arg, {
        setPendingImages: (images) => {
          SESSION.attachImages(images)
        },
        setToast,
      })
      return true
    case 'retry':
      handleRetry({
        lastSent: lastSentMessage.current,
        send: (message) => agent.send({ message }),
        setToast,
      })
      return true
    case 'mode':
      setMode(action.mode)
      return true
    case 'approvalMode':
      handleApprovalMode(action.arg, { setApprovalMode, setToast })
      return true
    case 'custom':
      handleCustomCommand(action.name, action.arg, text, customCommands.get(action.name), {
        send: (message) => agent.send({ message }),
        setLastSent: (message) => {
          lastSentMessage.current = message
        },
        setPendingModel: (model) => {
          SESSION.setModel(model)
        },
        setToast,
      })
      return true
    default:
      return false
  }
}

function inspection(action: CommandAction, _text: string, cap: InspectionCapabilities): boolean {
  const {
    agent,
    SESSION,
    ptyOwner,
    lastSentMessage,
    approvalMode,
    currentSessionId,
    exit,
    setToast,
    setPanel,
  } = cap
  switch (action.kind) {
    case 'quit':
      exit()
      return true
    case 'memoryInfo':
      // B-077 — inspection, not turn: it renders a panel and starts no turn.
      handleMemoryInfo(action.arg, setToast, setPanel)
      return true
    case 'showStatus': {
      setPanel(statusPanel(SESSION, approvalMode, currentSessionId, ptyOwner))
      return true
    }
    case 'initAgents': {
      if (existsSync(join(workingDirectory(), 'AGENTS.md'))) {
        setToast({
          message: 'AGENTS.md already exists — delete it first if you want to regenerate it',
          variant: 'info',
        })
        return true
      }
      agent.send({ message: AGENTS_MD_REQUEST })
      lastSentMessage.current = AGENTS_MD_REQUEST
      return true
    }
    case 'showDiff': {
      const panel = diffPanel()
      if (panel === undefined) {
        setToast({ message: 'no diff: this directory is not a git repository', variant: 'info' })
        return true
      }
      setPanel(panel)
      return true
    }
    case 'model': {
      switchModel(action.arg, SESSION, setToast)
      return true
    }
    case 'compact':
      handleCompact(SESSION.session(), setToast)
      return true
    default:
      return false
  }
}

/**
 * B-075 — getting the conversation OUT of the terminal. Its own group rather than another arm of
 * `inspection`: those commands render a panel back into the TUI, these two hand text to something
 * outside it, and folding them in pushed `inspection` past its complexity budget.
 */
function transcriptOut(action: CommandAction, _text: string, cap: InspectionCapabilities): boolean {
  switch (action.kind) {
    case 'copy':
      handleCopy(cap.events, cap.setToast)
      return true
    case 'export':
      handleExport(action.arg, cap.events, cap.currentSessionId, cap.setToast)
      return true
    case 'listSubagents':
      handleListSubagents(cap.setPanel)
      return true
    case 'listHooks':
      handleListHooks(cap.setPanel)
      return true
    case 'listSkills':
      handleListSkills(cap.setPanel)
      return true
    case 'listMcp':
      handleListMcp(cap.setPanel)
      return true
    case 'sandbox':
      handleSandbox(action.arg, () => cap.SESSION.cfg().sandboxLabel, cap.setToast)
      return true
    default:
      return false
  }
}

function shells(action: CommandAction, _text: string, cap: ShellCapabilities): boolean {
  const { ptyOwner, setToast } = cap
  switch (action.kind) {
    case 'listPtys': {
      const n = ptyOwner.backend().activeSessionCount()
      setToast({
        message:
          n === 0
            ? 'No background shell sessions'
            : `${String(n)} background shell session(s) — /stop ends all of them`,
        variant: 'info',
      })
      return true
    }
    case 'stopPtys': {
      const before = ptyOwner.backend().activeSessionCount()
      ptyOwner.backend().killAll()
      setToast({
        message:
          before === 0
            ? 'Nothing to stop — no background sessions'
            : `${String(before)} background shell session(s) ended`,
        variant: before === 0 ? 'info' : 'success',
      })
      return true
    }
    default:
      return false
  }
}

function conduct(action: CommandAction, _text: string, cap: SteeringCapabilities): boolean {
  const {
    agent,
    backtrack,
    goalAbort,
    lastSentMessage,
    goalRun,
    goalActive,
    currentSessionId,
    startGoal,
    setToast,
    setClearEpoch,
    setGoalRun,
    setGoalFeed,
    setReviewResult,
  } = cap
  switch (action.kind) {
    case 'review': {
      void runReviewCommand(
        action.arg,
        { getSessionId: currentSessionId },
        { setReviewResult, setToast },
      )
      return true
    }
    case 'goal': {
      handleGoalVerb(
        action.arg,
        { goalRun, goalActive },
        {
          goalAbort,
          agent,
          setGoalRun,
          setGoalFeed,
          setToast,
          setComposerSeed: backtrack.setSeed,
          setClearEpoch,
          startGoal,
        },
      )
      return true
    }
    case 'send': {
      sendMessage(action.text, goalActive, agent, lastSentMessage, setToast)
      return true
    }
    default:
      return false
  }
}
