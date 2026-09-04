import {
  handleCopy,
  handleExport,
  handleListHooks,
  handleListMcp,
  handleListSkills,
  handleSandbox,
  handleListSubagents,
} from './transcript-commands.js'

import { CLEAR_SCREEN_AND_SCROLLBACK } from '@theokit/tui/terminal'
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
  SettingsCapabilities,
  ShellCapabilities,
  SteeringCapabilities,
} from './command-capabilities.js'
import { initAgents, sendMessage, diffPanel, statusPanel, switchModel } from './command-content.js'
import { currentWiring } from '../agent-session/wiring-record.js'
import { handleAgents } from './agents-panel.js'
import { permissionsPanel } from './permissions-panel.js'
import { storeThemeBase, themeStorePath } from '../theme-store.js'
import { handleTheme } from './theme-command.js'
import { handleStatusline, handleTitle } from './surface-commands.js'
import { handleRaw } from './raw-command.js'
import { handleListPtys, handleStopPtys } from './pty-commands.js'
import { handleGoalVerb } from './goal.js'
import { runReviewCommand } from './review.js'
import type { CommandAction } from './registry.js'
import { workingDirectory } from '../working-directory.js'
import { codexNameAnswer } from './codex-names.js'

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
) => boolean)[] = [
  sessionAndScreen,
  identity,
  turn,
  inspection,
  transcriptOut,
  settings,
  shells,
  conduct,
]

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
      stdout?.write(CLEAR_SCREEN_AND_SCROLLBACK)
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
    case 'codexName':
      // Answered here, in the cheapest group, because it renders nothing and starts no turn — it
      // is one toast. Placing it in `inspection` beside the other question-answering commands
      // would have pushed that switch past its complexity budget for no gain.
      setToast({ message: codexNameAnswer(action.name), variant: 'info' })
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
        setResumed: cap.setResumed,
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
  const { agent, SESSION, customCommands, lastSentMessage, setToast, setMode, setApprovalMode } =
    cap
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
    case 'pwd':
      // A toast, not a panel: this is the shape `/model` with no argument already uses for a
      // one-value answer, and a bordered panel holding a single line would read as a bug.
      setToast({ message: workingDirectory(), variant: 'info' })
      return true
    case 'memoryInfo':
      // B-077 — inspection, not turn: it renders a panel and starts no turn.
      handleMemoryInfo(action.arg, setToast, setPanel, cap.SESSION.cfg().memory)
      return true
    case 'showStatus': {
      setPanel(statusPanel(SESSION, approvalMode, currentSessionId, ptyOwner, currentWiring()))
      return true
    }
    case 'initAgents': {
      initAgents(agent, lastSentMessage, setToast)
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
 *
 * The four inventories moved in behind them, and `/agents` joins them here rather than opening a
 * group of its own: it renders the `/subagents` listing above the `/sessions` one, so it belongs
 * beside the case whose body it shares.
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
    case 'showAgents':
      handleAgents(cap.currentSessionId, cap.setPanel, cap.setToast)
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
    case 'raw':
      // Here rather than in `settings`, because this group's subject is exactly what `/raw` does:
      // it hands text to something outside the frame. Its two neighbours put a reply on the
      // clipboard and in a file; this one puts it in the terminal's own scrollback.
      handleRaw(action.arg, cap.events, cap.writeToScrollback, cap.setToast)
      return true
    default:
      return false
  }
}

/**
 * The knobs — `/permissions` shows the approval and sandbox posture on one screen, `/theme` shows
 * the colour base and switches it for the session, and `/title` and `/statusline` choose which
 * facts the terminal's tab and the footer carry.
 *
 * Its own group rather than four more arms of `inspection`, which is at the complexity ceiling the
 * lint enforces: the precedent `transcriptOut` set is to move work OUT of a full group instead of
 * raising the ceiling.
 *
 * The two newest arms are one action each because the surfaces they configure are subscribed to
 * their stores (`statusline-session.ts`, `title-session.ts`). Nothing has to be re-rendered from
 * here — the write notifies, which is the property `theme-session.tsx` documents as load-bearing.
 *
 * `/permissions` still only reports, and that is the design rather than an unfinished half. Its
 * setters stay where they are — `/approval` in `turn`, `/sandbox` in `transcriptOut` — because the
 * sandbox one arms a confirmation before a loosening, and a second route to the same value would
 * either duplicate that guard or walk around it. `/theme` has no such guard to respect: the colour
 * base grants nothing, so the command that reports it is also the one that sets it.
 */
function settings(action: CommandAction, _text: string, cap: SettingsCapabilities): boolean {
  switch (action.kind) {
    case 'showPermissions':
      cap.setPanel(permissionsPanel(cap.approvalMode, cap.SESSION.cfg().sandboxDetail))
      return true
    case 'theme':
      handleTheme(action.arg, cap.setToast, storeThemeBase, themeStorePath)
      return true
    case 'title':
      handleTitle(action.arg, cap)
      return true
    case 'statusline':
      handleStatusline(action.arg, cap)
      return true
    default:
      return false
  }
}

function shells(action: CommandAction, _text: string, cap: ShellCapabilities): boolean {
  switch (action.kind) {
    case 'listPtys':
      handleListPtys(cap.ptyOwner, cap.setToast)
      return true
    case 'stopPtys':
      handleStopPtys(cap.ptyOwner, cap.setToast)
      return true
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
    case 'commandError': {
      // The half that makes the router's refusal worth having: it has to be SAID.
      //
      // A slash that names nothing used to reach the model as prose and come back answered, so the
      // user read a plausible reply to a command that never ran. Refusing it silently would trade
      // that for a keystroke that does nothing — visibly worse to use, and no easier to diagnose.
      setToast({
        message: `${action.input} — ${action.reason.replaceAll('-', ' ')}`,
        variant: 'error',
      })
      return true
    }
    default:
      return false
  }
}
