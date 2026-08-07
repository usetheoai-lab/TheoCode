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
    const timer = deps.setTimer(() => {
      deps.exit(1)
    }, deps.timeoutMs)
    try {
      for (const fn of cleanups) {
        try {
          await fn()
        } catch (err) {
          deps.onError(err)
        }
      }
    } finally {
      deps.clearTimer(timer)
    }
    deps.exit(1)
  }

  const installSignalHandler = (on: (sig: string, fn: () => void) => void): void => {
    for (const sig of ['SIGINT', 'SIGTERM']) {
      on(sig, () => {
        void runShutdown()
      })
    }
  }

  return { registerCleanup, runShutdown, installSignalHandler }
}
