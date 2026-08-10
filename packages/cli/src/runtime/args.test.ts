/**
 * B-022 — the usage text taught a subcommand the parser does not route.
 *
 * All five USAGE lines read `theocode exec <sub>`. There is no `exec` branch: the token falls
 * through to the prompt, so following the CLI's own documentation starts a BILLABLE model turn
 * instead of running the collector, the reviewer or a goal. `README.md` has it right
 * (`node dist/theocode.mjs sessions gc`), which is what makes this drift rather than ambiguity —
 * and the wrong text is the one shown at the moment the user is already lost.
 *
 * B-025 — this is also the first test in `packages/cli`, which shipped 1292 LOC with none. The
 * parser is pure, has no I/O, and decides whether a command runs or a model turn starts, which
 * makes it the cheapest possible thing to cover and the most expensive thing to leave uncovered.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { USAGE, parseExecArgs } from './args.js'

/** Every invocation the usage text teaches, as a user would type it after `theocode`. */
const DOCUMENTED = [
  ['sessions', 'gc'],
  ['sessions', 'gc', '--all-projects'],
  ['review', '--uncommitted'],
  ['goal', 'ship the release'],
  ['resume', '--last'],
]

describe('B-022 — every documented invocation routes to its command', () => {
  it.each(DOCUMENTED)('test_documented_invocation_routes: %s %s', (...argv) => {
    const parsed = parseExecArgs(
      argv.filter((a): a is string => a !== undefined),
      false,
    )

    expect(
      parsed.mode,
      `\`${argv.join(' ')}\` fell through to a prompt, which starts a billable model turn`,
    ).not.toBe('run')
  })

  it('test_a_bare_prompt_still_runs_a_turn', () => {
    // Anti-vacuity floor: routing everything away from `run` would satisfy the assertions above.
    expect(parseExecArgs(['explain this repository'], false).mode).toBe('run')
  })

  it('test_the_usage_text_does_not_teach_an_unrouted_subcommand', () => {
    // The drift itself. `exec` is the npm SCRIPT name (`npm run exec`), not a subcommand of the
    // built binary — the usage text baked one into the other.
    const taught = [...USAGE.matchAll(/^\s*(?:Usage:)?\s*theocode\s+(\S+)/gm)].map((m) => m[1])
    const routed = new Set(['resume', 'review', 'goal', 'sessions', '[OPTIONS]'])

    for (const token of taught) {
      expect(routed.has(token ?? ''), `usage teaches \`theocode ${token ?? ''}\`, which is not routed`).toBe(
        true,
      )
    }
  })
})

describe('B-023 — a flag either changes behaviour or is rejected', () => {
  it('test_uncommitted_reaches_the_review_target', () => {
    // `--uncommitted` was validated for mutual exclusivity with --base/--commit and then never
    // read: the target fell through to the positional join, which is empty. So the flag passed
    // every check and reviewed nothing in particular.
    const parsed = parseExecArgs(['review', '--uncommitted'], false)

    expect(parsed.mode).toBe('review')
    expect(
      parsed.mode === 'review' ? parsed.target : '',
      '--uncommitted parsed, validated, and then produced an empty review target',
    ).toBe('uncommitted')
  })

  it('test_base_and_commit_still_reach_the_target', () => {
    // Anti-vacuity floor for the assertion above.
    const base = parseExecArgs(['review', '--base', 'main'], false)
    expect(base.mode === 'review' ? base.target : '').toBe('base main')
  })

  it('test_help_prints_usage_and_is_not_an_error', () => {
    // The usage text was reachable only by triggering an error exit. A user asking for help got a
    // failure exit code and a message about a mistake they did not make.
    const parsed = parseExecArgs(['--help'], false)

    expect(parsed.mode, '`--help` was not routed at all').toBe('help')
  })

  it('test_last_outside_resume_is_rejected_not_ignored', () => {
    // `--last` means "the most recent session" and only `resume` can honour it. Accepting it
    // elsewhere and ignoring it is worse than an unknown flag, which at least errors.
    const parsed = parseExecArgs(['review', '--last'], false)

    expect(parsed.mode, '`--last` was accepted outside resume and silently ignored').toBe('error')
  })

  it('test_model_override_outside_run_is_rejected_not_ignored', () => {
    // `-m/--model` is documented globally in the Options line but only `run`/`resume` build an
    // agent from it. `sessions gc` deletes files; there is no model to override.
    const parsed = parseExecArgs(['sessions', 'gc', '-m', 'anthropic/claude-sonnet-4-5'], false)

    expect(parsed.mode, '`-m` was accepted by `sessions` and silently ignored').toBe('error')
  })
})

