import type { KeyAction } from './input-router.js'

export interface KeyCapabilities {
  readonly abandonQuestion: () => void
  readonly interruptTurn: () => void
  readonly irParaChat: () => void
  readonly cancelarDemo: () => void
  readonly fecharDiff: () => void
  readonly fecharUso: () => void
  readonly fecharAjuda: () => void
  readonly pausarGoal: () => void
  readonly primeBacktrack: () => void
  readonly resetarBacktrack: () => void
  readonly advanceBacktrack: (next: number, total: number) => void
  readonly confirmBacktrack: () => void
  readonly armExit: () => void
  readonly disarmExit: () => void
  readonly sair: () => void
}

const EXECUTORES: ReadonlyMap<KeyAction['kind'], (cap: KeyCapabilities, action: KeyAction) => void> =
  new Map([
    ['abandon-question', (c) => c.abandonQuestion()],
    ['interrupt-turn', (c) => c.interruptTurn()],
    ['close-progress', (c) => c.irParaChat()],
    ['close-demo', (c) => c.cancelarDemo()],
    ['close-diff', (c) => c.fecharDiff()],
    ['close-usage', (c) => c.fecharUso()],
    ['close-help', (c) => c.fecharAjuda()],
    ['pause-goal', (c) => c.pausarGoal()],
    ['prime-backtrack', (c) => c.primeBacktrack()],
    ['reset-backtrack', (c) => c.resetarBacktrack()],
    [
      'advance-backtrack',
      (c, action) => {
        if (action.kind === 'advance-backtrack') c.advanceBacktrack(action.next, action.total)
      },
    ],
    ['confirm-backtrack', (c) => c.confirmBacktrack()],
    ['arm-exit', (c) => c.armExit()],
    ['sair', (c) => c.sair()],
    ['disarm-exit', (c) => c.disarmExit()],
  ])

export function applyKeyActions(actions: readonly KeyAction[], cap: KeyCapabilities): void {
  for (const action of actions) EXECUTORES.get(action.kind)?.(cap, action)
}
