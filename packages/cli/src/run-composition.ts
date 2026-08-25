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

/**
 * B-024 — the injection points for composition, exercised by `run-composition.test.ts`.
 *
 * The single production caller passes none of these, which is why the item flagged them as a dead
 * seam. They are kept rather than deleted because they are the ONLY way to compose against a
 * throwaway trust store and directory instead of the developer's real `~/.theokit` — a test that
 * reads the real store answers differently on every machine. `baseInstructions` was deleted with
 * this change: no caller could supply it, and unlike these it bought nothing back.
 */
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
  /**
   * The model id the agent was actually built on, AFTER `routeModel`.
   *
   * Returned because the caller has to resolve a credential for the same id it built the agent on.
   * Resolving for one id and running on another is precisely the divergence this seam exists to
   * close, and a caller that had to re-derive the routed id could re-derive it differently.
   */
  readonly model: string
}

export function composeRun(
  args: {
    readonly overrides: CliOverrides
    readonly model?: string
    /**
     * Rewrite the model id for the credential that will actually serve it.
     *
     * A ChatGPT sign-in is not an API key: the OAuth token is scoped to `chatgpt.com/backend-api/
     * codex` and `api.openai.com` refuses it outright (`Missing scopes: api.responses.write`,
     * measured 2026-08-25). `openai/…` selects the API-key provider, so an OAuth user's turn has to
     * be re-pointed at `openai-chatgpt/…` before anything resolves — which is what
     * `routeToCredential` does, and what the TUI has always done at its own composition point.
     *
     * Headless did not, so the SAME credential worked in the TUI and failed in the CLI. The
     * rewrite is passed IN rather than performed here because it needs an already-resolved
     * credential, and this function is synchronous by design.
     */
    readonly routeModel?: (model: string) => string
  },
  seams: CompositionSeams = {},
): RunComposition {
  const cwd = seams.cwd ?? process.cwd()
  const store = seams.store ?? TRUST_STORE

  // B-033 — the same environment that feeds config resolution below. These used to be two
  // sources in one run: the posture from the ambient environment, the config from `seams.env`.
  const env = seams.env ?? process.env
  const posture = resolveTrustPosture(cwd, store, env)
  const cfg = resolveEffectiveConfig({
    cwd,
    store,
    ...(seams.userDir !== undefined ? { userDir: seams.userDir } : {}),
    env,
    cli: args.overrides,
  })

  const policy = resolveHeadlessApproval(
    cfg.approval_policy,
    resolveSandboxPosture({ mode: cfg.sandbox_mode }),
  )

  // `cfg.model` is what `buildChatAgent` would fall back to on its own (`overrides?.model ??
  // cfg.model`), named here so `routeModel` sees the id that is actually going to be used rather
  // than `undefined`.
  const requested = args.model ?? cfg.model
  const model = args.routeModel === undefined ? requested : args.routeModel(requested)

  return {
    cfg,
    policy,
    model,
    mod: {
      default: buildChatAgent({
        surface: 'headless',
        // B-015 — this root already resolved a directory (and accepts one as a seam). Passing only
        // config+posture left the remaining reads inside buildChatAgent on process.cwd().
        cwd,
        config: cfg,
        posture,
        model,
      }),
    },
  }
}
