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
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { evaluateFloor, parseFloor, readMeasured } from './check-coverage-floor.mjs'

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
    expect(result.error).toMatch(/trailing/i)
  })

  it('test_an_absent_declaration_is_distinguished_from_a_malformed_one', () => {
    // Different remedies: one is "declare it", the other is "the line you wrote does not work".
    expect(parseFloor('# coverage.min_percent = 80\n').error).toMatch(/no .*declaration/i)
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

describe('wiring', () => {
  it('test_the_lint_script_invokes_the_coverage_floor_checker', () => {
    // Pillar (a). Removing the invocation reddens the suite instead of going unnoticed.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts.lint).toContain('check-coverage-floor.mjs')
  })
})
