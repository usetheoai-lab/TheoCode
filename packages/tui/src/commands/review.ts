import { homedir } from 'node:os'

import { Agent } from '@theokit/agents'

import { resolveCredentialForModel } from '@theocode/agent/auth'
import { resolveEffectiveConfig } from '@theocode/agent/config'
import { createShutdown, WATCHDOG_MS } from '@theocode/shared/shutdown'
import type { Shutdown } from '@theocode/shared/shutdown'
import { createReviewAgent } from '@theocode/agent/review'
import { runReview } from '@theocode/agent/review'
import type { ToastPayload } from '../screen-types.js'
import { workingDirectory } from '../working-directory.js'

export interface ReviewCommandDeps {
  setReviewResult: (r: string | null) => void
  setToast: (t: ToastPayload | null) => void
}

function instalarSinal(encerramento: Shutdown): () => void {
  const instalados: Array<[NodeJS.Signals, () => void]> = []
  encerramento.installSignalHandler((sig, fn) => {
    process.once(sig as NodeJS.Signals, fn)
    instalados.push([sig as NodeJS.Signals, fn])
  })
  return () => {
    for (const [sig, fn] of instalados) process.off(sig, fn)
  }
}

function encerramentoDaReview(setToast: ReviewCommandDeps['setToast']) {
  return createShutdown({
    timeoutMs: WATCHDOG_MS,
    exit: (code) => {
      process.exit(code)
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (t) => {
      clearTimeout(t)
    },
    onError: (err) => {
      setToast({ message: `discarding the review failed: ${String(err)}`, variant: 'error' })
    },
  })
}

async function hookChain(hooks: ReturnType<typeof resolveEffectiveConfig>['hooks']) {
  const { parseHooks, buildHookHandlers, loadApprovedHooks } =
    await import('@theocode/agent/hooks')
  const { resolveTrustPosture } = await import('@theocode/agent/config')
  return buildHookHandlers(parseHooks(hooks), {
    trusted: resolveTrustPosture(workingDirectory()).allows.hooks,
    approved: new Set([...loadApprovedHooks(workingDirectory()).keys()]),
  })
}

export async function runReviewCommand(
  arg: string,
  ctx: { getSessionId: () => string },
  deps: ReviewCommandDeps,
): Promise<void> {
  const { setToast, setReviewResult } = deps
  const cfgDoReview = resolveEffectiveConfig({ cwd: workingDirectory() })
  setToast({ message: `>> Code review started <<`, variant: 'info' })
  const encerramento = encerramentoDaReview(setToast)
  const desanexar = instalarSinal(encerramento)
  try {
    const { execFileSync } = await import('node:child_process')
    const surfaceHooks = await hookChain(cfgDoReview.hooks)
    const result = await runReview(arg, {
      git: (args) => {
        try {
          return {
            ok: true,
            stdout: execFileSync('git', args, { encoding: 'utf8', timeout: 10_000 }),
          }
        } catch {
          return { ok: false, stdout: '' }
        }
      },
      createAgent: createReviewAgent({
        config: cfgDoReview,
        cwd: workingDirectory(),
        resolveCredential: async (model) =>
          (await resolveCredentialForModel(model, { env: process.env, home: homedir() })).apiKey,
        hooks: surfaceHooks,
        registerCleanup: (fn) => {
          encerramento.registerCleanup(fn)
        },
      }),
    })
    process.stderr.write(
      `[review] findings=${result.output.findings.length} verdict=${result.output.overall_correctness}\n`,
    )
    setReviewResult(result.rendered) 
    await Agent.injectSessionTurn(ctx.getSessionId(), {
      userText: `<user_action><context>User initiated a review task (${result.target.hint}). User may reference the findings below in follow-ups.</context><action>review</action><results>${result.rendered}</results></user_action>`,
      assistantText: result.rendered,
    }).catch((e: unknown) => {
      process.stderr.write(
        `[review] inject skipped: ${e instanceof Error ? e.message : String(e)}\n`,
      )
    })
    setToast({
      message: `<< Code review finished: ${result.target.hint} — ${result.output.findings.length} finding(s); ${result.output.overall_correctness || 'no verdict'} >>`,
      variant: 'success',
    })
  } catch (err) {
    setToast({
      message: `/review failed: ${err instanceof Error ? err.message : String(err)}`,
      variant: 'error',
    })
  } finally {
    desanexar()
  }
}
