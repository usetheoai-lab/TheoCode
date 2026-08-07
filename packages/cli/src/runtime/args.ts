import { parseArgs } from 'node:util'

export type StdinBehavior = 'none' | 'required' | 'forced' | 'append'

export type OverridesDeCli = readonly string[]

export interface ExecRun {
  mode: 'run' | 'resume'
  prompt?: string
  stdinBehavior: StdinBehavior
  json: boolean
  model?: string
  cd?: string
  outputLastMessage?: string
  skipGitCheck: boolean
  resume?: { last: boolean; id?: string }
  overrides: OverridesDeCli
}

export interface ExecReview {
  mode: 'review'
  target: string 
  json: boolean
  cd?: string
  skipGitCheck: boolean
  overrides: OverridesDeCli
}

export interface ExecGoal {
  mode: 'goal'
  goal: string
  json: boolean
  model?: string
  cd?: string
  skipGitCheck: boolean
  maxTurns?: number
  tokenBudget?: number
  overrides: OverridesDeCli
}

export interface ExecUsageError {
  mode: 'error'
  message: string
}

export interface ExecSessions {
  mode: 'sessions'
  action: 'gc'
  apply: boolean
  allProjects: boolean
  keepLast?: number
  maxAgeDays?: number
  json: boolean
  cd?: string
}

export type ExecArgs = ExecRun | ExecReview | ExecGoal | ExecSessions | ExecUsageError

export const USAGE = `Usage: agent-builder exec [OPTIONS] [PROMPT]
       agent-builder exec resume [--last] [SESSION_ID] [PROMPT]
       agent-builder exec review (--uncommitted | --base <BRANCH> | --commit <SHA> | [PROMPT])
       agent-builder exec goal <OBJECTIVE> [--max-turns <N>] [--token-budget <N>]
       agent-builder exec sessions gc [--all-projects] [--apply] [--keep <N>] [--max-age-days <D>]

Options: --json  -m/--model <id>  -C/--cd <dir>  -o/--output-last-message <file>  --skip-git-repo-check
         -c/--config <key=value> (repeatable)  --sandbox <mode>  -a/--approval <policy>  --effort <level>
Stdout carries ONLY the final message (or JSONL with --json); progress goes to stderr.
Exit code is 1 when the turn fails or is interrupted (review findings do NOT affect it).`

const OPTIONS = {
  json: { type: 'boolean', default: false },
  model: { type: 'string', short: 'm' },
  cd: { type: 'string', short: 'C' },
  'output-last-message': { type: 'string', short: 'o' },
  'skip-git-repo-check': { type: 'boolean', default: false },
  last: { type: 'boolean', default: false },
  uncommitted: { type: 'boolean', default: false },
  base: { type: 'string' },
  commit: { type: 'string' },
  'max-turns': { type: 'string' },
  'token-budget': { type: 'string' },
  apply: { type: 'boolean', default: false },
  'all-projects': { type: 'boolean', default: false },
  keep: { type: 'string' },
  'max-age-days': { type: 'string' },
  config: { type: 'string', short: 'c', multiple: true },
  sandbox: { type: 'string' },
  approval: { type: 'string', short: 'a' },
  effort: { type: 'string' },
} as const

const ACUCAR: readonly {
  readonly flag: '--sandbox' | '--approval' | '--effort'
  readonly opcao: 'sandbox' | 'approval' | 'effort'
  readonly key: string
}[] = [
  { flag: '--sandbox', opcao: 'sandbox', key: 'sandbox_mode' },
  { flag: '--approval', opcao: 'approval', key: 'approval_policy' },
  { flag: '--effort', opcao: 'effort', key: 'reasoning_effort' },
]

const MODO_PARA_POLITICA: Readonly<Record<string, string>> = {
  suggest: 'on-request',
  'full-auto': 'never',
}

type OptionValues = ReturnType<
  typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>
>['values']

