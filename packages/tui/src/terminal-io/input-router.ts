import { stepBacktrack } from '../backtrack-select.js'

export interface KeyboardState {
  readonly hasOpenQuestion: boolean
  readonly trusted: boolean
  readonly hasPendingApproval: boolean
  readonly emDemoInterativa: boolean
  readonly emLogin: boolean
  readonly rotating: boolean
  readonly modo: string
  readonly mostrandoUso: boolean
  readonly mostrandoDiff: boolean
  readonly mostrandoAjuda: boolean
  readonly goalAtivo: boolean
  readonly transmitindo: boolean
  readonly backtrackArmed: boolean
  readonly composerText: string
  readonly backtrackNth: number
  readonly backtrackTotal: number
  readonly exitArmed: boolean
}

export interface KeyPress {
  readonly ctrl: boolean
  readonly escape: boolean
  readonly return: boolean
}

export type KeyAction =
  | { readonly kind: 'abandon-question' }
  | { readonly kind: 'interrupt-turn' }
  | { readonly kind: 'close-progress' }
  | { readonly kind: 'close-usage' }
  | { readonly kind: 'close-diff' }
  | { readonly kind: 'close-help' }
  | { readonly kind: 'pause-goal' }
  | { readonly kind: 'prime-backtrack' }
  | { readonly kind: 'reset-backtrack' }
  | { readonly kind: 'advance-backtrack'; readonly proximo: number; readonly total: number }
  | { readonly kind: 'confirm-backtrack' }
  | { readonly kind: 'arm-exit' }
  | { readonly kind: 'sair' }
  | { readonly kind: 'disarm-exit' }
  | { readonly kind: 'close-demo' }

export function routeKey(
  input: string,
  key: KeyPress,
  state: KeyboardState,
): KeyAction[] {
  const ehCtrlC = key.ctrl && input === 'c'

  if (state.hasOpenQuestion) {
    return ehCtrlC ? [{ kind: 'abandon-question' }, { kind: 'interrupt-turn' }] : []
  }

  if (state.emDemoInterativa) return routeInDemo(key, state, ehCtrlC)

  if (!state.trusted || state.hasPendingApproval || state.emLogin || state.rotating) {
    return []
  }

  if (key.escape) return routeEscape(state)
  return routeInComposer(key, state, ehCtrlC)
}

function routeInDemo(
  key: KeyPress,
  state: KeyboardState,
  ehCtrlC: boolean,
): KeyAction[] {
  if (key.escape) return [{ kind: 'close-demo' }]
  if (ehCtrlC) return state.exitArmed ? [{ kind: 'sair' }] : [{ kind: 'arm-exit' }]
  return []
}

function routeInComposer(
  key: KeyPress,
  state: KeyboardState,
  ehCtrlC: boolean,
): KeyAction[] {
  const actions: KeyAction[] = []

  if (state.backtrackArmed) {
    if (key.return) return [{ kind: 'confirm-backtrack' }]
    actions.push({ kind: 'reset-backtrack' })
  }

  if (ehCtrlC) {
    if (state.transmitindo) actions.push({ kind: 'interrupt-turn' })
    else actions.push(state.exitArmed ? { kind: 'sair' } : { kind: 'arm-exit' })
    return actions
  }

  if (state.exitArmed) actions.push({ kind: 'disarm-exit' })
  return actions
}

function routeEscape(state: KeyboardState): KeyAction[] {
  if (state.modo === 'progress') return [{ kind: 'close-progress' }]
  if (state.mostrandoDiff) return [{ kind: 'close-diff' }]
  if (state.mostrandoUso) return [{ kind: 'close-usage' }]
  if (state.mostrandoAjuda) return [{ kind: 'close-help' }]
  if (state.goalAtivo) return [{ kind: 'pause-goal' }]
  if (state.transmitindo) return [{ kind: 'interrupt-turn' }]

  if (!state.backtrackArmed) {
    if (state.composerText.trim().length > 0) return []
    return [{ kind: 'prime-backtrack' }]
  }

  const proximo = stepBacktrack(state.backtrackNth, state.backtrackTotal)
  if (proximo === null) return [{ kind: 'reset-backtrack' }]
  return [{ kind: 'advance-backtrack', proximo, total: state.backtrackTotal }]
}
