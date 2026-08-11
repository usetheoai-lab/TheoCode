import { parseArgs } from 'node:util'

export type StdinBehavior = 'none' | 'required' | 'forced' | 'append'

export type CliOverrides = readonly string[]

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
  overrides: CliOverrides
}

export interface ExecReview {
  mode: 'review'
  target: string 
  json: boolean
  cd?: string
  skipGitCheck: boolean
  overrides: CliOverrides
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
  overrides: CliOverrides
}

export interface ExecUsageError {
  mode: 'error'
  message: string
}

/**
 * B-074 — the session actions this surface offers.
 *
 * The audit that filed this found a 5+1 asymmetry: the TUI could list, fork, archive, rename and
 * delete, and the CLI could only `gc` and `resume`. Every operation already existed in
 * `@theocode/agent/session`, so these actions are dispatch over tested code rather than a second
 * implementation — which is the DoD bullet that mattered, since a second copy is how the two
 * surfaces would drift again.
 */
export const SESSION_ACTIONS = ['gc', 'list', 'archive', 'rename', 'delete', 'fork'] as const

export type SessionAction = (typeof SESSION_ACTIONS)[number]

export interface ExecSessions {
  mode: 'sessions'
  action: SessionAction
  /** The session id an action operates on. Required by archive/rename/delete/fork. */
  target?: string
  /** The new name for `rename`. */
  name?: string
  apply: boolean
  allProjects: boolean
  keepLast?: number
  maxAgeDays?: number
  json: boolean
  cd?: string
}

export interface ExecDoctor {
  mode: 'doctor'
  json: boolean
  cd?: string
}

export interface ExecHelp {
  mode: 'help'
  usage: string
}

export type ExecArgs =
  | ExecRun
  | ExecReview
  | ExecGoal
  | ExecSessions
  | ExecDoctor
  | ExecHelp
  | ExecUsageError

// B-022 — no `exec` here. It is the npm SCRIPT name (`npm run exec`), not a subcommand of the
// built binary, and the parser has no branch for it: the token fell through to the PROMPT, so
// following this text started a billable model turn instead of running the command. `README.md`
// had the correct form all along.
export const USAGE = `Usage: theocode [OPTIONS] [PROMPT]
       theocode resume [--last] [SESSION_ID] [PROMPT]
       theocode review (--uncommitted | --base <BRANCH> | --commit <SHA> | [PROMPT])
       theocode goal <OBJECTIVE> [--max-turns <N>] [--token-budget <N>]
       theocode sessions gc [--all-projects] [--apply] [--keep <N>] [--max-age-days <D>]
       theocode sessions (list | archive <ID> | rename <ID> <NAME> | delete <ID> | fork <ID>)
       theocode doctor   (reports the resolved install; exits non-zero when something is broken)

Options: --json  -m/--model <id>  -C/--cd <dir>  -o/--output-last-message <file>  --skip-git-repo-check
         -c/--config <key=value> (repeatable)  --sandbox <mode>  -a/--approval <policy>  --effort <level>
Stdout carries ONLY the final message (or JSONL with --json); progress goes to stderr.
Exit code is 1 when the turn fails or is interrupted (review findings do NOT affect it).`