describe('B-025 — every declared flag is exercised, and every subcommand routes', () => {
  /** Every flag the parser declares, with a value where it needs one. */
  const FLAGS: [string, string[]][] = [
    ['help', ['--help']],
    ['json', ['--json']],
    ['model', ['-m', 'anthropic/claude-sonnet-4-5']],
    ['cd', ['-C', '/tmp']],
    ['output-last-message', ['-o', '/tmp/last.txt']],
    ['skip-git-repo-check', ['--skip-git-repo-check']],
    ['last', ['resume', '--last']],
    ['uncommitted', ['review', '--uncommitted']],
    ['base', ['review', '--base', 'main']],
    ['commit', ['review', '--commit', 'abc1234']],
    ['max-turns', ['goal', 'ship it', '--max-turns', '5']],
    ['token-budget', ['goal', 'ship it', '--token-budget', '1000']],
    ['apply', ['sessions', 'gc', '--apply']],
    ['all-projects', ['sessions', 'gc', '--all-projects']],
    ['keep', ['sessions', 'gc', '--keep', '3']],
    ['max-age-days', ['sessions', 'gc', '--max-age-days', '30']],
    ['config', ['-c', 'reasoning_effort=high']],
    ['sandbox', ['--sandbox', 'read-only']],
    ['approval', ['--approval', 'suggest']],
    ['effort', ['--effort', 'high']],
  ]

  it.each(FLAGS)('test_the_%s_flag_parses_without_a_usage_error', (_name, argv) => {
    // B-025 — packages/cli shipped 1292 LOC and zero tests, and the parser is the unit that decides
    // whether a command runs or a billable model turn starts. A flag that parses to `error` here is
    // either misdeclared or applied to a command that cannot honour it — both were real (B-023).
    const parsed = parseExecArgs(argv, false)

    expect(
      parsed.mode === 'error' ? parsed.message : 'ok',
      `\`${argv.join(' ')}\` produced a usage error`,
    ).toBe('ok')
  })

  it('test_an_unknown_flag_is_still_an_error', () => {
    // Anti-vacuity floor: accepting everything would satisfy the assertions above.
    expect(parseExecArgs(['--not-a-flag'], false).mode).toBe('error')
  })

  it('test_every_routed_subcommand_is_covered_by_this_file', () => {
    // The guard against the next subcommand being added with no test: it reads the parser's own
    // switch and fails when a case is not exercised above.
    const source = readFileSync(fileURLToPath(new URL('./args.ts', import.meta.url)), 'utf8')
    const routed = [...source.matchAll(/^\s{4}case '(\w+)':/gm)].map((m) => m[1] ?? '')
    const exercised = new Set([...DOCUMENTED, ...FLAGS.map(([, a]) => a)].map((a) => a[0] ?? ''))

    expect(
      routed.filter((c) => !exercised.has(c)),
      'the parser routes a subcommand that no test in this file exercises',
    ).toEqual([])
  })
})

/**
 * B-074 — the CLI reaches the session operations the TUI already had.
 *
 * The audit measured a 5+1 asymmetry: the TUI could list, fork, archive, rename and delete; the CLI
 * could only `gc` and `resume`. Every operation already existed in `@theocode/agent/session`, so
 * these parse into dispatch over tested code — a second implementation is what would let the two
 * surfaces drift again.
 */
describe('B-074 — sessions actions', () => {
  it('test_list_parses_without_a_target', () => {
    const parsed = parseExecArgs(['sessions', 'list'], false)
    expect(parsed.mode).toBe('sessions')
    expect(parsed).toMatchObject({ action: 'list' })
  })

  it('test_archive_delete_and_fork_carry_the_id', () => {
    for (const action of ['archive', 'delete', 'fork']) {
      expect(parseExecArgs(['sessions', action, 'tui-abc'], false)).toMatchObject({
        mode: 'sessions',
        action,
        target: 'tui-abc',
      })
    }
  })

  it('test_rename_carries_the_id_and_the_new_name', () => {
    expect(parseExecArgs(['sessions', 'rename', 'tui-abc', 'triage'], false)).toMatchObject({
      mode: 'sessions',
      action: 'rename',
      target: 'tui-abc',
      name: 'triage',
    })
  })

  it('test_an_action_that_names_a_session_refuses_without_one', () => {
    // Defaulting to "the current session" has no meaning headless, and guessing would make
    // `delete` destroy whichever transcript happened to be newest.
    for (const action of ['archive', 'delete', 'fork', 'rename']) {
      expect(parseExecArgs(['sessions', action], false)).toMatchObject({ mode: 'error' })
    }
  })

  it('test_rename_refuses_without_the_new_name', () => {
    expect(parseExecArgs(['sessions', 'rename', 'tui-abc'], false)).toMatchObject({ mode: 'error' })
  })

  it('test_gc_still_parses_as_before', () => {
    // The floor: adding actions must not disturb the one that existed.
    expect(parseExecArgs(['sessions', 'gc', '--apply'], false)).toMatchObject({
      mode: 'sessions',
      action: 'gc',
      apply: true,
    })
  })

  it('test_an_unknown_action_lists_the_valid_ones', () => {
    const parsed = parseExecArgs(['sessions', 'nope'], false)
    expect(parsed.mode).toBe('error')
    expect((parsed as { message: string }).message).toContain('delete')
  })
})
