/**
 * Tests for the coverage-floor guard.
 *
 * B-159 declared `coverage.min_percent` at exactly the measured total, and the 2026-09-09 review
 * found the same gap from four independent directions: nothing re-checks the number the gate
 * discriminates against. The failure modes are ASYMMETRIC, which is the whole reason this guard
 * exists — a trailing comment on the value fails loudly (`float()` raises, the floor reverts to 80,
 * `/implement` FAILs), but editing the number DOWNWARD fails silently, and because `.claude/` is
 * gitignored it appears in no diff, no review and no CI.
 *
 * Every arm below has its positive control beside it. A test proving a malformed line is caught
 * passes against a parser that rejects everything.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DECLARED_FLOOR, compareToDeclared, evaluateFloor, parseFloor, readMeasured } from './check-coverage-floor.mjs'

describe('parsing the declared floor', () => {
  it('test_a_bare_declaration_parses', () => {
    expect(parseFloor('coverage.min_percent = 59.29\n')).toEqual({ value: 59.29 })
  })

  it('test_comment_lines_above_the_key_do_not_hide_it', () => {
    // The positive control for the arm below: the reasoning genuinely lives on `#` lines, and a
    // parser that choked on them would report every real declaration as absent.
    const text = '# B-159. A ratchet, not a target.\n# Keep this line bare.\ncoverage.min_percent = 59.29\n'
    expect(parseFloor(text)).toEqual({ value: 59.29 })
  })

  it('test_a_trailing_comment_on_the_value_is_reported_not_ignored', () => {
    // `coverage_gate.py` does float() on everything right of the `=`, raises, hits `continue`, and
    // silently returns (80, 'default'). Measured in a /tmp scaffold on 2026-09-09.
    const result = parseFloor('coverage.min_percent = 59.29  # ratchet\n')
    expect(result.value).toBeUndefined()
    // The message says "not a number" rather than "trailing text": F-guard-4 measured that the
    // old wording asserted a shape that does not describe `.59` or `1e2`, and a consequence
    // (falling back to 80) that does not happen when a later line declares the key.
    expect(result.error).toMatch(/not a number/i)
    expect(result.error).toContain('59.29  # ratchet')
  })

  it('test_an_absent_declaration_is_distinguished_from_a_malformed_one', () => {
    // Different remedies: one is "declare it", the other is "the line you wrote does not work".
    expect(parseFloor('# coverage.min_percent = 80\n').error).toMatch(/no .*declaration/i)
    expect(parseFloor('coverage.min_percent = oops\n').error).toMatch(/not a number/i)
  })

  it('test_it_accepts_every_form_the_python_gate_accepts', () => {
    // F-guard-4. `resolve_threshold` uses float(), which takes all of these. Rejecting a line the
    // gate reads fine would redden the lint chain over a working configuration.
    for (const [text, expected] of [['59.', 59], ['.59', 0.59], ['1e2', 100], ['+59', 59], ['59', 59]]) {
      expect(parseFloor(`coverage.min_percent = ${text}\n`)).toEqual({ value: expected })
    }
  })

  it('test_a_malformed_line_followed_by_a_valid_one_resolves_to_the_valid_one', () => {
    // The gate catches ValueError and keeps scanning, so this file is readable and must not fail.
    const text = 'coverage.min_percent = oops\ncoverage.min_percent = 59.29\n'
    expect(parseFloor(text)).toEqual({ value: 59.29 })
  })

  it('test_it_splits_lines_the_way_the_python_gate_splits_them', () => {
    // F-guard-10-r3, the hole this checker existed to close and did not. Python's splitlines()
    // breaks on all of these; split('\n') breaks on none. A declaration hidden behind one is
    // authoritative for the gate and was invisible here — measured: effective floor 5 reported as
    // agreement at 59.29, with no versioned file touched.
    for (const sep of ['\r', '\v', '\f', '\x1c', '\x1d', '\x1e', '\u0085', '\u2028', '\u2029']) {
      expect(parseFloor(`# note${sep}coverage.min_percent = 5\n`)).toEqual({ value: 5 })
    }
  })

  it('test_a_comment_without_a_hidden_break_is_still_just_a_comment', () => {
    // Positive control for the arm above: a parser that split on every space would also pass it.
    expect(parseFloor('# note coverage.min_percent = 5\n').value).toBeUndefined()
  })

  it('test_it_rejects_numeric_forms_the_python_gate_rejects', () => {
    // F-guard-14-r3. Number() takes these; float() does not, so accepting them would make the
    // checker announce LOWERED while the gate had fallen back to 80.
    for (const text of ['0x3B', '0b111011', '1_0']) {
      expect(parseFloor(`coverage.min_percent = ${text}\n`).value).toBeUndefined()
    }
  })

  it('test_it_rejects_nan_even_though_the_gate_accepts_it', () => {
    // The one deliberate divergence: `percent >= nan` is False for every coverage, so a floor of
    // nan makes the gate fail everything. Refusing it here protects the gate rather than mirroring
    // it, and this test exists so the divergence is a decision rather than a bug.
    expect(parseFloor('coverage.min_percent = nan\n').value).toBeUndefined()
  })

  it('test_an_empty_value_is_not_read_as_zero', () => {
    // Number('') is 0 in JavaScript and a ValueError in Python. A floor of 0 passes everything.
    expect(parseFloor('coverage.min_percent =\n').value).toBeUndefined()
  })

  it('test_the_commented_out_default_is_not_read_as_a_declaration', () => {
    expect(parseFloor('# coverage.min_percent = 80\n').value).toBeUndefined()
  })
})

describe('evaluating the floor against the tree', () => {
  it('test_a_floor_matching_the_total_is_the_intended_state', () => {
    expect(evaluateFloor({ floor: 59.29, measured: 59.29, tolerance: 1 }).status).toBe('OK')
  })

  it('test_a_floor_above_the_measured_total_fails', () => {
    // The R4 shape: declared against a tree that no longer exists, or a coverage-tool bump (R5).
    const result = evaluateFloor({ floor: 60, measured: 59.29, tolerance: 1 })
    expect(result.status).toBe('FAIL')
    expect(result.message).toMatch(/above/i)
  })

  it('test_slack_beyond_tolerance_asks_for_a_redeclaration', () => {
    // F-wire-4 / F-dom-5: the ratchet decaying by drift rather than by decision.
    const result = evaluateFloor({ floor: 59.29, measured: 62, tolerance: 1 })
    expect(result.status).toBe('FAIL')
    expect(result.message).toContain('62')
  })

  it('test_a_small_gain_does_not_redden_the_lint_chain', () => {
    // The tolerance is NOT slack in the floor — `coverage_gate.py` still compares `>=` exactly. It
    // is the width of the window before this checker asks for a re-declaration. Zero here would
    // redden lint on every coverage-improving commit, and a gate people bypass is the failure this
    // ecosystem exists to prevent.
    expect(evaluateFloor({ floor: 59.29, measured: 59.6, tolerance: 1 }).status).toBe('OK')
  })

  it('test_the_default_tolerance_is_the_one_that_runs', () => {
    // F-guard-2: every other call passes `tolerance: 1` explicitly, so mutating the default
    // survived the whole suite. This is the only call that omits it.
    expect(evaluateFloor({ floor: 59.29, measured: 61.5 }).status).toBe('FAIL')
    expect(evaluateFloor({ floor: 59.29, measured: 60.2 }).status).toBe('OK')
  })

  it('test_a_missing_measurement_is_not_an_answer_either_way', () => {
    // A report the checker could not read must never read as agreement.
    const result = evaluateFloor({ floor: 59.29, measured: null, tolerance: 1 })
    expect(result.status).toBe('UNMEASURED')
  })
})

describe('reading the measured total', () => {
  it('test_it_reads_the_same_field_the_python_gate_parses', () => {
    // EC-2: `_from_json_summary` reads total.lines.pct, already rounded. Recomputing from
    // covered/total gives 59.2963… and would fail against the 59.29 the gate compares.
    const report = JSON.stringify({ total: { lines: { total: 4491, covered: 2663, pct: 59.29 } } })
    expect(readMeasured(report)).toBe(59.29)
  })

  it('test_an_unparseable_report_yields_null_rather_than_a_number', () => {
    expect(readMeasured('not json')).toBeNull()
    expect(readMeasured('{}')).toBeNull()
  })
})

describe('the record in vitest.config.ts', () => {
  // F-wire-3 — T1.2's two assertions were one-shot DoD greps that nothing re-runs. B-063's comment
  // block is where a developer looks before changing coverage settings, so a stale claim there is
  // the "two records, one of them stale" failure ADR-2 exists to prevent.
  const config = readFileSync('vitest.config.ts', 'utf8')

  it('test_it_no_longer_claims_no_threshold_exists', () => {
    expect(config).not.toContain('NO THRESHOLD IS SET HERE')
  })

  it('test_it_names_where_the_floor_actually_lives', () => {
    expect(config).toContain('code-quality-thresholds.txt')
    expect(config).toContain('DECLARED_FLOOR')
  })

  it('test_it_keeps_the_measurement_it_is_a_record_of', () => {
    // Positive control: the two arms above pass against a comment that deleted B-063 entirely,
    // which would destroy the record rather than update it.
    expect(config).toContain('2026-08-20')
  })

  it('test_it_states_that_the_floor_does_not_reach_a_clone', () => {
    // F-wire-1: the qualification landed in the CHANGELOG first and not here, which is the half
    // the finding argued matters.
    expect(config).toMatch(/gitignored/)
  })
})

describe('wiring', () => {
  it('test_the_lint_script_invokes_the_coverage_floor_checker', () => {
    // Pillar (a). Removing the invocation reddens the suite instead of going unnoticed.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts.lint).toContain('check-coverage-floor.mjs')
  })
})

describe('the tracked declaration', () => {
  const THRESHOLD_PATHS = ['rules/code-quality-thresholds.txt', '.claude/rules/code-quality-thresholds.txt']
  const onDisk = THRESHOLD_PATHS.find((p) => { try { readFileSync(p); return true } catch { return false } })

  it('test_the_tracked_floor_is_a_usable_number', () => {
    // Runs everywhere, including CI where the gitignored file is absent. F-guard-13-r3: the first
    // version of the test below `return`ed there, which vitest reports as a PASS — so
    // `DECLARED_FLOOR = 40` survived the entire suite in every fresh clone.
    expect(Number.isFinite(DECLARED_FLOOR)).toBe(true)
    expect(DECLARED_FLOOR).toBeGreaterThan(0)
    expect(DECLARED_FLOOR).toBeLessThanOrEqual(100)
  })

  it.skipIf(onDisk === undefined)('test_the_two_declarations_of_the_floor_agree_in_this_repository', () => {
    // The invariant itself, on the real files. `skipIf` rather than an early return, so where the
    // gitignored file is absent this reports SKIPPED instead of green.
    expect(compareToDeclared(parseFloor(readFileSync(onDisk, 'utf8')).value)).toEqual({ status: 'OK' })
  })

  it('test_a_downward_edit_of_the_gitignored_value_fails_at_any_magnitude', () => {
    // F-tests-1-r2 / F-guard-1: this is the arm the first version did not have. It needs no
    // coverage report, so it runs on every `pnpm lint` — which is the whole reason it exists.
    const result = compareToDeclared(59.28, 59.29)
    expect(result.status).toBe('FAIL')
    expect(result.message).toContain('LOWERED')
  })

  it('test_a_raise_in_one_file_only_also_fails', () => {
    // Positive control for the arm above: it must catch disagreement, not just lowering.
    expect(compareToDeclared(70, 59.29).status).toBe('FAIL')
  })

  it('test_agreement_passes', () => {
    expect(compareToDeclared(59.29, 59.29).status).toBe('OK')
  })
})

describe('the CLI contract', () => {
  // F-guard-2 — the exit code IS the deliverable, and nothing exercised it. Every mutant below
  // survived the first version: flipping `return 1` to `return 0`, pointing the paths anywhere,
  // and changing the TOLERANCE default (which no unit test reached, because all six callers passed
  // `tolerance: 1` explicitly).
  const CLI = new URL('./check-coverage-floor.mjs', import.meta.url).pathname

  function scaffold({ floor, pct }) {
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    if (floor !== undefined) {
      mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
      writeFileSync(join(root, '.claude/rules/code-quality-thresholds.txt'), `coverage.min_percent = ${floor}\n`)
    }
    if (pct !== undefined) {
      mkdirSync(join(root, 'coverage'), { recursive: true })
      writeFileSync(join(root, 'coverage/coverage-summary.json'), JSON.stringify({ total: { lines: { pct } } }))
    }
    return root
  }

  function run(root) {
    try {
      const stdout = execFileSync('node', [CLI], { env: { ...process.env, COVERAGE_FLOOR_ROOT: root }, encoding: 'utf8' })
      return { code: 0, stdout }
    } catch (error) {
      return { code: error.status, stdout: `${error.stdout ?? ''}` }
    }
  }

  it('test_agreement_exits_zero', () => {
    expect(run(scaffold({ floor: DECLARED_FLOOR, pct: DECLARED_FLOOR })).code).toBe(0)
  })

  it('test_a_downward_edit_exits_nonzero_with_no_coverage_report_present', () => {
    // The measured case is covered above; this is the one that failed before, because every
    // `pnpm lint` runs without a report and the old checker exited 0.
    const result = run(scaffold({ floor: DECLARED_FLOOR - 0.01 }))
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('LOWERED')
  })

  it('test_a_trailing_comment_exits_nonzero', () => {
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(root, '.claude/rules/code-quality-thresholds.txt'), 'coverage.min_percent = 59.29  # ratchet\n')
    expect(run(root).code).toBe(1)
  })

  it('test_slack_beyond_the_default_tolerance_exits_nonzero', () => {
    // Exercises TOLERANCE's DEFAULT, which no unit test reaches.
    expect(run(scaffold({ floor: DECLARED_FLOOR, pct: DECLARED_FLOOR + 5 })).code).toBe(1)
  })

  it('test_a_gain_within_the_default_tolerance_exits_zero', () => {
    // Positive control for the arm above — without it, a checker that always failed would pass it.
    expect(run(scaffold({ floor: DECLARED_FLOOR, pct: DECLARED_FLOOR + 0.5 })).code).toBe(0)
  })

  it('test_an_absent_thresholds_file_skips_loudly_and_exits_zero', () => {
    const result = run(mkdtempSync(join(tmpdir(), 'coverage-floor-')))
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('SKIPPED')
  })

  it('test_the_skip_message_does_not_assert_a_reason_it_did_not_observe', () => {
    // F-guard-3: the old message said "gitignored, so this is expected in CI" — a claim about WHY
    // the file was missing, made without looking, and false in the kit's standalone layout where
    // `rules/` sits at the root and a different floor is in force.
    expect(run(mkdtempSync(join(tmpdir(), 'coverage-floor-'))).stdout).not.toMatch(/expected in CI/)
  })

  it('test_it_reads_the_standalone_layout_the_python_gate_tries_first', () => {
    // F-guard-3. `coverage_gate.py::_THRESHOLD_FILES` tries `rules/` before `.claude/rules/`.
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    mkdirSync(join(root, 'rules'), { recursive: true })
    writeFileSync(join(root, 'rules/code-quality-thresholds.txt'), 'coverage.min_percent = 5\n')
    const result = run(root)
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('says 5%')
  })

  it('test_the_standalone_layout_wins_over_the_plugin_one', () => {
    // F-guard-12-r3: with only one file present, reversing FLOOR_PATHS kept the suite green — the
    // precedence was pinned by nothing. Both present, disagreeing, is the case that pins it.
    // `toContain('5')` also matched "59.29", so the assertion above is now on 'says 5%'.
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    mkdirSync(join(root, 'rules'), { recursive: true })
    mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(root, 'rules/code-quality-thresholds.txt'), 'coverage.min_percent = 5\n')
    writeFileSync(join(root, '.claude/rules/code-quality-thresholds.txt'), `coverage.min_percent = ${DECLARED_FLOOR}\n`)
    const result = run(root)
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('says 5%')
  })

  it('test_it_falls_through_to_the_next_file_when_the_first_declares_nothing', () => {
    // F-guard-11-r3: the gate stops at the first file that yields a VALUE, not the first that
    // exists. Stopping earlier reported "the gate will use its default of 80" about a
    // configuration the gate reads correctly.
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    mkdirSync(join(root, 'rules'), { recursive: true })
    mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(root, 'rules/code-quality-thresholds.txt'), '# nothing declared here\n')
    writeFileSync(join(root, '.claude/rules/code-quality-thresholds.txt'), `coverage.min_percent = ${DECLARED_FLOOR}\n`)
    expect(run(root).code).toBe(0)
  })

  it('test_a_declaration_hidden_behind_a_bare_cr_is_caught_end_to_end', () => {
    // F-guard-10-r3 through the real binary, not just the parser. This is the shape that reported
    // agreement at 59.29 while the gate resolved 5.
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
    writeFileSync(
      join(root, '.claude/rules/code-quality-thresholds.txt'),
      `# ratchet note\rcoverage.min_percent = 5\ncoverage.min_percent = ${DECLARED_FLOOR}\n`,
    )
    const result = run(root)
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('says 5%')
  })

  it('test_an_unmeasured_run_exits_zero', () => {
    // F-guard-2: the only exit-code mapping with no test, and the one that runs on every real
    // `pnpm lint` — the report is gitignored and no lint step produces one.
    const result = run(scaffold({ floor: DECLARED_FLOOR }))
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('NOT verified')
  })

  it('test_an_unreadable_thresholds_path_does_not_crash_the_lint_chain', () => {
    // A directory where the file should be: EISDIR. The first version let it throw a raw stack
    // trace out of `pnpm lint`.
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    mkdirSync(join(root, '.claude/rules/code-quality-thresholds.txt'), { recursive: true })
    const result = run(root)
    expect(result.code).toBe(1)
    expect(result.stdout).not.toContain('EISDIR')
  })
})