const OPTIONS = {
  // B-023 — the usage text used to be reachable ONLY by triggering an error, so a user asking for
  // help got a failure exit and a message about a mistake they had not made.
  help: { type: 'boolean', short: 'h', default: false },
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

const SUGAR: readonly {
  readonly flag: '--sandbox' | '--approval' | '--effort'
  readonly option: 'sandbox' | 'approval' | 'effort'
  readonly key: string
}[] = [
  { flag: '--sandbox', option: 'sandbox', key: 'sandbox_mode' },
  { flag: '--approval', option: 'approval', key: 'approval_policy' },
  { flag: '--effort', option: 'effort', key: 'reasoning_effort' },
]

const MODE_TO_POLICY: Readonly<Record<string, string>> = {
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
        : // B-023 — `--uncommitted` was validated for mutual exclusivity and then never read, so the
          // target fell through to the (empty) positional join. The flag passed every check and
          // selected nothing.
          values.uncommitted === true
          ? 'uncommitted'
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

/**
 * B-074 — the actions that are not `gc`.
 *
 * `list` takes nothing; archive/rename/delete/fork NAME a session. Defaulting to "the current one"
 * has no meaning headless — there is no current session — and guessing would make `delete` destroy
 * whichever transcript happened to be newest.
 */
function parseSessionAction(
  action: SessionAction,
  values: OptionValues,
  positionals: string[],
): ExecArgs {
  const common = {
    mode: 'sessions' as const,
    allProjects: false,
    json: values.json === true,
    ...(values.cd !== undefined ? { cd: values.cd } : {}),
  }
  if (action === 'list') return { ...common, action, apply: false }

  const target = positionals[2]
  if (target === undefined || target.length === 0) {
    return { mode: 'error', message: `sessions ${action} requires a session id` }
  }
  if (action === 'rename' && (positionals[3] === undefined || positionals[3].length === 0)) {
    return { mode: 'error', message: 'sessions rename requires a new name' }
  }
  return {
    ...common,
    action,
    target,
    ...(action === 'rename' ? { name: positionals[3] } : {}),
    apply: values.apply === true,
  }
}


/**
 * B-081 — reports the RESOLVED install, so config overrides are honoured rather than refused:
 * diagnosing "why does `-c sandbox_mode=read-only` not take effect" is the point of the command.
 */
function parseDoctor(values: OptionValues): ExecArgs {
  return {
    mode: 'doctor',
    json: values.json === true,
    ...(values.cd !== undefined ? { cd: values.cd } : {}),
  }
}

function parseSessions(
  values: OptionValues,
  positionals: string[],
  _overrides: string[],
  presentOverrides: string[],
): ExecArgs {
  if (presentOverrides.length > 0) {
    return {
      mode: 'error',
      message:
        `sessions does not accept ${presentOverrides.join(', ')}: it resolves no config, so the ` +
        `value would be silently discarded — drop the option, or use the mode that reads config`,
    }
  }
  const action = positionals[1]
  if (!(SESSION_ACTIONS as readonly string[]).includes(action ?? '')) {
    return {
      mode: 'error',
      message: `unknown sessions action "${action ?? ''}" — expected: ${SESSION_ACTIONS.join(' | ')}`,
    }
  }
  return action === 'gc'
    ? parseSessionGc(values)
    : parseSessionAction(action as SessionAction, values, positionals)
}

/** `gc` and its numeric bounds, split out so `parseSessions` stays a router (B-074). */
function parseSessionGc(values: OptionValues): ExecArgs {
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

function resolveResume(
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
  const raw = rawPrompt.length > 0 ? rawPrompt : undefined
  if (raw === '-') return { prompt: undefined, stdinBehavior: 'forced' }
  if (raw === undefined) {
    if (stdinIsTTY) return { error: 'No prompt provided' }
    return { prompt: undefined, stdinBehavior: 'required' }
  }
  return { prompt: raw, stdinBehavior: stdinIsTTY ? 'none' : 'append' }
}

function parseResumeOrPrompt(
  values: OptionValues,
  positionals: string[],
  overrides: string[],
  stdinIsTTY: boolean,
): ExecArgs {
  const r = resolveResume(values, positionals)
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
  if (values.approval === 'auto-edit') return AUTO_EDIT_HAS_NO_POLICY
  if (values.approval !== undefined && values.approval in MODE_TO_POLICY) {
    values.approval = MODE_TO_POLICY[values.approval]
  }
  return undefined
}

const AUTO_EDIT_HAS_NO_POLICY =
  '--approval auto-edit: this mode exists only in the TUI (auto-approves edits, gates shell) and has ' +
  'no equivalent policy in the runtime. Use `suggest` (= on-request) or `full-auto` (= never).'

/**
 * B-023 — a flag that parses and does nothing is worse than an unknown flag, which at least errors.
 *
 * `--last` means "the most recent session" and only `resume` can honour it. `-m/--model` and
 * `-o/--output-last-message` are documented in the global Options line, but `review` and `sessions`
 * build no agent and emit no final message. All three were accepted anywhere and quietly dropped.
 */
function flagAppliedToNoCommand(values: OptionValues, first: string | undefined): string | undefined {
  const sub = first ?? ''
  if (values.last === true && sub !== 'resume') {
    return '--last selects the most recent session and applies to `resume` only'
  }
  if (sub === 'review' || sub === 'sessions') {
    if (values.model !== undefined) {
      return `-m/--model builds an agent, and \`${sub}\` does not build one`
    }
    if (values['output-last-message'] !== undefined) {
      return `-o/--output-last-message writes the final message, and \`${sub}\` produces none`
    }
  }
  return undefined
}

/** The `-c key=value` list, plus the sugar flags that expand into one, and which flags supplied them. */
function collectOverrides(values: OptionValues): {
  overrides: string[]
  overridesPresent: string[]
} {
  return {
    overrides: [
      ...SUGAR.flatMap((a) => (values[a.option] !== undefined ? [`${a.key}=${values[a.option]!}`] : [])),
      ...(values.config ?? []),
    ],
    overridesPresent: [
      ...(values.config !== undefined ? ['-c/--config'] : []),
      ...SUGAR.flatMap((a) => (values[a.option] !== undefined ? [a.flag] : [])),
    ],
  }
}

export function parseExecArgs(argv: string[], stdinIsTTY: boolean): ExecArgs {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  } catch (err) {
    return { mode: 'error', message: err instanceof Error ? err.message : String(err) }
  }
  const { values, positionals } = parsed

  if (values.help === true) return { mode: 'help', usage: USAGE }

  const misapplied = flagAppliedToNoCommand(values, positionals[0])
  if (misapplied !== undefined) return { mode: 'error', message: misapplied }

  const translation = translateApproval(values)
  if (translation !== undefined) return { mode: 'error', message: translation }

  const { overrides, overridesPresent } = collectOverrides(values)

  switch (positionals[0]) {
    case 'review':
      return parseReview(values, positionals, overrides)
    case 'sessions':
      return parseSessions(values, positionals, overrides, overridesPresent)
    case 'doctor':
      return parseDoctor(values)
    case 'goal':
      return parseGoal(values, positionals, overrides)
    default:
      return parseResumeOrPrompt(values, positionals, overrides, stdinIsTTY)
  }
}
