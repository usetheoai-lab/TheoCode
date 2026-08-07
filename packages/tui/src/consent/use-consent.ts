import { useCallback, useMemo, useState } from 'react'

import { resolveEffectiveConfig, resolveTrustPosture } from '@theocode/agent/config'
import {
  approveHook,
  classifyHooks,
  loadApprovedHooks,
  parseHooks,
} from '@theocode/agent/hooks'

import {
  persistedApproval,
  trust as trustInState,
  distrust as distrustInState,
  initialState,
  markReviewed as markReviewedInState,
  refuseHook as refuseHookInState,
  type ConsentState,
} from './consent-state.js'
import { computePendingHooks } from './hook-consent.js'

export interface Consent {
  readonly trusted: boolean
  readonly hooksRevisados: boolean
  readonly pendingHooks: ReturnType<typeof computePendingHooks>

  readonly trust: () => void
  readonly distrust: () => void

  readonly aprovarHook: (spec: unknown, aoFalhar: (error: Error) => void) => void
  readonly refuseHook: (fingerprint: string) => void
  readonly markReviewed: () => void
}

export function useConsent(cwd: string = process.cwd()): Consent {
  const [state, setState] = useState<ConsentState>(() =>
    initialState(resolveTrustPosture(cwd).level === 'trusted'),
  )
  const { trusted, hooksRevisados, recusados, epoca } = state

  const pendingHooks = useMemo(() => {
    void epoca
    return computePendingHooks({
      cwd,
      declined: recusados,
      resolveEffectiveConfig,
      parseHooks,
      loadApprovedHooks,
      classifyHooks,
      onError: (err) => process.stderr.write(`[hooks] consent check failed: ${String(err)}\n`),
    })
  }, [cwd, recusados, epoca])

  const aprovarHook = useCallback(
    (spec: unknown, aoFalhar: (error: Error) => void): void => {
      void approveHook(cwd, spec as Parameters<typeof approveHook>[1])
        .then(() => {
          setState(persistedApproval)
        })
        .catch((err: unknown) => {
          aoFalhar(err as Error)
        })
    },
    [cwd],
  )

  return {
    trusted,
    hooksRevisados,
    pendingHooks,
    trust: useCallback(() => {
      setState(trustInState)
    }, []),
    distrust: useCallback(() => {
      setState(distrustInState)
    }, []),
    aprovarHook,
    refuseHook: useCallback((fingerprint: string) => {
      setState((atual) => refuseHookInState(atual, fingerprint))
    }, []),
    markReviewed: useCallback(() => {
      setState(markReviewedInState)
    }, []),
  }
}
