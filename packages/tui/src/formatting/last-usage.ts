export function ultimoUsage<M, U>(
  thread: readonly M[],
  ler: (m: M) => U | undefined,
): U | undefined {
  for (let i = thread.length - 1; i >= 0; i--) {
    const u = ler(thread[i]!)
    if (u !== undefined) return u
  }
  return undefined
}
