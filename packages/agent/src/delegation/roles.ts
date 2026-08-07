import { Agent, buildModelSelection, discoverSubagents, reasoningEffortOf } from '@theokit/agents'
import type { CustomTool, HookHandlers, SDKAgent, SubagentDefinition } from '@theokit/agents'
import { ConfigurationError } from '@theokit/agents'
import type { SandboxBackend } from '@theokit/agents/sandbox'
import { ToolRegistry, type ToolScope } from '../tools/index.js'
import { hooksParaMembro } from './hooks-para-membro.js'
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
  sandbox?: SandboxBackend
  posture: TrustPosture
  hooks?: HookHandlers
}

export function resolveRoleTools(names: readonly string[], opts: ToolScope): CustomTool[] {
  return new ToolRegistry(opts).resolve(names)
}

export function roleConfigFrom(def: SubagentDefinition, name = ''): RoleConfig {
  const model = def.model
  const selecao = typeof model === 'string' ? undefined : model
  const efforto = selecao === undefined ? undefined : reasoningEffortOf(selecao)
  return {
    name,
    ...(selecao !== undefined ? { model: selecao.id } : {}),
    ...(efforto === undefined ? {} : { reasoning_effort: wireEffort(efforto, name) }),
    ...(def.sandbox === undefined ? {} : { sandbox: def.sandbox }),
    tools: [...(def.tools ?? [])],
  }
}

function wireEffort(bruto: string, name: string): ReasoningEffort {
  const nivel = parseEffort(bruto)
  if (nivel === null) {
    throw new ConfigurationError(
      `role "${name}": reasoning_effort "${bruto}" não é um nível aceito. Os níveis são ` +
        `${EFFORT_LEVELS.join(', ')}. Corrija o \`reasoning_effort:\` em ` +
        `.theokit/agents/${name}.md — o papel NÃO é materializado com um esforço herdado em ` +
        'silêncio, porque isso faria o subagente rodar com um esforço diferente do declarado sem ' +
        'nada avisar.',
      { code: 'role_reasoning_effort_invalid' },
    )
  }
  return nivel
}

function unresolvedRole(name: string, posture: TrustPosture): ConfigurationError {
  if (!posture.allows.subagents) {
    return new ConfigurationError(
      `role "${name}" não pôde ser carregado: a fonte \`project\` de subagentes está DESLIGADA ` +
        `porque este diretório NÃO é trusted. Nesse state um \`.theokit/agents/${name}.md\` do ` +
        `repositório não é lido — exista ele ou não. Conceda confiança a este diretório (a TUI ` +
        `question na primeira execução) para habilitar papéis de projeto; o escape para CI está em ` +
        `docs/CONFIGURATION.md § Escapes.`,
      { code: 'role_source_untrusted' },
    )
  }
  return new ConfigurationError(`role "${name}" não está em .theokit/agents`, {
    code: 'role_not_found',
  })
}

function herdarDoPai(
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

export async function roleAgentOptions(
  name: string,
  ctx: RoleAgentContext,
): Promise<Parameters<typeof Agent.create>[0]> {
  const encontrados = await discoverSubagents(ctx.cwd ?? process.cwd(), {
    settingSources: ctx.posture.allows.subagents ? ['project'] : [],
  })
  const def = encontrados[name]
  if (def === undefined) throw unresolvedRole(name, ctx.posture)
  const role = roleConfigFrom(def, name)
  const { cwd, writeRoot, modelId, effort } = herdarDoPai(role, ctx)
  const pluginDeHooks = ctx.hooks !== undefined ? hooksParaMembro(ctx.hooks) : undefined
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
  return Agent.create(await roleAgentOptions(name, { ...ctx, apiKey }))
}
