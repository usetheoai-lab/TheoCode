import { Agent, buildModelSelection } from '@theokit/agents'
import type { CustomTool, HookHandlers } from '@theokit/agents'

import { hooksForMember } from '../delegation/index.js'
import { REVIEWER_TOOLS, reviewerShape } from '../composition/agent-spec.js'

import type { AgentConfig } from '../config/index.js'
import { ToolRegistry, resolveToolScope, type ToolScope } from '../tools/index.js'
import type { ReviewAgentLike, ReviewDeps } from './run-review.js'

export const REVIEWER_SHELL_CAP = 30_000

/**
 * B-059 — the reviewer's tool set is DECLARED in `composition/agent-spec.ts`, not stated here.
 *
 * This alias is the migration path, not a second source: it re-exports the declaration so a caller
 * pinned to the old name keeps compiling and cannot drift from it. Sunset: delete once nothing
 * outside this file reads it.
 */
export const TOOLS_DO_REVIEWER = REVIEWER_TOOLS

export type ConfigDoReviewer = Pick<AgentConfig, 'model' | 'sandbox_mode'> &
  Partial<Pick<AgentConfig, 'reasoning_effort'>>

function reviewerScope(cfg: ConfigDoReviewer, cwd: string): ToolScope {
  return { ...resolveToolScope(cfg, cwd), defaultTimeoutMs: REVIEWER_SHELL_CAP }
}

interface AgentInstance {
  send(message: string): Promise<{ wait(): Promise<{ result?: string }> }>
  [Symbol.asyncDispose](): Promise<void>
}

interface CreationOptions {
  agentId: string
  apiKey: string
  model: ReturnType<typeof buildModelSelection>
  local: { cwd: string }
  systemPrompt: string
  tools: CustomTool[]
  plugins?: Parameters<typeof Agent.create>[0]['plugins']
}

export interface ReviewFactoryDeps {
  config: ConfigDoReviewer
  cwd: string
  resolveCredential: (model: string) => Promise<string>
  hooks?: HookHandlers
  registerCleanup: (fn: () => Promise<void>) => void
  createInstance?: (opts: CreationOptions) => Promise<AgentInstance>
  deleteAgent?: (agentId: string) => Promise<void>
}

const defaultCreateInstance = (opts: CreationOptions): Promise<AgentInstance> =>
  Agent.create(opts) as unknown as Promise<AgentInstance>

const defaultDeleteAgent = (agentId: string): Promise<void> =>
  Agent.delete(agentId).catch((err: unknown) => {
    process.stderr.write(`[review] Agent.delete(${agentId}) failed: ${String(err)}\n`)
  })

export function createReviewAgent(deps: ReviewFactoryDeps): ReviewDeps['createAgent'] {
  const createInstance = deps.createInstance ?? defaultCreateInstance
  const deleteAgent = deps.deleteAgent ?? defaultDeleteAgent
  const registry = new ToolRegistry(reviewerScope(deps.config, deps.cwd))
  // B-059 — the ONE composition entry. It returns the reviewer's SHAPE (a value); this factory
  // still creates the agent through the same `Agent.create` it always used, which is what keeps
  // this a declaration change and not a behaviour change.
  const shape = reviewerShape({
    registry,
    model: deps.config.model,
    reasoning_effort: deps.config.reasoning_effort ?? 'medium',
  })
  const pluginDeHooks = deps.hooks !== undefined ? hooksForMember(deps.hooks) : undefined

  return async ({ agentId, systemPrompt }): Promise<ReviewAgentLike> => {
    const apiKey = await deps.resolveCredential(deps.config.model)
    const inst = await createInstance({
      agentId,
      apiKey,
      model: buildModelSelection(deps.config.model, deps.config.reasoning_effort),
      local: { cwd: deps.cwd },
      systemPrompt,
      tools: [...shape.tools],
      ...(pluginDeHooks !== undefined
        ? { plugins: [pluginDeHooks] as unknown as Parameters<typeof Agent.create>[0]['plugins'] }
        : {}),
    })

    // B-043 — the flag is set AFTER the work, not before. Marking first meant a dispose that threw
    // left the reviewer permanently leaked: the guard said it had already been disposed, so no
    // retry and no cleanup could ever reach it again.
    let disposed = false
    const dispose = async (): Promise<void> => {
      if (disposed) return
      await inst[Symbol.asyncDispose]()
      await deleteAgent(agentId)
      disposed = true
    }
    deps.registerCleanup(dispose)

    return { send: (m: string) => inst.send(m), dispose: dispose }
  }
}
