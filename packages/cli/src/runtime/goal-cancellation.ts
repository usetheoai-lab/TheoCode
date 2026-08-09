
export interface RegistradorDeCleanup {
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
  reg: RegistradorDeCleanup,
  opts: CancellationOptions,
): GoalCancellation {
  if (!Number.isFinite(opts.watchdogMs) || opts.watchdogMs <= 0) {
    throw new RangeError(
      `cancelamento de goal: watchdog precisa ser positivo e finito, veio ${opts.watchdogMs}`,
    )
  }
  const waitCap = maxWaitFrom(opts.watchdogMs)
  const controller = new AbortController()
  let resolver: () => void = () => {}
  const encerrado = new Promise<void>((resolve) => {
    resolver = resolve
  })
  let jaEncerrou = false
  const shutdown = (): void => {
    if (jaEncerrou) return
    jaEncerrou = true
    resolver()
  }

  reg.registerCleanup(async () => {
    controller.abort()
    let timer: NodeJS.Timeout | undefined
    const desistir = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitCap)
      timer.unref()
    })
    await Promise.race([encerrado, desistir])
    if (timer !== undefined) clearTimeout(timer)
  })

  return { signal: controller.signal, shutdown }
}
