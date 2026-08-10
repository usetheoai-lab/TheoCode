/**
 * B-071 — the registered hook set, visible before one fires.
 *
 * The distinction that carries the weight: a directory that is UNTRUSTED wires no repository hook
 * at all, which is not the same as a hook that is merely unapproved. Collapsing the two would send
 * a user to approve a hook that was never going to run.
 */
import { describe, expect, it } from 'vitest'

import { hookInventory, renderHookInventory } from './hook-inventory.js'

const hook = (event: string, command: string, status: 'trusted' | 'modified' | 'untrusted') => ({
  spec: { event, command },
  status,
})

describe('B-071 — hookInventory', () => {
  it('test_lists_each_hook_with_its_event_and_status', () => {
    const inv = hookInventory({
      directoryTrusted: true,
      classified: () => [hook('PreToolCall', './guard.sh', 'trusted')],
    })
    expect(inv.entries).toEqual([
      { event: 'PreToolCall', command: './guard.sh', status: 'trusted' },
    ])
    expect(inv.suppressedByTrust).toBe(false)
  })

  it('test_an_untrusted_directory_is_reported_as_suppressed_not_empty', () => {
    // The hooks are DECLARED and NOT wired. Showing them without saying so would tell the user they
    // are protected when nothing is running.
    const inv = hookInventory({
      directoryTrusted: false,
      classified: () => [hook('PreToolCall', './guard.sh', 'untrusted')],
    })
    expect(inv.suppressedByTrust).toBe(true)
    expect(inv.entries).toHaveLength(1)
    expect(renderHookInventory(inv)).toContain('DIRECTORY UNTRUSTED')
  })

  it('test_the_suppression_banner_comes_before_the_list', () => {
    // A reader who skims must not reach the hooks before the warning.
    const rendered = renderHookInventory(
      hookInventory({
        directoryTrusted: false,
        classified: () => [hook('PreToolCall', './guard.sh', 'untrusted')],
      }),
    )
    expect(rendered.indexOf('DIRECTORY UNTRUSTED')).toBeLessThan(rendered.indexOf('./guard.sh'))
  })

  it('test_an_unreadable_hooks_block_is_reported_not_rendered_as_none', () => {
    // B-039 fixed exactly this fail-open in the consent gate: a broken block means NO hook runs,
    // and calling that "no hooks configured" tells the user the opposite of the truth.
    const inv = hookInventory({
      directoryTrusted: true,
      classified: () => {
        throw new Error('expected an array')
      },
    })
    expect(inv.error).toContain('could not be read')
    expect(renderHookInventory(inv)).not.toContain('no hooks declared')
  })

  it('test_a_trusted_directory_with_no_hooks_says_so_plainly', () => {
    // Anti-vacuity floor: an implementation that always warned would pass the tests above.
    const rendered = renderHookInventory(
      hookInventory({ directoryTrusted: true, classified: () => [] }),
    )
    expect(rendered).toBe('no hooks declared for this directory')
  })
})
