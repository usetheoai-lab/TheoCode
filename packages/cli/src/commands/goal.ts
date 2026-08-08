import process from 'node:process'
import { WATCHDOG_MS } from '@theocode/shared/shutdown'
import { createGoalCancellation } from '../runtime/index.js'
import { createDrainedProcessOutput } from '../runtime/index.js'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { ExecGoal } from '../runtime/index.js'
import type { Shutdown } from '@theocode/shared/shutdown'
import type { resolveEffectiveConfig, resolveTrustPosture } from '@theocode/agent/config'
import type { runGoal } from '@theocode/agent/goal'

type EffectiveConfig = ReturnType<typeof resolveEffectiveConfig>
type TrustPosture = ReturnType<typeof resolveTrustPosture>
type ResultadoDoGoal = Awaited<ReturnType<typeof runGoal>>
type SinalDeUpdateGoal = { status?: 'complete' | 'blocked' }

interface GoalAgentContext {
  /** B-015 — the directory this goal run resolved; the same one `cfg` and `posture` were built from. */
  readonly cwd: string
  readonly cfg: EffectiveConfig
  readonly posture: TrustPosture
  readonly routedModel: string
  readonly oracle: EffectiveConfig['goal_oracle']
  readonly updateGoalSignal: SinalDeUpdateGoal
}

async function buildGoalAgent({
  cwd,
  cfg,
  posture,
  routedModel,
  oracle,
  updateGoalSignal,
}: GoalAgentContext) {
  const { toAgentFactory } = await import('@theokit/agents')
  const { buildChatAgent } = await import('@theocode/agent/chat')
  const { headlessApprovalPosture } = await import('@theocode/agent/config')
  const { resolveSandboxPosture } = await import('@theokit/agents/sandbox')
  const { createUpdateGoalTool } = await import('@theocode/agent/goal')
  const { resolveCredentialForModel } = await import('@theocode/agent/auth')
  return toAgentFactory(
    buildChatAgent({
      cwd,
      config: cfg,
      posture,
      model: routedModel,
      surface: 'headless',
      ...(oracle === 'update_goal' ? { extraTools: [createUpdateGoalTool(updateGoalSignal)] } : {}),
      ...(oracle === 'update_goal'
        ? {
            appendInstructions:
              'You are pursuing a goal autonomously. When the objective is fully achieved and no ' +
              'work remains, you MUST call the `update_goal` tool with status "complete". If the ' +
              'same blocking condition makes progress impossible, call it with status "blocked". ' +
              'Do not stop until you have called update_goal.',
          }
        : {}),
    }),
    {
      apiKey: () =>
        resolveCredentialForModel(routedModel, { env: process.env, home: homedir() }).then(
          (c) => c.apiKey,
        ),
      approvals: headlessApprovalPosture(
        cfg.approval_policy,
        resolveSandboxPosture({ mode: cfg.sandbox_mode }),
      ),
    },
  )(`exec-${randomUUID()}`)
}

function relatarDesfechoDoGoal(
  result: ResultadoDoGoal,
  args: ExecGoal,
  oracle: EffectiveConfig['goal_oracle'],
): string {
  const finalStatus = result.status
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ type: 'goal.completed', status: finalStatus, turnsUsed: result.turnsUsed, tokensUsed: result.tokensUsed })}\n`,
    )
  } else {
    process.stdout.write(`${result.finalResponse ?? ''}\n`)
  }
  process.stderr.write(
    `[exec] goal status=${finalStatus} turns=${result.turnsUsed} tokens=${result.tokensUsed} oracle=${oracle}\n`,
  )
  return finalStatus
}

async function resolverContextoDoGoal(args: ExecGoal) {
  const { resolveCredential, resolveCredentialForModel } =
    await import('@theocode/agent/auth')
  const { TRUST_STORE, resolveEffectiveConfig, resolveTrustPosture } =
    await import('@theocode/agent/config')
  const { routeGoalModel } = await import('@theocode/agent/goal')
  const routingCred = resolveCredential({ env: process.env, home: homedir() })
  const cwdDoGoal = process.cwd()
  const posture = resolveTrustPosture(cwdDoGoal, TRUST_STORE)
  const cfg = resolveEffectiveConfig({ cwd: cwdDoGoal, store: TRUST_STORE, cli: args.overrides })
  const routedModel = args.model ?? routeGoalModel(routingCred, cfg.model)
  const cred = await resolveCredentialForModel(routedModel, { env: process.env, home: homedir() })
  return { cwd: cwdDoGoal, posture, cfg, oracle: cfg.goal_oracle, routedModel, cred }
}

export async function goalCommand(args: ExecGoal, shutdown: Shutdown): Promise<void> {
  const { GOAL_DEFAULTS, runGoal, makeSignalJudge } = await import('@theocode/agent/goal')
  const { cwd, posture, cfg, oracle, routedModel, cred } = await resolverContextoDoGoal(args)
  const updateGoalSignal: SinalDeUpdateGoal = {}
  try {
    const goalAgent = await buildGoalAgent({
      cwd,
      cfg,
      posture,
      routedModel,
      oracle,
      updateGoalSignal,
    })
    const cancellation = createGoalCancellation(shutdown, { watchdogMs: WATCHDOG_MS })
    shutdown.registerCleanup(() => goalAgent.dispose())
    const goalOpts = {
      maxTurns: args.maxTurns ?? GOAL_DEFAULTS.maxTurns,
      tokenBudget: args.tokenBudget ?? GOAL_DEFAULTS.tokenBudget,
      judgeApiKey: cred.apiKey,
      agentModel: routedModel,
      signal: cancellation.signal,
    }
    let finalStatus = ''
    try {
      const result = await runGoal(goalAgent, args.goal, goalOpts, {
        onLine: (l) => {
          if (!args.json) process.stderr.write(`${l}\n`)
        },
        ...(oracle === 'update_goal'
          ? { depsOverride: { judge: makeSignalJudge(updateGoalSignal) } }
          : {}),
        ...(args.json
          ? {
              onEvent: (e: unknown) => {
                const ev = e as { type: string }
                process.stdout.write(
                  `${JSON.stringify({ ...(ev as object), type: `goal.${ev.type}` })}\n`,
                )
              },
            }
          : {}),
      })
      await goalAgent.dispose().catch((err: unknown) => {
        process.stderr.write(`[exec] disposing the goal agent failed: ${String(err)}\n`)
      })
      finalStatus = relatarDesfechoDoGoal(result, args, oracle)
    } finally {
      cancellation.shutdown()
    }
    createDrainedProcessOutput(WATCHDOG_MS)(finalStatus === 'completed' ? 0 : 1)
    return
  } catch (err) {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`)
    createDrainedProcessOutput(WATCHDOG_MS)(1)
    return
  }
}
