/**
 * Tests for the config-discoverability guard.
 *
 * A key an operator can set in `config.toml` and cannot find in the README is a knob that exists and
 * cannot be discovered. Measured 2026-09-03: `context_window` and `goal_oracle` were in that state,
 * found by cross-checking the schema against the documented list rather than by reading either.
 *
 * This gate exists and its sibling — "every shipped backlog item appears in the CHANGELOG" — does
 * not, and the difference is the measurement. That invariant had 20 legitimate exceptions in 147
 * items, so mechanising it would have enforced an anti-pattern. This one has zero.
 */
import { describe, expect, it } from 'vitest'

import { schemaKeys, undocumentedKeys } from './check-config-documented.mjs'

describe('config discoverability', () => {
  it('test_it_reads_the_keys_out_of_the_schema_source', () => {
    expect(schemaKeys("const CONFIG_SCHEMA_KEYS = ['model', 'memory'] as const")).toEqual([
      'model',
      'memory',
    ])
  })

  it('test_a_key_absent_from_the_readme_is_reported', () => {
    expect(undocumentedKeys(['model', 'goal_oracle'], 'we support `model` only')).toEqual([
      'goal_oracle',
    ])
  })

  it('test_a_key_written_as_a_toml_table_header_counts_as_documented', () => {
    // `hooks` is documented as `[[hooks]]`, which is how an operator actually writes it. A guard
    // that missed this would report a false positive on the one key whose documented form differs.
    expect(undocumentedKeys(['hooks'], 'add `[[hooks]]` to your config')).toEqual([])
  })

  it('test_a_fully_documented_schema_reports_nothing', () => {
    // Anti-vacuity: a guard that flags everything would satisfy the assertion above it.
    expect(undocumentedKeys(['model'], 'set `model` in the file')).toEqual([])
  })

  it('test_it_does_not_report_a_key_it_could_not_find_in_the_schema', () => {
    // The other anti-vacuity floor: an empty key list must not read as a clean bill of health for
    // the caller, so the parser is asserted separately above and this pins the empty case.
    expect(schemaKeys('no schema here')).toEqual([])
  })
})
