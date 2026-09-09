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
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { DECLARED_FLOOR, compareToDeclared, evaluateFloor, readMeasured, resolveViaGate } from './check-coverage-floor.mjs'

describe('asking the gate what floor it resolves', () => {
  // These replace a suite that tested a JavaScript reimplementation of `resolve_threshold`. The
  // reimplementation is gone: two adversarial passes found character-class divergences between the
  // two parsers, each a way to lower the effective floor while the checker reported agreement.
  // Every case below is one of those, and each now runs BOTH implementations on the same bytes.
  const gateDir = resolve('.claude/skills/implement/scripts')

  function withThresholds(body) {
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-gate-'))
    mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(root, '.claude/rules/code-quality-thresholds.txt'), body)
    symlinkSync(gateDir, join(root, '.claude', 'skills-link'))
    mkdirSync(join(root, '.claude', 'skills', 'implement'), { recursive: true })
    symlinkSync(gateDir, join(root, '.claude/skills/implement/scripts'))
    return root
  }

  /** What the gate itself resolves — the fact under test, not a model of it. */
  function gateSays(root) {
    const out = execFileSync('python3', ['-c',
      `import json,sys;sys.path.insert(0,${JSON.stringify(gateDir)});from pathlib import Path;` +
      `import coverage_gate as g;v,s=g.resolve_threshold(Path(${JSON.stringify(root)})); print(json.dumps([v,s]))`,
    ], { encoding: 'utf8' })
    return JSON.parse(out)
  }

  it('test_it_reports_the_value_the_gate_reports', () => {
    const root = withThresholds('coverage.min_percent = 59.29\n')
    expect(resolveViaGate(root)).toEqual({ value: 59.29, source: 'project' })
    expect(gateSays(root)).toEqual([59.29, 'project'])
  })

  it('test_a_declaration_behind_a_bare_cr_is_seen_because_the_gate_sees_it', () => {
    // F-guard-10-r3. `split('\n')` missed this; `splitlines()` does not.
    const root = withThresholds('# note\rcoverage.min_percent = 5\ncoverage.min_percent = 59.29\n')
    expect(gateSays(root)).toEqual([5, 'project'])
    expect(resolveViaGate(root).value).toBe(5)
  })

  it('test_a_leading_unit_separator_is_seen_because_the_gate_sees_it', () => {
    // F-guard-16-r4. U+001F is Python whitespace, is NOT a splitlines() boundary, and is NOT JS
    // whitespace — so `trim()` left it attached to the key and the line was skipped. Effective
    // floor 0, reported as agreement.
    const root = withThresholds('\u001fcoverage.min_percent = 0\ncoverage.min_percent = 59.29\n')
    expect(gateSays(root)).toEqual([0, 'project'])
    expect(resolveViaGate(root).value).toBe(0)
  })

  it('test_underscored_digits_are_read_the_way_python_reads_them', () => {
    // F-guard-18-r4. `float('1_0')` is 10.0 and `Number('1_0')` is NaN, so the mirrored parser
    // rejected a declaration the gate accepts — and a test asserted that as correct behaviour.
    const root = withThresholds('coverage.min_percent = 1_0\n')
    expect(gateSays(root)).toEqual([10, 'project'])
    expect(resolveViaGate(root).value).toBe(10)
  })

  it('test_a_bom_is_reported_as_the_gate_falling_back_rather_than_as_agreement', () => {
    // F-guard-17-r4, the divergence in the other direction: the gate cannot read the key at all
    // and uses its own default, which is B-159's original symptom.
    const root = withThresholds('\ufeffcoverage.min_percent = 59.29\n')
    expect(gateSays(root)).toEqual([80, 'default'])
    expect(resolveViaGate(root)).toEqual({ value: 80, source: 'default' })
  })

  it('test_an_unavailable_python_is_an_error_and_never_an_agreement', () => {
    // A gate that cannot answer is not a gate that agreed.
    const root = withThresholds('coverage.min_percent = 59.29\n')
    expect(resolveViaGate(root, 'python3-that-does-not-exist').error).toBeDefined()
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
    // Through the gate, not through a model of it — the invariant is about the value that will
    // actually be enforced.
    expect(compareToDeclared(resolveViaGate(process.cwd()).value)).toEqual({ status: 'OK' })
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

  const GATE_DIR = resolve('.claude/skills/implement/scripts')

  /**
   * A scaffold the checker can actually interrogate.
   *
   * The gate module is linked in as well as the thresholds file: since the checker asks
   * `resolve_threshold` rather than reimplementing it, a root without the kit is a root where the
   * question cannot be answered — which the checker reports as an error, correctly, and which would
   * make every case below look like a failure for the wrong reason.
   */
  function linkGate(root, prefix) {
    mkdirSync(join(root, ...prefix, 'skills', 'implement'), { recursive: true })
    symlinkSync(GATE_DIR, join(root, ...prefix, 'skills', 'implement', 'scripts'))
  }

  function scaffold({ floor, pct }) {
    const root = mkdtempSync(join(tmpdir(), 'coverage-floor-'))
    if (floor !== undefined) {
      mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
      writeFileSync(join(root, '.claude/rules/code-quality-thresholds.txt'), `coverage.min_percent = ${floor}\n`)
    }
    linkGate(root, ['.claude'])
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
    linkGate(root, ['.claude'])
    // The gate cannot read this line either, so it falls back to its own default — which is not
    // agreement, and is the state B-159 exists to remove.
    const result = run(root)
    expect(result.code).toBe(1)
    expect(result.stdout).toContain("'default'")
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
    linkGate(root, [])
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
    linkGate(root, [])
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
    linkGate(root, [])
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
    linkGate(root, ['.claude'])
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
    linkGate(root, ['.claude'])
    const result = run(root)
    expect(result.code).toBe(1)
    expect(result.stdout).not.toContain('EISDIR')
  })
})
