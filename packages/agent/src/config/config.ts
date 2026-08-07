import { TheokitAgentError } from '@theokit/agents'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { parse as parseToml } from 'smol-toml'
import { z } from 'zod'

import {
  ENV_APPROVAL_POLICY,
  ENV_CONTEXT_WINDOW,
  ENV_GOAL_ORACLE,
  ENV_MODEL,
  ENV_REASONING_EFFORT,
  ENV_SANDBOX_MODE,
} from './env-knobs.js'
import { LAYERS, foldLayers, type Layer } from './layers.js'
import type { TrustPosture } from './trust-posture.js'

const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const
const SANDBOXES = ['read-only', 'workspace-write', 'danger-full-access'] as const
const POLICIES = ['untrusted', 'on-request', 'never'] as const

export type ReasoningEffort = (typeof EFFORTS)[number]
export type SandboxMode = (typeof SANDBOXES)[number]
export type ApprovalPolicy = (typeof POLICIES)[number]

export type GoalOracle = 'judge' | 'update_goal'
const GOAL_ORACLES = ['judge', 'update_goal'] as const

export interface AgentConfig {
  model: string
  reasoning_effort: ReasoningEffort
  sandbox_mode: SandboxMode
  approval_policy: ApprovalPolicy
  goal_oracle: GoalOracle
  skills: readonly string[]
  hooks: readonly unknown[]
  context_window?: number
  profile?: string
}

export const CONFIG_SCHEMA_KEYS = [
  'model',
  'reasoning_effort',
  'sandbox_mode',
  'approval_policy',
  'goal_oracle',
  'skills',
  'hooks',
  'context_window',
] as const

export type SchemaKey = (typeof CONFIG_SCHEMA_KEYS)[number]

interface EnvPath {
  readonly knob: string
  readonly coagir: (bruto: string) => unknown
}

function numeroDeEnv(bruto: string): unknown {
  const n = Number(bruto)
  return bruto.trim().length > 0 && Number.isFinite(n) ? n : bruto
}

export const ENV_BY_KEY: Readonly<Partial<Record<SchemaKey, EnvPath>>> = {
  model: { knob: ENV_MODEL, coagir: (s) => s },
  reasoning_effort: { knob: ENV_REASONING_EFFORT, coagir: (s) => s },
  sandbox_mode: { knob: ENV_SANDBOX_MODE, coagir: (s) => s },
  approval_policy: { knob: ENV_APPROVAL_POLICY, coagir: (s) => s },
  goal_oracle: { knob: ENV_GOAL_ORACLE, coagir: (s) => s },
  context_window: { knob: ENV_CONTEXT_WINDOW, coagir: numeroDeEnv },
}

interface OptOutDeEnv {
  readonly key: string
  readonly reason: string
  readonly exitCriterion: string
}

export const OPT_OUT_DE_ENV: readonly OptOutDeEnv[] = [
  {
    key: 'skills',
    reason:
      'Array de nomes: uma variável de ambiente é uma string, e toda coerção óbvia (vírgula, espaço, JSON) escolhe um separador que um name de skill legítimo pode conter.',
    exitCriterion:
      'O primeiro consumidor que peça a lista de skills por ambiente — aí o separador é escolhido com um caso de uso real em vez de por adivinhação.',
  },
  {
    key: 'hooks',
    reason:
      'Array de objetos, e a ÚNICA key que acumula entre camadas. Uma variável de ambiente que injetasse hooks seria execução arbitrária de código declarada fora de qualquer arquivo revisável, contornando a acumulação que impede um projeto de deslocar o guard global do usuário.',
    exitCriterion:
      'Nunca por conveniência. Só se a acumulação e a revisibilidade forem preservadas por outro mecanismo, decidido em ADR própria.',
  },
]

export function keysWithoutEnvPath(
  keys: readonly string[],
  withEnvPath: ReadonlySet<string>,
  optOut: readonly OptOutDeEnv[],
): string[] {
  const isentas = new Set(optOut.map((o) => o.key))
  return keys.filter((k) => !withEnvPath.has(k) && !isentas.has(k))
}

export function optOutsThatExemptNothing(
  keys: readonly string[],
  withEnvPath: ReadonlySet<string>,
  optOut: readonly OptOutDeEnv[],
): string[] {
  const doSchema = new Set(keys)
  return optOut
    .filter((o) => !doSchema.has(o.key) || withEnvPath.has(o.key))
    .map((o) => o.key)
}

export const DEFAULTS: AgentConfig = {
  model: 'openai/gpt-5.4',
  reasoning_effort: 'medium',
  sandbox_mode: 'workspace-write',
  approval_policy: 'on-request',
  goal_oracle: 'judge',
  skills: ['daily-briefing'],
  hooks: [],
}

export const EFFORT_LEVELS: readonly ReasoningEffort[] = EFFORTS

export function parseEffort(input: string): ReasoningEffort | null {
  const v = input.trim().toLowerCase()
  return (EFFORTS as readonly string[]).includes(v) ? (v as ReasoningEffort) : null
}

export function modelLabel(modelId: string): string {
  const slash = modelId.lastIndexOf('/')
  return slash >= 0 ? modelId.slice(slash + 1) : modelId
}

export class ConfigError extends TheokitAgentError {
  override readonly name = 'ConfigError'

  constructor(message: string) {
    super(message)
  }
}

