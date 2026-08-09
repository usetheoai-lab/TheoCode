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
import { applySecurityFloor } from './security-floor.js'

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
  readonly coagir: (raw: string) => unknown
}

function numeroDeEnv(raw: string): unknown {
  const n = Number(raw)
  return raw.trim().length > 0 && Number.isFinite(n) ? n : raw
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
      'Array of names: an environment variable is a string, and every obvious coercion (comma, space, JSON) picks a separator a legitimate skill name may contain.',
    exitCriterion:
      'The first consumer that asks for the skill list by environment — then the separator is chosen against a real use case instead of by guesswork.',
  },
  {
    key: 'hooks',
    reason:
      'Array of objects, and the ONLY key that accumulates across layers. An environment variable injecting hooks would be arbitrary code execution declared outside any reviewable file, bypassing the accumulation that stops a project from displacing the user global guard.',
    exitCriterion:
      'Never for convenience. Only if accumulation and reviewability are preserved by another mechanism, decided in its own ADR.',
  },
  {
    key: 'profiles',
    reason:
      'A table of named tables. An environment variable is a string, and any encoding of a nested table into one (JSON, dotted keys) invents a syntax nobody asked for, for a value that is edited once and read forever.',
    exitCriterion:
      'A consumer that needs to define a profile per environment rather than per machine — at which point the encoding is chosen against a real use case instead of by guesswork.',
  },
  {
    key: 'profile',
    reason:
      'Selecting a profile from the environment is reasonable and is NOT implemented. B-041 surfaced this the first time the detector was actually run: the key was neither reachable nor exempt, which is the gap the detector exists to find.',
    exitCriterion:
      'The first request to switch profiles per shell rather than per file. It is a small change — one entry in ENV_KNOBS and one read — and it is deliberately not made on speculation.',
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
    model: z.string().min(1, 'model: empty model id — supply `provider/model`').optional(),
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

/** Keys whose resolution goes through `applySecurityFloor` instead of plain last-wins. */
const SECURITY_FLOOR_KEYS = ['sandbox_mode', 'approval_policy'] as const

function chosenProfile(layers: readonly z.infer<typeof configSchema>[]): {
  name: string | undefined
  values: RawScalars
} {
  let name: string | undefined
  let profiles: Partial<Record<string, RawScalars>> = {}
  for (const layer of layers) {
    if (layer.profile !== undefined) name = layer.profile
    // B-041 — MERGE per name, not replace. This was an assignment, so a project defining any
    // profile erased every profile the user had defined globally — and the failure is hard: the
    // profile they selected then resolves to nothing and `chosenProfile` throws for a config they
    // did not write. Last-wins is the right rule for a scalar; `profiles` is a table, and last-wins
    // belongs at the level of its entries.
    if (layer.profiles !== undefined) profiles = { ...profiles, ...layer.profiles }
  }
  if (name === undefined) return { name, values: {} }
  const chosen = profiles[name]
  if (chosen === undefined) {
    throw new ConfigError(`config.toml: unknown profile "${name}" [profile]`)
  }
  return { name, values: chosen }
}

export function resolveConfig(layers: ConfigLayers = {}): AgentConfig {
  const fromFile = (raw: unknown, where: string): z.infer<typeof configSchema> => {
    if (raw === null || raw === undefined) return {}
    try {
      return configSchema.parse(raw)
    } catch (err) {
      throw toConfigError(err, where)
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
    const raw = env[path.knob]
    if (raw !== undefined) envScalars[key] = path.coagir(raw)
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

  // B-006 — `sandbox_mode` and `approval_policy` do not follow plain last-wins. `project` and `env`
  // outrank the user's own file, so a cloned repository (or an inherited environment) could widen
  // the sandbox or switch approvals off and the user's global setting simply lost. Same argument
  // ACCUMULATING_KEYS records for `hooks`, applied to the two keys that decide confinement.
  for (const key of SECURITY_FLOOR_KEYS) {
    const resolved = applySecurityFloor(key, {
      defaults: perLayer.defaults[key] as string | undefined,
      user: perLayer.user[key] as string | undefined,
      project: perLayer.project[key] as string | undefined,
      profile: perLayer.profile[key] as string | undefined,
      env: perLayer.env[key] as string | undefined,
      cli: perLayer.cli[key] as string | undefined,
    })
    if (resolved !== undefined) folded[key] = resolved
  }

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
