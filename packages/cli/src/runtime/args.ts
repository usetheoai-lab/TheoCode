import { USAGE } from './usage.js'
import { SUBCOMMANDS } from './subcommands.js'
import { parseArgs } from 'node:util'

import {
  MODE_TO_POLICY,
  OPTIONS,
  SUGAR,
  type ExecArgs,
  type ExecRun,
  type OptionValues,
  type StdinBehavior,
} from './exec-args.js'


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
function flagAppliedToNoCommand(
  values: OptionValues,
  first: string | undefined,
): string | undefined {
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
      ...SUGAR.flatMap((a) =>
        values[a.option] !== undefined ? [`${a.key}=${values[a.option]!}`] : [],
      ),
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

  if (values.version === true) return { mode: 'version' }
  if (values.help === true) return { mode: 'help', usage: USAGE }

  const misapplied = flagAppliedToNoCommand(values, positionals[0])
  if (misapplied !== undefined) return { mode: 'error', message: misapplied }

  const translation = translateApproval(values)
  if (translation !== undefined) return { mode: 'error', message: translation }

  const { overrides, overridesPresent } = collectOverrides(values)

  // A table rather than a switch: adding a subcommand is then an entry, not a branch, and the
  // routing gate in `args.test.ts` reads the same list the usage text is checked against.
  const sub = SUBCOMMANDS[positionals[0] ?? '']
  if (sub !== undefined) return sub({ values, positionals, overrides, overridesPresent })
  return parseResumeOrPrompt(values, positionals, overrides, stdinIsTTY)
}

export * from './exec-args.js'