const scalarSchema = z
  .object({
    model: z.string().min(1, 'model: id de model vazio — informe `provider/model`').optional(),
    reasoning_effort: z.enum(EFFORTS).optional(),
    sandbox_mode: z.enum(SANDBOXES).optional(),
    approval_policy: z.enum(POLICIES).optional(),
    goal_oracle: z.enum(GOAL_ORACLES).optional(),
    skills: z.array(z.string()).optional(),
    hooks: z.array(z.unknown()).optional(),
    context_window: z.number().int().positive().optional(),
  })
  .strict()

const configSchema = scalarSchema
  .extend({
    profile: z.string().optional(),
    profiles: z.record(z.string(), scalarSchema).optional(),
  })
  .strict()

type RawScalars = z.infer<typeof scalarSchema>

function toConfigError(err: unknown, where: string): ConfigError {
  if (err instanceof z.ZodError) {
    const issue = err.issues[0]
    const keys =
      issue && 'keys' in issue && Array.isArray((issue as { keys?: unknown[] }).keys)
        ? (issue as { keys: string[] }).keys.join(', ')
        : issue?.path.join('.') || '(root)'
    return new ConfigError(`${where}: ${issue?.message ?? 'invalid config'} [${keys}]`)
  }
  return new ConfigError(`${where}: ${err instanceof Error ? err.message : String(err)}`)
}

function pickScalars(raw: RawScalars): Partial<AgentConfig> {
  const out: Partial<AgentConfig> = {}
  if (raw.model !== undefined) out.model = raw.model
  if (raw.reasoning_effort !== undefined) out.reasoning_effort = raw.reasoning_effort
  if (raw.sandbox_mode !== undefined) out.sandbox_mode = raw.sandbox_mode
  if (raw.approval_policy !== undefined) out.approval_policy = raw.approval_policy
  if (raw.goal_oracle !== undefined) out.goal_oracle = raw.goal_oracle
  if (raw.skills !== undefined) out.skills = raw.skills
  if (raw.hooks !== undefined) out.hooks = raw.hooks
  if (raw.context_window !== undefined) out.context_window = raw.context_window
  return out
}

export interface ConfigLayers {
  user?: unknown
  project?: unknown
  env?: Record<string, string | undefined>
  cli?: unknown
}

const ACCUMULATING_KEYS = ['hooks'] as const

function chosenProfile(layers: readonly z.infer<typeof configSchema>[]): {
  name: string | undefined
  values: RawScalars
} {
  let name: string | undefined
  let perfis: Partial<Record<string, RawScalars>> = {}
  for (const layer of layers) {
    if (layer.profile !== undefined) name = layer.profile
    if (layer.profiles !== undefined) perfis = layer.profiles
  }
  if (name === undefined) return { name, values: {} }
  const escolhido = perfis[name]
  if (escolhido === undefined) {
    throw new ConfigError(`config.toml: unknown profile "${name}" [profile]`)
  }
  return { name, values: escolhido }
}

export function resolveConfig(layers: ConfigLayers = {}): AgentConfig {
  const fromFile = (bruto: unknown, onde: string): z.infer<typeof configSchema> => {
    if (bruto === null || bruto === undefined) return {}
    try {
      return configSchema.parse(bruto)
    } catch (err) {
      throw toConfigError(err, onde)
    }
  }
  const user = fromFile(layers.user, 'config.toml')
  const project = fromFile(layers.project, 'config.toml')
  const cli = fromFile(layers.cli, 'cli (-c)')

  const { name: selectedProfile, values: profile } = chosenProfile([user, project, cli])

  const env = layers.env ?? {}
  const envScalars: Record<string, unknown> = {}
  for (const key of CONFIG_SCHEMA_KEYS) {
    const path = ENV_BY_KEY[key]
    if (path === undefined) continue 
    const bruto = env[path.knob]
    if (bruto !== undefined) envScalars[key] = path.coagir(bruto)
  }
  let envParsed: RawScalars
  try {
    envParsed = scalarSchema.parse(envScalars) 
  } catch (err) {
    throw toConfigError(err, 'env')
  }

  const perLayer: Record<Layer, Partial<AgentConfig>> = {
    defaults: { ...DEFAULTS, skills: [...DEFAULTS.skills], hooks: [...DEFAULTS.hooks] },
    user: pickScalars(user),
    project: pickScalars(project),
    profile: pickScalars(profile),
    env: pickScalars(envParsed),
    cli: pickScalars(cli),
  }
  const folded = foldLayers(
    LAYERS.map((c) => ({
      layer: c.layer,
      values: perLayer[c.layer] as Readonly<Record<string, unknown>>,
    })),
    ACCUMULATING_KEYS,
  )

  return { ...(folded as unknown as AgentConfig), profile: selectedProfile }
}

function readTomlIfPresent(path: string): unknown | null {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new ConfigError(`cannot read ${path}: ${(err as Error).message}`)
  }
  try {
    return parseToml(text)
  } catch (err) {
    throw new ConfigError(`malformed TOML at ${path}: ${(err as Error).message}`)
  }
}

export function loadConfig(opts: {
  projectDir?: string
  userDir?: string
  env?: Record<string, string | undefined>
  cli?: unknown
  posture: TrustPosture
}): AgentConfig {
  const projectDir = opts.projectDir ?? process.cwd()
  const userDir = opts.userDir ?? homedir()
  const env = opts.env ?? process.env
  const user = readTomlIfPresent(join(userDir, '.theocode', 'config.toml'))
  const project = opts.posture.allows.projectConfig
    ? readTomlIfPresent(join(projectDir, '.theocode', 'config.toml'))
    : null
  return resolveConfig({
    ...(user !== null ? { user: user } : {}),
    ...(project !== null ? { project: project } : {}),
    env,
    ...(opts.cli !== undefined ? { cli: opts.cli } : {}),
  })
}
