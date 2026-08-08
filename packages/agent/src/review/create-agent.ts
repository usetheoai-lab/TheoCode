import { Agent, buildModelSelection } from '@theokit/agents'
import type { CustomTool, HookHandlers } from '@theokit/agents'

import { hooksParaMembro } from '../delegation/index.js'

import type { AgentConfig } from '../config/index.js'
import { ToolRegistry, resolveToolScope, type ToolScope } from '../tools/index.js'
import type { ReviewAgentLike, ReviewDeps } from './run-review.js'

export const REVIEWER_SHELL_CAP = 30_000

export const TOOLS_DO_REVIEWER = ['git_diff', 'read_file', 'grep', 'run_shell'] as const

export type ConfigDoReviewer = Pick<AgentConfig, 'model' | 'sandbox_mode'> &
  Partial<Pick<AgentConfig, 'reasoning_effort'>>

export function escopoDoReviewer(cfg: ConfigDoReviewer, cwd: string): ToolScope {
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

export interface DepsDaFabricaDeReview {
  config: ConfigDoReviewer
  cwd: string
  resolveCredential: (model: string) => Promise<string>
  hooks?: HookHandlers
  registrarCleanup: (fn: () => Promise<void>) => void
  createInstance?: (opts: CreationOptions) => Promise<AgentInstance>
  deleteAgent?: (agentId: string) => Promise<void>
}

const defaultCreateInstance = (opts: CreationOptions): Promise<AgentInstance> =>
  Agent.create(opts) as unknown as Promise<AgentInstance>

const defaultDeleteAgent = (agentId: string): Promise<void> =>
  Agent.delete(agentId).catch((err: unknown) => {
    process.stderr.write(`[review] Agent.delete(${agentId}) failed: ${String(err)}\n`)
  })

export function createReviewAgent(deps: DepsDaFabricaDeReview): ReviewDeps['createAgent'] {
  const createInstance = deps.createInstance ?? defaultCreateInstance
  const deleteAgent = deps.deleteAgent ?? defaultDeleteAgent
  const registry = new ToolRegistry(escopoDoReviewer(deps.config, deps.cwd))
  const pluginDeHooks = deps.hooks !== undefined ? hooksParaMembro(deps.hooks) : undefined

  return async ({ agentId, systemPrompt }): Promise<ReviewAgentLike> => {
    const apiKey = await deps.resolveCredential(deps.config.model)
    const inst = await createInstance({
      agentId,
      apiKey,
      model: buildModelSelection(deps.config.model, deps.config.reasoning_effort),
      local: { cwd: deps.cwd },
      systemPrompt,
      tools: registry.resolve([...TOOLS_DO_REVIEWER]),
      ...(pluginDeHooks !== undefined
        ? { plugins: [pluginDeHooks] as unknown as Parameters<typeof Agent.create>[0]['plugins'] }
        : {}),
    })

    let descartado = false
    const dispose = async (): Promise<void> => {
      if (descartado) return
      descartado = true
      await inst[Symbol.asyncDispose]()
      await deleteAgent(agentId)
    }
    deps.registrarCleanup(dispose)

    return { send: (m: string) => inst.send(m), dispose: dispose }
  }
}
