/**
 * #91 — `/status` says whether the rules in the prompt are the rules on disk.
 *
 * The row exists for the reason the `agents.md` row beside it does, stated in its own comment:
 * *"the case that matters is the silent one"*. A truncated rules block is silent by construction —
 * the agent answers normally, having never seen three quarters of what the repository wrote for it.
 *
 * Measured on this product's own checkout at v0.7.0: 248,669 chars against a 64,000 ceiling.
 */
import { describe, expect, it } from 'vitest'

import { rulesRow } from './command-content.js'

describe('#91 — the rules row', () => {
  it('test_a_complete_load_says_so_without_arithmetic', () => {
    // Positive control, and a deliberate shape choice: the common case must not read like a warning.
    // A row that always printed "12 of 12 · 4,000 chars" would train people to skip it.
    expect(rulesRow({ count: 12, read: 12, chars: 4_000, kept: 4_000, truncated: false })).toBe('12 loaded')
  })

  it('test_a_truncated_load_names_both_halves_and_the_proportion', () => {
    // The defect, as a line. Both halves, because 12 means nothing without the 40 it is out of, and
    // the percentage because 64,000 of 248,669 is arithmetic nobody does at a glance.
    const row = rulesRow({ count: 12, read: 40, chars: 248_669, kept: 64_000, truncated: true })

    expect(row).toContain('12 of 40')
    expect(row).toContain('74% dropped')
  })

  it('test_no_record_yet_is_not_reported_as_no_rules', () => {
    // The distinction the `agents.md` row already draws with its `on disk — not loaded yet`. An
    // absent record means nobody has built an agent; printing `<none>` would answer a question that
    // was not asked, in the direction that reads as reassuring.
    expect(rulesRow(undefined)).toBe('<not loaded yet>')
  })

  it('test_a_project_with_no_rules_at_all_says_none', () => {
    // Anti-vacuity for the arm above: `<not loaded yet>` hard-coded would satisfy it.
    expect(rulesRow({ count: 0, read: 0, chars: 0, kept: 0, truncated: false })).toBe('<none>')
  })
})
