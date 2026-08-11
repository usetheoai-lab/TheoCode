export const WATCHDOG_MS = 3000

export interface ShutdownDeps {
  timeoutMs: number
  exit: (code: number) => void
  setTimer: (fn: () => void, ms: number) => NodeJS.Timeout
  clearTimer: (t: NodeJS.Timeout) => void
  onError: (err: unknown) => void
}

export interface Shutdown {
  registerCleanup: (fn: () => void | Promise<void>) => void
  runShutdown: () => Promise<void>
  installSignalHandler: (on: (sig: string, fn: () => void) => void) => void
}

export function createShutdown(deps: ShutdownDeps): Shutdown {
  const cleanups: Array<() => void | Promise<void>> = []
  let isShuttingDown = false

  const registerCleanup = (fn: () => void | Promise<void>): void => {
    cleanups.push(fn)
  }

  const runShutdown = async (): Promise<void> => {
    if (isShuttingDown) {
      deps.exit(1)
      return
    }
    isShuttingDown = true
    // B-045 — the exit code is the only thing a caller has. It used to be 1 on every path, so a
    // clean Ctrl-C, a cleanup that threw and a watchdog timeout were indistinguishable to a shell,
    // to CI, and to anything wrapping the process.
    let cleanupFailed = false
    const timer = deps.setTimer(() => {
      deps.exit(1)
    }, deps.timeoutMs)
    try {
      for (const fn of cleanups) {
        try {
          await fn()
        } catch (err) {
          cleanupFailed = true
          deps.onError(err)
        }
      }
    } finally {
      deps.clearTimer(timer)
    }
    deps.exit(cleanupFailed ? 1 : 0)
  }

  const installSignalHandler = (on: (sig: string, fn: () => void) => void): void => {
    for (const sig of ['SIGINT', 'SIGTERM']) {
      on(sig, () => {
        void runShutdown()
      })
    }
  }

  // B-045 — `runShutdown` is on the public surface with no production caller: only
  // `installSignalHandler` invokes it, in response to SIGINT/SIGTERM. It stays exported because
  // `shutdown.test.ts` is its consumer, and the alternative is testing shutdown by sending a real
  // signal to the test process. Unlike the citation this codebase had in `coalesced-memo.ts`, that
  // test exists — see it before trusting this sentence.
  return { registerCleanup, runShutdown, installSignalHandler }
}
