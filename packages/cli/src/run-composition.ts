import { resolveSandboxPosture } from '@theokit/agents/sandbox'

import type { CliOverrides } from './runtime/index.js'

import { buildChatAgent } from '@theocode/agent'
import {
  TRUST_STORE,
  resolveEffectiveConfig,
  resolveHeadlessApproval,
  resolveTrustPosture,
  type EffectiveConfig,
} from '@theocode/agent/config'

export interface CompositionSeams {
  readonly cwd?: string
  readonly store?: string
  readonly userDir?: string
  readonly env?: Record<string, string | undefined>
}

export interface RunComposition {
  readonly cfg: EffectiveConfig
  readonly policy: ReturnType<typeof resolveHeadlessApproval>
  readonly mod: { readonly default: ReturnType<typeof buildChatAgent> }
}

export function composeRun(
  args: {
    readonly overrides: CliOverrides
    readonly model?: string
    readonly baseInstructions?: string
  },
  seams: CompositionSeams = {},
): RunComposition {
  const cwd = seams.cwd ?? process.cwd()
  const store = seams.store ?? TRUST_STORE

  const posture = resolveTrustPosture(cwd, store)
  const cfg = resolveEffectiveConfig({
    cwd,
    store,
    ...(seams.userDir !== undefined ? { userDir: seams.userDir } : {}),
    ...(seams.env !== undefined ? { env: seams.env } : {}),
    cli: args.overrides,
  })

  const policy = resolveHeadlessApproval(
    cfg.approval_policy,
    resolveSandboxPosture({ mode: cfg.sandbox_mode }),
  )

  return {
    cfg,
    policy,
    mod: {
      default: buildChatAgent({
        surface: 'headless',
        // B-015 — this root already resolved a directory (and accepts one as a seam). Passing only
        // config+posture left the remaining reads inside buildChatAgent on process.cwd().
        cwd,
        config: cfg,
        posture,
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.baseInstructions !== undefined ? { baseInstructions: args.baseInstructions } : {}),
      }),
    },
  }
}
