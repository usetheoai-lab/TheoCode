import { ENV_TRUST_ALL_DIRS, ENV_TRUST_ALL_DIRS_LEGACY } from './env-knobs.js'
import { TRUST_STORE, isTrusted } from './trust-store.js'

export interface TrustCapability {
  readonly key: string
  readonly loaders: readonly string[]
  readonly effect: string
}

export const TRUST_CAPABILITIES = [
  {
    key: 'projectConfig',
    loaders: [],
    effect:
      'The project layer of `config.toml` is not read: the repository model, effort, `sandbox_mode`, `approval_policy` and hook list stop applying.',
  },
  {
    key: 'agentsMd',
    loaders: ['loadAgentsMd', 'loadRules'],
    effect:
      'The project `AGENTS.md` and `.theokit/rules/` do not enter the persona — this is the direct defence against a repository trying to hijack the agent through instructions.',
  },
  {
    key: 'hooks',
    loaders: ['buildHookHandlers'],
    effect:
      'No repository `[[hooks]]` enters the handler set: a hook is arbitrary command execution on every tool call.',
  },
  {
    key: 'memory',
    loaders: [],
    effect:
      'Durable memory stays off — the store WRITES into `.theokit/memory/` inside the cwd, and recall is auto-injected into the prompt.',
  },
  {
    key: 'mcp',
    loaders: ['loadMcpJson'],
    effect:
      'No `.mcp.json` server is started. They are external processes SPAWNED while the agent is built, before any per-tool approval.',
  },
  {
    key: 'skills',
    loaders: [],
    effect:
      'No skill from `.theokit/skills/<name>/SKILL.md` is loaded — a repository `SKILL.md` is instruction that steers the model.',
  },
  {
    key: 'customCommands',
    loaders: ['loadCustomCommands'],
    effect:
      'Commands from `<cwd>/.theokit/commands/` are not loaded — the `!cmd` body of a project command runs a shell while the prompt is being built. The own commands of the user (`~/.theokit/commands/`) still apply.',
  },
  {
    key: 'subagents',
    loaders: ['discoverSubagents'],
    effect:
      'The `project` source is dropped entirely: a repository `.theokit/agents/<role>.md` no longer redirects the model, the effort or the `sandbox` of a squad member. The source is shared with `hooks` — enabling it also loads repository-declared hooks through the SDK — so it requires BOTH capabilities (see `config/project-source.ts`).',
  },
] as const satisfies readonly TrustCapability[]

type TrustCapabilityKey = (typeof TRUST_CAPABILITIES)[number]['key']

type TrustAllows = Readonly<Record<TrustCapabilityKey, boolean>>

type TrustSource = 'env' | 'store' | 'default'

type TrustLevel = 'trusted' | 'untrusted'

export interface TrustPosture {
  readonly level: TrustLevel
  readonly source: TrustSource
  readonly allows: TrustAllows
}

function permitirTudo(value: boolean): TrustAllows {
  return Object.fromEntries(TRUST_CAPABILITIES.map((c) => [c.key, value])) as TrustAllows
}

const REMOVAL_MILESTONE = 'M99'

let aliasJaAvisado = false

function avisarSobreOAlias(): void {
  if (aliasJaAvisado) return
  aliasJaAvisado = true
  process.stderr.write(
    `[trust] ${ENV_TRUST_ALL_DIRS_LEGACY} is DEPRECATED and will be removed in ${REMOVAL_MILESTONE}: ` +
      `rename it to ${ENV_TRUST_ALL_DIRS}. Until then it keeps granting trust to EVERY ` +
      `directory — the defence against a hostile repository stays off.\n`,
  )
}

function trustOrigin(
  cwd: string,
  store: string,
  // B-006 — injected so a caller that resolves configuration from an explicit environment gets a
  // trust decision from that same environment. Reading the ambient one meant the posture could
  // disagree with the config it was supposed to describe.
  env: Record<string, string | undefined> = process.env,
): TrustSource {
  if (env[ENV_TRUST_ALL_DIRS] === '1') return 'env'
  if (env[ENV_TRUST_ALL_DIRS_LEGACY] === '1') {
    avisarSobreOAlias()
    return 'env'
  }
  return isTrusted(cwd, store) ? 'store' : 'default'
}

/**
 * B-033 — `env` reaches HERE, which is the only entry any caller can use.
 *
 * B-006 added the parameter to the private `trustOrigin` and this function kept calling it with two
 * arguments, so the seam existed and was unreachable: all nine production call sites read the
 * ambient environment. `cli/run-composition.ts` then took the posture from the ambient environment
 * and passed `seams.env` into config resolution on the next line — one run, two sources, for the
 * decision that governs whether a repository's hooks and AGENTS.md are honoured.
 */
export function resolveTrustPosture(
  cwd: string,
  store: string = TRUST_STORE,
  env: Record<string, string | undefined> = process.env,
): TrustPosture {
  const source = trustOrigin(cwd, store, env)
  const level: TrustLevel = source === 'default' ? 'untrusted' : 'trusted'
  return { level, source, allows: permitirTudo(level === 'trusted') }
}
