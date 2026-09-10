/**
 * Tests for the typed-error-assertion guard.
 *
 * The guard sits in the `npm run lint` chain and had none — measured 2026-09-10. It is the sharpest
 * instance of the class, because this checker's whole job is to catch a test that reports green
 * while guarding nothing, and it was itself a gate that could have been reporting green while
 * inspecting nothing. A checker that mis-globs, throws early, or matches no line still exits 0, and
 * a green build is read as evidence.
 *
 * The first two tests are the poles: a line that MUST be flagged, and one that MUST NOT. Without
 * the second, a regex broadened until it matches everything still passes; without the first, a
 * regex narrowed into a no-op does. Both failures have happened in this repository's guards before
 * — the English-only one reported clean over 144 identifiers — which is why the anti-vacuity floor
 * is a convention here rather than a nicety.
 */
import { describe, expect, it } from 'vitest'

import { isBareThrowAssertion } from './check-typed-error-assertions.mjs'

describe('isBareThrowAssertion', () => {
  it('test_a_bare_toThrow_is_flagged', () => {
    // The measured case: config/memory-default.test.ts asserted that a non-boolean is rejected
    // and would have kept passing if the rejection decayed into a TypeError.
    expect(isBareThrowAssertion('expect(() => load(cfg)).toThrow()')).toBe(true)
  })

  it('test_a_typed_assertion_is_not_flagged', () => {
    // Anti-vacuity floor. A guard that flags every `toThrow` passes the test above and makes the
    // correct form impossible to write.
    for (const line of [
      'expect(() => load(cfg)).toThrow(ConfigError)',
      "expect(() => load(cfg)).toThrow(/must be a boolean/)",
      'await expect(run()).rejects.toThrow(TurnError)',
    ]) {
      expect(isBareThrowAssertion(line), line).toBe(false)
    }
  })

  it('test_bare_toThrowError_is_flagged_too', () => {
    expect(isBareThrowAssertion('expect(fn).toThrowError()')).toBe(true)
  })

  it('test_rejects_toThrow_is_flagged', () => {
    expect(isBareThrowAssertion('await expect(p).rejects.toThrow()')).toBe(true)
  })

  it('test_not_toThrow_is_never_flagged', () => {
    // Documented in the guard's header: there is no error to name when the assertion is that none
    // arrives. Flagging it would demand a type for a thing that does not exist.
    expect(isBareThrowAssertion('expect(() => ok()).not.toThrow()')).toBe(false)
  })

  it('test_a_line_that_only_talks_about_the_bare_form_is_not_an_assertion', () => {
    // This guard's own prose, and any comment explaining why an assertion was tightened, contain
    // the literal it looks for. Flagging them makes the check fire on the documentation of its
    // own rule — the false positive that gets a guard deleted.
    for (const line of [
      '// a bare toThrow() is satisfied by any throw',
      ' * `expect(fn).toThrow()` is satisfied by ANY throw',
    ]) {
      expect(isBareThrowAssertion(line), line).toBe(false)
    }
  })

  it('test_whitespace_inside_the_call_does_not_hide_it', () => {
    // `toThrow( )` is the same assertion. A guard that can be evaded by a space is one that
    // reports clean while the contract it protects is gone.
    expect(isBareThrowAssertion('expect(fn).toThrow(  )')).toBe(true)
  })
})
