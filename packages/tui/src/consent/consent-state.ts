export interface ConsentState {
  readonly trusted: boolean
  readonly hooksRevisados: boolean
  readonly recusados: ReadonlySet<string>
  readonly epoch: number
}

export function initialState(trusted: boolean): ConsentState {
  return { trusted, hooksRevisados: false, recusados: new Set(), epoch: 0 }
}

export function trust(e: ConsentState): ConsentState {
  return { ...e, trusted: true, epoch: e.epoch + 1 }
}

export function distrust(e: ConsentState): ConsentState {
  return { ...e, trusted: false }
}

export function refuseHook(e: ConsentState, fingerprint: string): ConsentState {
  return { ...e, recusados: new Set([...e.recusados, fingerprint]) }
}

export function persistedApproval(e: ConsentState): ConsentState {
  return { ...e, epoch: e.epoch + 1 }
}

export function markReviewed(e: ConsentState): ConsentState {
  return { ...e, hooksRevisados: true }
}