function parseReview(values: OptionValues, positionals: string[], overrides: string[]): ExecArgs {
  const targets = [
    values.uncommitted === true,
    values.base !== undefined,
    values.commit !== undefined,
  ]
  if (targets.filter(Boolean).length > 1) {
    return { mode: 'error', message: '--uncommitted, --base and --commit are mutually exclusive' }
  }
  const custom = positionals.slice(1).join(' ')
  const target =
    values.base !== undefined
      ? `base ${values.base}`
      : values.commit !== undefined
        ? `commit ${values.commit}`
        : custom 
  return {
    mode: 'review',
    target,
    json: values.json === true,
    ...(values.cd !== undefined ? { cd: values.cd } : {}),
    skipGitCheck: values['skip-git-repo-check'] === true,
    overrides,
  }
}

function parseSessions(
  values: OptionValues,
  positionals: string[],
  _overrides: string[],
  overridesPresentes: string[],
): ExecArgs {
  if (overridesPresentes.length > 0) {
    return {
      mode: 'error',
      message:
        `sessions does not accept ${overridesPresentes.join(', ')}: it resolves no config, so the ` +
        `value would be silently discarded — drop the option, or use the mode that reads config`,
    }
  }
  if (positionals[1] !== 'gc') {
    return {
      mode: 'error',
      message: `unknown sessions action "${positionals[1] ?? ''}" — expected: gc`,
    }
  }
  const parsePos = (
    flag: string,
    v: string | undefined,
  ): number | undefined | { error: string } => {
    if (v === undefined) return undefined
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0)
      return { error: `${flag} requires a non-negative integer, got "${v}"` }
    return n
  }
  const keepLast = parsePos('--keep', values.keep)
  if (typeof keepLast === 'object') return { mode: 'error', message: keepLast.error }
  const maxAgeDays = parsePos('--max-age-days', values['max-age-days'])
  if (typeof maxAgeDays === 'object') return { mode: 'error', message: maxAgeDays.error }
  return {
    mode: 'sessions',
    action: 'gc',
    apply: values.apply === true,
    allProjects: values['all-projects'] === true,
    json: values.json === true,
    ...(keepLast !== undefined ? { keepLast } : {}),
    ...(maxAgeDays !== undefined ? { maxAgeDays } : {}),
    ...(values.cd !== undefined ? { cd: values.cd } : {}),
  }
}

function parseGoal(values: OptionValues, positionals: string[], overrides: string[]): ExecArgs {
  const goal = positionals.slice(1).join(' ').trim()
  if (goal.length === 0) {
    return { mode: 'error', message: 'goal requires an OBJECTIVE' }
  }
  const parseNum = (
    flag: string,
    v: string | undefined,
  ): number | undefined | { error: string } => {
    if (v === undefined) return undefined
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0)
      return { error: `${flag} requires a positive number, got "${v}"` }
    return n
  }
  const maxTurns = parseNum('--max-turns', values['max-turns'])
  if (typeof maxTurns === 'object') return { mode: 'error', message: maxTurns.error }
  const tokenBudget = parseNum('--token-budget', values['token-budget'])
  if (typeof tokenBudget === 'object') return { mode: 'error', message: tokenBudget.error }
  return {
    mode: 'goal',
    goal,
    json: values.json === true,
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.cd !== undefined ? { cd: values.cd } : {}),
    skipGitCheck: values['skip-git-repo-check'] === true,
    ...(maxTurns !== undefined ? { maxTurns } : {}),
    ...(tokenBudget !== undefined ? { tokenBudget } : {}),
    overrides,
  }
}

