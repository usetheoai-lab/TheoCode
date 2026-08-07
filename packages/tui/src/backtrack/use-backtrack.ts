import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import { confirmBacktrack as confirmBacktrackCmd, primeBacktrack } from './backtrack.js'
import { armLadder, CLOSED_LADDER, selectTurn, type LadderState } from './backtrack-ladder.js'

export type DepsDeBacktrack = Pick<
  Parameters<typeof confirmBacktrackCmd>[1],
  'agent' | 'stdout' | 'setToast' | 'setClearEpoch' | 'currentSessionId' | 'setSessionAndPersist'
>

export interface BacktrackLadder {
  readonly armed: boolean
  readonly rotating: boolean
  readonly nth: number
  readonly total: number
  readonly previews: readonly string[]
  readonly sementeDoComposer: string
  readonly setSeed: Dispatch<SetStateAction<string>>

  readonly prime: () => void
  readonly advance: (proximo: number, total: number) => void
  readonly resetar: () => void
  readonly confirm: () => void
}

function pedirJanelaDeBacktrack(
  currentSessionId: DepsDeBacktrack['currentSessionId'],
  setToast: DepsDeBacktrack['setToast'],
  aplicar: (ladder: LadderState) => void,
): void {
  let janela: readonly string[] = []
  let quantos = 0
  void primeBacktrack({
    currentSessionId,
    setRewindPreviews: (p) => {
      janela = typeof p === 'function' ? p([...janela]) : p
    },
    setRewindCount: (n) => {
      quantos = typeof n === 'function' ? n(quantos) : n
    },
    setRewindNth: () => undefined,
    setRewindPrimed: (v) => {
      if (v) aplicar(armLadder(janela, quantos))
    },
    setToast,
  })
}

export function useBacktrack(deps: DepsDeBacktrack): BacktrackLadder {
  const [ladder, setLadder] = useState<LadderState>(CLOSED_LADDER)
  const [rotating, setRotacionando] = useState(false)
  const [sementeDoComposer, setSementeDoComposer] = useState('')

  const { setToast, currentSessionId } = deps

  const resetar = useCallback((): void => {
    setLadder(CLOSED_LADDER)
  }, [])

  const prime = useCallback((): void => {
    pedirJanelaDeBacktrack(currentSessionId, setToast, setLadder)
  }, [currentSessionId, setToast])

  const advance = useCallback(
    (proximo: number, quantos: number): void => {
      setLadder((atual) => selectTurn(atual, proximo))
      setToast({
        message: `Backtrack: message ${String(proximo + 1)}/${String(quantos)} — Enter to edit, Esc for older`,
        variant: 'info',
      })
    },
    [setToast],
  )

  const confirm = useCallback((): void => {
    void confirmBacktrackCmd(
      { rewindNth: ladder.nth },
      {
        ...deps,
        setComposerSeed: setSementeDoComposer,
        resetBacktrack: resetar,
        setRotacionando,
      },
    )
  }, [ladder.nth, deps, resetar])

  return {
    armed: ladder.armed,
    rotating,
    nth: ladder.nth,
    total: ladder.total,
    previews: ladder.previews,
    sementeDoComposer,
    setSeed: setSementeDoComposer,
    prime,
    advance,
    resetar,
    confirm,
  }
}
