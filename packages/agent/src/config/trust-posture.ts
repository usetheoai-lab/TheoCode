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
      'The `project` source leaves subagent discovery: a repository `.theokit/agents/<role>.md` no longer redirects the model, the effort or the `sandbox` of a squad member.',
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

const MILESTONE_DE_REMOCAO = 'M99'

let aliasJaAvisado = false

function avisarSobreOAlias(): void {
  if (aliasJaAvisado) return
  aliasJaAvisado = true
  process.stderr.write(
    `[trust] ${ENV_TRUST_ALL_DIRS_LEGACY} está DEPRECADO e será removido no ${MILESTONE_DE_REMOCAO}: ` +
      `renomeie para ${ENV_TRUST_ALL_DIRS}. Enquanto isso ele continua concedendo confiança a TODO ` +
      `diretório — a defesa contra repositório hostil segue desligada.\n`,
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

export function resolveTrustPosture(cwd: string, store: string = TRUST_STORE): TrustPosture {
  const source = trustOrigin(cwd, store)
  const level: TrustLevel = source === 'default' ? 'untrusted' : 'trusted'
  return { level, source, allows: permitirTudo(level === 'trusted') }
}
