
export interface CleanupRegistrar {
  registerCleanup: (fn: () => void | Promise<void>) => void
}

function maxWaitFrom(watchdogMs: number): number {
  return Math.floor(watchdogMs / 2)
}

export interface GoalCancellation {
  readonly signal: AbortSignal
  shutdown: () => void
}

export interface CancellationOptions {
  readonly watchdogMs: number
}

export function createGoalCancellation(
  reg: CleanupRegistrar,
  opts: CancellationOptions,
): GoalCancellation {
  if (!Number.isFinite(opts.watchdogMs) || opts.watchdogMs <= 0) {
    throw new RangeError(
      `goal cancellation: watchdog must be positive and finite, got ${opts.watchdogMs}`,
    )
  }
  const waitCap = maxWaitFrom(opts.watchdogMs)
  const controller = new AbortController()
  let resolver: () => void = () => {}
  const shutdownSignalled = new Promise<void>((resolve) => {
    resolver = resolve
  })
  let alreadyShutDown = false
  const shutdown = (): void => {
    if (alreadyShutDown) return
    alreadyShutDown = true
    resolver()
  }

  reg.registerCleanup(async () => {
    controller.abort()
    let timer: NodeJS.Timeout | undefined
    const giveUp = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitCap)
      timer.unref()
    })
    await Promise.race([shutdownSignalled, giveUp])
    if (timer !== undefined) clearTimeout(timer)
  })

  return { signal: controller.signal, shutdown }
}
