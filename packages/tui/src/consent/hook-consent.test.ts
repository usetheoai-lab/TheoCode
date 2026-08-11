/**
 * B-039 — a malformed hooks config does not silently disable the consent gate.
 *
 * `computePendingHooks` swallowed `HookError` — the error a malformed `hooks` block raises — and
 * returned an empty list. An empty list means "nothing pending", so the gate closes and the user is
 * never asked. The config they wrote is broken, no hook will ever run, and the terminal says
 * nothing: fail-open on the surface that governs `spawn(cmd, { shell: true })`.
 *
 * The `name !== 'HookError'` guard was there so a config mistake would not be reported as an
 * internal error. That distinction is worth keeping — it is the REPORTING that was missing, not
 * the classification.
 */
import { describe, expect, it, vi } from 'vitest'

import { computePendingHooks } from './hook-consent.js'

function deps(over: Partial<Parameters<typeof computePendingHooks>[0]> = {}) {
  return {
    cwd: '/proj',
    declined: new Set<string>(),
    resolveEffectiveConfig: () => ({ hooks: [] }),
    parseHooks: (() => []) as never,
    loadApprovedHooks: (() => new Map()) as never,
    classifyHooks: (() => []) as never,
    onError: vi.fn(),
    ...over,
  } as Parameters<typeof computePendingHooks>[0]
}

describe('B-039 — a broken hooks config is reported, not swallowed', () => {
  it('test_a_well_formed_config_reports_nothing', () => {
    // Anti-vacuity floor: reporting always would satisfy the assertion below.
    const onError = vi.fn()
    expect(computePendingHooks(deps({ onError }))).toEqual([])
    expect(onError).not.toHaveBeenCalled()
  })

  it('test_a_malformed_hooks_config_is_reported', () => {
    const onError = vi.fn()
    const boom = Object.assign(new Error('hooks[0].command: expected string'), {
      name: 'HookError',
    })

    const pending = computePendingHooks(
      deps({
        onError,
        parseHooks: (() => {
          throw boom
        }) as never,
      }),
    )

    expect(pending, 'a broken config must not look like "nothing pending"').toEqual([])
    expect(
      onError,
      'a malformed hooks config disabled the consent gate with no diagnostic at all',
    ).toHaveBeenCalled()
  })

  it('test_an_internal_failure_is_still_reported', () => {
    const onError = vi.fn()
    computePendingHooks(
      deps({
        onError,
        loadApprovedHooks: (() => {
          throw new Error('store unreadable')
        }) as never,
      }),
    )

    expect(onError).toHaveBeenCalled()
  })
})