function resolverResume(
  values: OptionValues,
  positionals: string[],
): { isResume: boolean; resume: ExecRun['resume']; promptParts: string[] } | { error: string } {
  const isResume = positionals[0] === 'resume'
  const rest = isResume ? positionals.slice(1) : positionals
  if (!isResume) return { isResume, resume: undefined, promptParts: rest }

  if (values.last === true) {
    if (
      rest.length > 0 &&
      /^(exec-|tui-|review-)?[0-9a-f]{8}-[0-9a-f-]{4,}/i.test(rest[0] as string)
    ) {
      return { error: 'resume: use EITHER --last OR a SESSION_ID, not both' }
    }
    return { isResume, resume: { last: true }, promptParts: rest }
  }
  if (rest.length > 0) {
    return { isResume, resume: { last: false, id: rest[0] as string }, promptParts: rest.slice(1) }
  }
  return { error: 'resume requires --last or a SESSION_ID' }
}

function resolveInput(
  rawPrompt: string,
  stdinIsTTY: boolean,
): { prompt: string | undefined; stdinBehavior: StdinBehavior } | { error: string } {
  const bruto = rawPrompt.length > 0 ? rawPrompt : undefined
  if (bruto === '-') return { prompt: undefined, stdinBehavior: 'forced' }
  if (bruto === undefined) {
    if (stdinIsTTY) return { error: 'No prompt provided' }
    return { prompt: undefined, stdinBehavior: 'required' }
  }
  return { prompt: bruto, stdinBehavior: stdinIsTTY ? 'none' : 'append' }
}

function parseResumeOuPrompt(
  values: OptionValues,
  positionals: string[],
  overrides: string[],
  stdinIsTTY: boolean,
): ExecArgs {
  const r = resolverResume(values, positionals)
  if ('error' in r) return { mode: 'error', message: r.error }
  const { isResume, resume, promptParts } = r

  const e = resolveInput(promptParts.join(' '), stdinIsTTY)
  if ('error' in e) return { mode: 'error', message: e.error }
  const { prompt, stdinBehavior } = e

  return {
    mode: isResume ? 'resume' : 'run',
    ...(prompt !== undefined ? { prompt } : {}),
    stdinBehavior,
    json: values.json === true,
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.cd !== undefined ? { cd: values.cd } : {}),
    ...(values['output-last-message'] !== undefined
      ? { outputLastMessage: values['output-last-message'] }
      : {}),
    skipGitCheck: values['skip-git-repo-check'] === true,
    ...(resume !== undefined ? { resume } : {}),
    overrides,
  }
}

function translateApproval(values: OptionValues): string | undefined {
  if (values.approval === 'auto-edit') return AUTO_EDIT_SEM_POLITICA
  if (values.approval !== undefined && values.approval in MODO_PARA_POLITICA) {
    values.approval = MODO_PARA_POLITICA[values.approval]
  }
  return undefined
}

const AUTO_EDIT_SEM_POLITICA =
  '--approval auto-edit: esse modo existe apenas na TUI (auto-aprova edição, gateia shell) e não ' +
  'tem política equivalente no runtime. Use `suggest` (= on-request) ou `full-auto` (= never).'

export function parseExecArgs(argv: string[], stdinIsTTY: boolean): ExecArgs {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  } catch (err) {
    return { mode: 'error', message: err instanceof Error ? err.message : String(err) }
  }
  const { values, positionals } = parsed

  const traducao = translateApproval(values)
  if (traducao !== undefined) return { mode: 'error', message: traducao }

  const overrides: string[] = [
    ...ACUCAR.flatMap((a) =>
      values[a.opcao] !== undefined ? [`${a.key}=${values[a.opcao]!}`] : [],
    ),
    ...(values.config ?? []),
  ]
  const overridesPresentes: string[] = [
    ...(values.config !== undefined ? ['-c/--config'] : []),
    ...ACUCAR.flatMap((a) => (values[a.opcao] !== undefined ? [a.flag] : [])),
  ]

  if (positionals[0] === 'review') {
    return parseReview(values, positionals, overrides)
  }

  if (positionals[0] === 'sessions') {
    return parseSessions(values, positionals, overrides, overridesPresentes)
  }

  if (positionals[0] === 'goal') {
    return parseGoal(values, positionals, overrides)
  }

  return parseResumeOuPrompt(values, positionals, overrides, stdinIsTTY)
}
