export interface ConsentState {
  readonly trusted: boolean
  readonly hooksRevisados: boolean
  readonly recusados: ReadonlySet<string>
  readonly epoca: number
}

export function initialState(trusted: boolean): ConsentState {
  return { trusted, hooksRevisados: false, recusados: new Set(), epoca: 0 }
}

export function trust(e: ConsentState): ConsentState {
  return { ...e, trusted: true, epoca: e.epoca + 1 }
}

export function distrust(e: ConsentState): ConsentState {
  return { ...e, trusted: false }
}

export function refuseHook(e: ConsentState, fingerprint: string): ConsentState {
  return { ...e, recusados: new Set([...e.recusados, fingerprint]) }
}

export function persistedApproval(e: ConsentState): ConsentState {
  return { ...e, epoca: e.epoca + 1 }
}

export function markReviewed(e: ConsentState): ConsentState {
  return { ...e, hooksRevisados: true }
}
