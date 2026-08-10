import { Agent, buildModelSelection, discoverSubagents, reasoningEffortOf } from '@theokit/agents'
import type { CustomTool, HookHandlers, SDKAgent, SubagentDefinition } from '@theokit/agents'
import { ConfigurationError } from '@theokit/agents'
import type { SandboxBackend } from '@theokit/agents/sandbox'
import { ToolRegistry, type ToolScope } from '../tools/index.js'
import { hooksForMember } from './hooks-for-member.js'
import { EFFORT_LEVELS, parseEffort } from '../config/index.js'
import type { ReasoningEffort, TrustPosture } from '../config/index.js'

export const TEAM_ROLES = ['explorer', 'worker'] as const

type AgentOptions = Parameters<typeof Agent.create>[0]

export interface RoleConfig {
  name: string
  model?: string
  reasoning_effort?: ReasoningEffort
  sandbox?: boolean
  tools: string[]
}

export interface ParentDefaults {
  model: string
  reasoning_effort: ReasoningEffort
}

export interface RoleAgentContext {
  apiKey: string | (() => string | Promise<string>)
  parent: ParentDefaults
  cwd?: string
  writeRoot?: string
  /**
   * B-006 — required, like `ToolScope.sandbox`. While it was optional, a delegated squad member
   * could be handed tools with the sandbox silently omitted: an unconfined shell for a sub-agent,
   * with no error. Every caller builds it from `resolveToolScope`, which always supplies one.
   */
  sandbox: SandboxBackend
  posture: TrustPosture
  hooks?: HookHandlers
  /**
   * B-061 — the seam that makes a role's composition assertable without a credential.
   *
   * Deliberately the SAME shape as `ReviewFactoryDeps.createInstance` (`review/create-agent.ts:42`)
   * rather than a second convention: this repository builds agents at three sites, and two of them
   * now expose the SDK entry the same way. Production callers omit it and get `Agent.create`.
   *
   * A role's tool list IS its authority, and nothing else in the suite reads it. Without a seam the
   * only way to observe what a member was handed is to hold a real key and create a real agent,
   * which is why it had gone unasserted.
   */
  createAgent?: (opts: Parameters<typeof Agent.create>[0]) => Promise<SDKAgent>
}

function resolveRoleTools(names: readonly string[], opts: ToolScope): CustomTool[] {
  return new ToolRegistry(opts).resolve(names)
}

function roleConfigFrom(def: SubagentDefinition, name = ''): RoleConfig {
  const model = def.model
  const selection = typeof model === 'string' ? undefined : model
  const selectedEffort = selection === undefined ? undefined : reasoningEffortOf(selection)
  return {
    name,
    ...(selection !== undefined ? { model: selection.id } : {}),
    ...(selectedEffort === undefined ? {} : { reasoning_effort: wireEffort(selectedEffort, name) }),
    ...(def.sandbox === undefined ? {} : { sandbox: def.sandbox }),
    tools: [...(def.tools ?? [])],
  }
}

function wireEffort(raw: string, name: string): ReasoningEffort {
  const level = parseEffort(raw)
  if (level === null) {
    throw new ConfigurationError(
      `role "${name}": reasoning_effort "${raw}" is not an accepted level. The levels are ` +
        `${EFFORT_LEVELS.join(', ')}. Fix the \`reasoning_effort:\` in ` +
        `.theokit/agents/${name}.md — the role is NOT materialised with a silently inherited effort, ` +
        'because that would run the subagent at an effort different from the declared one with ' +
        'no warning at all.',
      { code: 'role_reasoning_effort_invalid' },
    )
  }
  return level
}

function unresolvedRole(name: string, posture: TrustPosture): ConfigurationError {
  if (!posture.allows.subagents) {
    return new ConfigurationError(
      `role "${name}" could not be loaded: the \`project\` subagent source is OFF ` +
        `because this directory is NOT trusted. In that state a repository \`.theokit/agents/${name}.md\` ` +
        `is not read — whether it exists or not. Trust this directory (the TUI asks on the first ` +
        `run) to enable project roles. For CI, set the trust-all-directories environment ` +
        `variable — see \`config/env-knobs.ts\`, which is the registry of every knob.`,
      { code: 'role_source_untrusted' },
    )
  }
  return new ConfigurationError(`role "${name}" is not in .theokit/agents`, {
    code: 'role_not_found',
  })
}

function inheritFromParent(
  role: ReturnType<typeof roleConfigFrom>,
  ctx: RoleAgentContext,
): { cwd: string; writeRoot: string; modelId: string; effort: string } {
  const cwd = ctx.cwd ?? process.cwd()
  return {
    cwd,
    writeRoot: ctx.writeRoot ?? cwd,
    modelId: role.model ?? ctx.parent.model,
    effort: role.reasoning_effort ?? ctx.parent.reasoning_effort,
  }
}

function requireResolvedCredential(apiKey: unknown): string {
  if (typeof apiKey !== 'string') {
    throw new TypeError(
      'roleAgentOptions requires the credential ALREADY RESOLVED — use buildRoleAgent',
    )
  }
  return apiKey
}

async function roleAgentOptions(
  name: string,
  ctx: RoleAgentContext,
): Promise<Parameters<typeof Agent.create>[0]> {
  const found = await discoverSubagents(ctx.cwd ?? process.cwd(), {
    settingSources: ctx.posture.allows.subagents ? ['project'] : [],
  })
  const def = found[name]
  if (def === undefined) throw unresolvedRole(name, ctx.posture)
  const role = roleConfigFrom(def, name)
  const { cwd, writeRoot, modelId, effort } = inheritFromParent(role, ctx)
  const pluginDeHooks = ctx.hooks !== undefined ? hooksForMember(ctx.hooks) : undefined
  return {
    apiKey: requireResolvedCredential(ctx.apiKey),
    model: buildModelSelection(modelId, effort),
    local: {
      cwd,
      ...(role.sandbox !== undefined ? { sandboxOptions: { enabled: role.sandbox } } : {}),
    },
    tools: resolveRoleTools(role.tools, { cwd, writeRoot, sandbox: ctx.sandbox }),
    ...(pluginDeHooks !== undefined
      ? { plugins: [pluginDeHooks] as unknown as AgentOptions['plugins'] }
      : {}),
  }
}

export async function buildRoleAgent(name: string, ctx: RoleAgentContext): Promise<SDKAgent> {
  const apiKey = typeof ctx.apiKey === 'function' ? await ctx.apiKey() : ctx.apiKey
  const create = ctx.createAgent ?? Agent.create
  return create(await roleAgentOptions(name, { ...ctx, apiKey }))
}
