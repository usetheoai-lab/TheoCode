/**
 * Phase 1.1 — three groups of keys, and the third one is why this file exists.
 *
 * `settings.json` replaces `config.toml`, and the filename is Claude Code's. So a real Claude Code
 * settings file will be pasted into it, and both schemas here are `.strict()`: without this, the
 * product refuses to start over `spinnerTipsEnabled`.
 *
 * The groups: ours (parsed), theirs (recognised, ignored, reported), neither (rejected). Dropping
 * the third would mean accepting anything, which teaches people a key is read when it is not — the
 * failure `#91` documents for rules and `#120` documents for pins.
 */
import { describe, expect, it } from 'vitest'

import { foreignKeysIn, withoutForeignKeys, FOREIGN_SETTINGS_KEYS } from './foreign-keys.js'

describe('Phase 1.1 — keys this product recognises and does not act on', () => {
  it('test_a_foreign_key_is_reported_not_silently_dropped', () => {
    // The whole point. A stripped key must still be nameable, or the operator cannot tell a setting
    // that is unsupported from one that is misspelt.
    expect(foreignKeysIn({ spinnerTipsEnabled: true, model: 'openai/x' })).toEqual([
      'spinnerTipsEnabled',
    ])
  })

  it('test_ours_survive_the_strip_and_theirs_do_not', () => {
    expect(
      withoutForeignKeys({ model: 'openai/x', sandbox_mode: 'read-only', spinnerVerbs: ['a'] }),
    ).toEqual({ model: 'openai/x', sandbox_mode: 'read-only' })
  })

  it('test_a_typo_of_OUR_key_is_neither_group_so_the_schema_still_rejects_it', () => {
    // The arm that killed the heuristic. "camelCase is theirs, snake_case is ours" would classify
    // `sandboxMode` as foreign and ignore it silently — the exact defect strictness prevents.
    // An explicit list leaves it in neither group, so it reaches `.strict()` and throws naming itself.
    expect(FOREIGN_SETTINGS_KEYS.has('sandboxMode')).toBe(false)
    expect(withoutForeignKeys({ sandboxMode: 'read-only' })).toEqual({ sandboxMode: 'read-only' })
  })

  it('test_no_key_of_ours_was_put_on_the_foreign_list', () => {
    // Anti-vacuity, and the direction that would be worst: a key of ours on this list is a setting
    // silently stripped before the parser ever sees it, so it would read as accepted and do nothing.
    for (const ours of [
      'model', 'reasoning_effort', 'sandbox_mode', 'approval_policy', 'goal_oracle', 'skills',
      'hooks', 'memory', 'home_dir', 'shell_timeout_ms', 'session_gc', 'context_window',
      'profile', 'profiles',
    ]) {
      expect(FOREIGN_SETTINGS_KEYS.has(ours), `"${ours}" is ours and is on the foreign list`).toBe(false)
    }
  })

  it('test_hostile_input_is_skipped_rather_than_thrown_on', () => {
    // The file crosses from disk and may be anything a text editor can produce.
    expect(foreignKeysIn(null)).toEqual([])
    expect(foreignKeysIn('not an object')).toEqual([])
    expect(withoutForeignKeys(null)).toBe(null)
  })
})
