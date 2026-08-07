import { type EffectiveContextWindow } from '@theokit/agents'
import { resolveSandboxPosture } from '@theokit/agents/sandbox'

import { modelContextWindow } from '@theocode/shared/agent'
import { cliOverridesLayer } from './cli-overrides.js'
import {
  loadConfig,
  modelLabel,
  type AgentConfig,
  type ApprovalPolicy,
  type GoalOracle,
  type ReasoningEffort,
  type SandboxMode,
} from './config.js'
import { approvalModeFor } from './sandbox-policy.js'
import { TRUST_STORE } from './trust-store.js'
import { resolveTrustPosture, type TrustPosture } from './trust-posture.js'

export class EffectiveConfig {
  readonly model: string
  readonly reasoning_effort: ReasoningEffort
  readonly sandbox_mode: SandboxMode
  readonly approval_policy: ApprovalPolicy
  readonly goal_oracle: GoalOracle
  readonly skills: readonly string[]
  readonly hooks: readonly unknown[]
  readonly profile: string | undefined

  readonly #contextWindow: number | undefined

  constructor(cfg: AgentConfig) {
    this.model = cfg.model
    this.reasoning_effort = cfg.reasoning_effort
    this.sandbox_mode = cfg.sandbox_mode
    this.approval_policy = cfg.approval_policy
    this.goal_oracle = cfg.goal_oracle
    this.profile = cfg.profile
    this.#contextWindow = cfg.context_window

    this.skills = Object.freeze([...cfg.skills])
    this.hooks = Object.freeze(cfg.hooks.map((h) => Object.freeze(h)))

    Object.freeze(this)
  }

  get modelLabel(): string {
    return modelLabel(this.model)
  }

  /**
   * B-006 — the posture behind `sandboxLabel`. It was computed only to render the `⚠ tool-gating`
   * warning, so the interactive surface could tell the user confinement was absent and still
   * auto-approve every command. Exposing it lets the consent layer act on the same fact.
   */
  get sandboxPosture(): ReturnType<typeof resolveSandboxPosture> {
    return resolveSandboxPosture({ mode: this.sandbox_mode })
  }

  get sandboxLabel(): string {
    const p = this.sandboxPosture
    return p.enforced ? `sandbox:${p.mode}` : `sandbox:${p.mode} ⚠ tool-gating`
  }

  get approvalMode(): 'suggest' | 'auto-edit' | 'full-auto' {
    return approvalModeFor(this.approval_policy)
  }

  get declaredWindow(): number | undefined {
    return this.#contextWindow
  }

  get contextWindow(): EffectiveContextWindow {
    return modelContextWindow(
      this.#contextWindow !== undefined ? { override: this.#contextWindow } : {},
    )
  }
}

interface LayersOnDisk {
  projectDir?: string
  userDir?: string
  env?: Record<string, string | undefined>
  cli?: readonly string[]
}

function withCliLayer(opts: LayersOnDisk): Omit<LayersOnDisk, 'cli'> & { cli?: unknown } {
  const { cli, ...resto } = opts
  return { ...resto, ...(cli !== undefined ? { cli: cliOverridesLayer(cli) } : {}) }
}

export function resolveEffectiveConfig(
  opts: LayersOnDisk & { cwd?: string; store?: string } = {},
): EffectiveConfig {
  const cwd = opts.cwd ?? process.cwd()
  return new EffectiveConfig(
    loadConfig({
      ...withCliLayer(opts),
      projectDir: opts.projectDir ?? cwd,
      posture: resolveTrustPosture(cwd, opts.store ?? TRUST_STORE),
    }),
  )
}

export function effectiveConfigUnderPosture(
  opts: LayersOnDisk & { posture: TrustPosture },
): EffectiveConfig {
  return new EffectiveConfig(loadConfig({ ...withCliLayer(opts), posture: opts.posture }))
}
