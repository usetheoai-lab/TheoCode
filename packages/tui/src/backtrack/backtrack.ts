import { CLEAR_SCREEN } from '../terminal-io/index.js'
import { randomUUID } from 'node:crypto'

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Dispatch, SetStateAction } from 'react'

import {
  legacyRootHint,
  forkSessionBeforeUserTurn,
  readUserTurnPreviewsAsync,
} from '@theocode/agent/session'
import { SENTINEL } from '../backtrack-select.js'
import type { ToastPayload } from '../screen-types.js'

export interface ResetBacktrackDeps {
  setRewindPrimed: Dispatch<SetStateAction<boolean>>
  setRewindNth: Dispatch<SetStateAction<number>>
  setRewindCount: Dispatch<SetStateAction<number>>
}

export function resetBacktrack(deps: ResetBacktrackDeps): void {
  deps.setRewindPrimed(false)
  deps.setRewindNth(SENTINEL)
  deps.setRewindCount(0)
}

export interface PrimeBacktrackDeps {
  currentSessionId: () => string
  setRewindPrimed: Dispatch<SetStateAction<boolean>>
  setRewindCount: Dispatch<SetStateAction<number>>
  setRewindNth: Dispatch<SetStateAction<number>>
  setRewindPreviews: Dispatch<SetStateAction<string[]>>
  setToast: Dispatch<SetStateAction<ToastPayload | null>>
}

export async function primeBacktrack(deps: PrimeBacktrackDeps): Promise<void> {
  let previews: string[] = []
  try {
    previews = await readUserTurnPreviewsAsync(deps.currentSessionId())
  } catch {
    deps.setToast({ message: 'Backtrack unavailable: transcript unreadable', variant: 'info' })
    return
  }
  if (previews.length === 0) {
    const hint = legacyRootHint(0, join(homedir(), '.theokit'))
    deps.setToast({ message: hint ?? 'No previous message to edit', variant: 'info' })
    return
  }
  deps.setRewindPrimed(true)
  deps.setRewindCount(previews.length)
  deps.setRewindNth(SENTINEL)
  deps.setRewindPreviews(previews)
  deps.setToast({
    message: 'Esc again to edit a previous message · Enter to confirm',
    variant: 'info',
  })
}

export interface ConfirmBacktrackDeps {
  agent: { reset: () => void }
  setRotacionando: (v: boolean) => void
  stdout: { write: (s: string) => void } | undefined
  setToast: Dispatch<SetStateAction<ToastPayload | null>>
  setComposerSeed: Dispatch<SetStateAction<string>>
  setClearEpoch: Dispatch<SetStateAction<number>>
  resetBacktrack: () => void
  currentSessionId: () => string
  setSessionAndPersist: (id: string) => void
}

export async function confirmBacktrack(
  state: { rewindNth: number },
  deps: ConfirmBacktrackDeps,
): Promise<void> {
  const { rewindNth } = state
  const {
    agent,
    stdout,
    setToast,
    setComposerSeed,
    setClearEpoch,
    currentSessionId,
    setSessionAndPersist,
  } = deps
  if (rewindNth === SENTINEL) return
  const newId = `tui-${randomUUID()}`
  deps.setRotacionando(true)
  try {
    let out: ReturnType<typeof forkSessionBeforeUserTurn>
    try {
      out = await Promise.resolve().then(() =>
        forkSessionBeforeUserTurn(currentSessionId(), newId, rewindNth),
      )
    } catch (e) {
      setToast({ message: `Backtrack failed: ${(e as Error).message}`, variant: 'info' })
      deps.resetBacktrack()
      return
    }
    if (!out.copied) {
      setToast({ message: 'Backtrack: no transcript to fork', variant: 'info' })
      deps.resetBacktrack()
      return
    }
    setSessionAndPersist(newId)
    agent.reset()
    stdout?.write(CLEAR_SCREEN)
    setComposerSeed(out.selectedText ?? '')
    setClearEpoch((e) => e + 1)
    deps.resetBacktrack()
  } finally {
    deps.setRotacionando(false)
  }
  process.stderr.write(`[backtrack] forked ${newId} before user#${rewindNth}\n`)
}
