import process from 'node:process'
import { execFileSync } from 'node:child_process'
import type { ExecReview } from '../runtime/index.js'
import type { Shutdown } from '@theocode/shared/shutdown'

export async function reviewCommand(args: ExecReview, shutdown: Shutdown): Promise<void> {
  const approvalRequested = args.overrides.some((o) => o.startsWith('approval_policy'))
  if (approvalRequested) {
    process.stderr.write(
      'ERROR: `-a/--approval` does not apply to `review` mode: the reviewer receives no write tool ' +
        '(`apply_patch`/`edit_file`), so there is no action to approve. Remove the flag.\n',
    )
    process.exit(2)
  }

  const { runReview } = await import('@theocode/agent/review')
  const { createReviewAgent } = await import('@theocode/agent/review')
  const { resolveCredentialForModel } = await import('@theocode/agent/auth')
  const { resolveEffectiveConfig } = await import('@theocode/agent/config')
  const { homedir } = await import('node:os')
  const execCfg = resolveEffectiveConfig({ cwd: process.cwd(), cli: args.overrides })
  const { parseHooks, buildHookHandlers, loadApprovedHooks } =
    await import('@theocode/agent/hooks')
  const { resolveTrustPosture } = await import('@theocode/agent/config')
  const specsDeHooks = parseHooks(execCfg.hooks)
  const surfaceHooks = buildHookHandlers(specsDeHooks, {
    trusted: resolveTrustPosture(process.cwd()).allows.hooks,
    approved: new Set([...loadApprovedHooks(process.cwd()).keys()]),
  })

  try {
    const result = await runReview(args.target, {
      git: (a) => {
        try {
          return {
            ok: true,
            stdout: execFileSync('git', a, { encoding: 'utf8', timeout: 10_000 }),
          }
        } catch {
          return { ok: false, stdout: '' }
        }
      },
      createAgent: createReviewAgent({
        config: execCfg,
        cwd: process.cwd(),
        resolveCredential: async (model) =>
          (await resolveCredentialForModel(model, { env: process.env, home: homedir() })).apiKey,
        hooks: surfaceHooks,
        registerCleanup: shutdown.registerCleanup,
      }),
    })
    if (args.json) {
      process.stdout.write(`${JSON.stringify({ type: 'review.completed', ...result.output })}\n`)
    } else {
      process.stdout.write(`${result.rendered}\n`)
    }
    process.stderr.write(
      `[exec] review findings=${result.output.findings.length} verdict=${result.output.overall_correctness}\n`,
    )
    process.exit(0) 
  } catch (err) {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}
