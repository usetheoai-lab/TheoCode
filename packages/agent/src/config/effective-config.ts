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
import { resolveTrustPosture } from './trust-posture.js'

export class EffectiveConfig {
  readonly model: string
  readonly reasoning_effort: ReasoningEffort
  readonly sandbox_mode: SandboxMode
  readonly approval_policy: ApprovalPolicy
  readonly goal_oracle: GoalOracle
  readonly skills: readonly string[]
  readonly hooks: readonly unknown[]
  /** Durable memory — off unless asked for. See `AgentConfig.memory` for why the default is off. */
  readonly memory: boolean
  readonly profile: string | undefined

  readonly #contextWindow: number | undefined

  constructor(cfg: AgentConfig) {
    this.model = cfg.model
    this.reasoning_effort = cfg.reasoning_effort
    this.sandbox_mode = cfg.sandbox_mode
    this.approval_policy = cfg.approval_policy
    this.goal_oracle = cfg.goal_oracle
    this.memory = cfg.memory
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

  /**
   * The sandbox posture WITH the `sandbox:` prefix — for the footer, where it sits in a `·`-joined
   * run of bare values and needs to say which knob it is.
   */
  get sandboxLabel(): string {
    return `sandbox:${this.sandboxDetail}`
  }

  /**
   * The same posture WITHOUT the prefix, for anywhere the label is already supplied by a column.
   *
   * `/status` renders a `sandbox:` column and filled it with `sandboxLabel`, so the panel read
   * `sandbox:    sandbox:workspace-write`. Splitting the getter is what stops the next consumer
   * from either repeating the prefix or stripping it back off with a `replace`.
   */
  get sandboxDetail(): string {
    const p = this.sandboxPosture
    return p.enforced ? p.mode : `${p.mode} ⚠ tool-gating`
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
  const { cli, ...rest } = opts
  return { ...rest, ...(cli !== undefined ? { cli: cliOverridesLayer(cli) } : {}) }
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

/**
 * B-081 — what this resolution produces is REPORTED to users by `theocode doctor`, which exists
 * because the gap between what config asks for and what the product does is where the failures
 * live. It reads the resolved values here rather than re-parsing the files, so a change to the
 * layering shows up in the diagnostic automatically — and a change that alters WHICH layer wins
 * should be checked against `doctor`'s output, because that output is what a user will be told
 * when they ask why a setting did not take effect.
 */

/**
 * B-076 — the same config with a different sandbox mode.
 *
 * A FREE function, not a method, deliberately: callers legitimately hold a plain config object as
 * well as an `EffectiveConfig`, and a method would force every one of them through the class. It
 * reads fields and returns a new object, so both work.
 *
 * The security floor is NOT re-applied, and that is a decision rather than an omission. The floor
 * stops a lower-trust LAYER (project/profile/env) from loosening what user/defaults settled on
 * (`security-floor.ts` § CANNOT_LOOSEN). A session switch is the user acting directly — the same
 * standing as the `cli` layer, which may loosen. The guard that belongs to loosening is a
 * CONFIRMATION at the command, not a silent refusal here.
 */
export function withSandboxMode<T extends { sandbox_mode: SandboxMode }>(
  cfg: T,
  mode: SandboxMode,
): T {
  if (mode === cfg.sandbox_mode) return cfg
  return { ...cfg, sandbox_mode: mode }
}
