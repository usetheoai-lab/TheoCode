import { useInput } from 'ink'

import { abandonQuestion } from '@theocode/agent/ask'
import type { ScreenState } from '../rendering/index.js'
import { routeKey, type KeyboardState } from './input-router.js'
import { applyKeyActions } from './apply-key-action.js'

export interface KeyboardDeps {
  readonly screen: ScreenState
  readonly agent: { abort: () => void }
  readonly backtrack: {
    rotating: boolean
    armed: boolean
    nth: number
    total: number
    prime: () => void
    resetar: () => void
    advance: (proximo: number, total: number) => void
    confirm: () => void
  }
  readonly goalAbort: { current: AbortController | null }
  readonly pendingQuestion: string | undefined
  readonly pendingApproval: unknown
  readonly trusted: boolean
  readonly streaming: boolean
  readonly goalActive: boolean
  readonly currentSessionId: () => string
  readonly setPendingQuestion: (q: string | undefined) => void
  readonly interruptTurn: () => void
  readonly exit: () => void
}

function keyboardState(deps: KeyboardDeps): KeyboardState {
  const { screen, backtrack, pendingQuestion, pendingApproval, trusted, streaming, goalActive } = deps
  const inDemoInput = screen.mode === 'plan' || screen.mode === 'ask' || screen.mode === 'select'
  return {
    hasOpenQuestion: pendingQuestion !== undefined,
    trusted: trusted,
    hasPendingApproval: Boolean(pendingApproval),
    emDemoInterativa: inDemoInput,
    emLogin: screen.loginProvider !== undefined,
    rotating: backtrack.rotating,
    modo: screen.mode,
    mostrandoUso: screen.showUsage,
    mostrandoDiff: screen.panel !== undefined,
    mostrandoAjuda: screen.showHelp,
    goalAtivo: goalActive,
    transmitindo: streaming,
    backtrackArmed: backtrack.armed,
    composerText: screen.composerText,
    backtrackNth: backtrack.nth,
    backtrackTotal: backtrack.total,
    exitArmed: screen.exitArmed,
  }
}

export function useTuiKeyboard(deps: KeyboardDeps): void {
  const {
    screen,
    agent,
    backtrack,
    goalAbort,
    currentSessionId,
    setPendingQuestion,
    interruptTurn,
    exit,
  } = deps

  useInput((input, key) => {
    const actions = routeKey(input, key, keyboardState(deps))

    applyKeyActions(actions, {
      abandonQuestion: () => {
        abandonQuestion(currentSessionId())
        setPendingQuestion(undefined)
      },
      interruptTurn: interruptTurn,
      irParaChat: () => screen.setMode('chat'),
      cancelarDemo: () => {
        screen.setMode('chat')
        screen.setToast({ message: 'Demo cancelada', variant: 'info' })
      },
      fecharDiff: () => screen.setPanel(undefined),
      fecharUso: () => screen.setShowUsage(false),
      fecharAjuda: () => screen.setShowHelp(false),
      pausarGoal: () => {
        goalAbort.current?.abort()
        agent.abort()
        screen.setToast({ message: 'Goal pausando… (/goal resume retoma)', variant: 'info' })
      },
      primeBacktrack: backtrack.prime,
      resetarBacktrack: backtrack.resetar,
      advanceBacktrack: backtrack.advance,
      confirmBacktrack: backtrack.confirm,
      armExit: () => screen.setExitArmed(true),
      disarmExit: () => screen.setExitArmed(false),
      sair: exit,
    })
  })
}
