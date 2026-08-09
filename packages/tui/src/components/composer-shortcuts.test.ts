/**
 * B-028 — the help panel does not advertise a shortcut this build has not wired.
 */
import { DEFAULT_COMPOSER_SHORTCUTS } from '@theokit/tui'
import { describe, expect, it } from 'vitest'

import { composerShortcuts } from './composer-shortcuts.js'

const keysOf = (list: readonly { keys: string }[]): string[] => list.map((s) => s.keys)

describe('B-028 — the help lists what this build wires', () => {
  it('test_the_shell_shortcut_is_hidden_when_it_is_not_wired', () => {
    expect(
      keysOf(composerShortcuts({ shell: false })),
      'the panel advertised `!` while ChatComposer had no onShellCommand, so `!npm test` went to ' +
        'the model as prose',
    ).not.toContain('!')
  })

  it('test_the_shell_shortcut_is_shown_once_it_is_wired', () => {
    // Anti-vacuity floor, and the contract for whoever closes B-056: the filter is keyed on the
    // capability, so wiring the handler restores the line with no edit here.
    expect(keysOf(composerShortcuts({ shell: true }))).toContain('!')
  })

  it('test_every_other_shortcut_survives', () => {
    // The panel must lose exactly one line, not become a curated subset nobody maintains.
    const hidden = keysOf(DEFAULT_COMPOSER_SHORTCUTS).filter(
      (k) => !keysOf(composerShortcuts({ shell: false })).includes(k),
    )
    expect(hidden).toEqual(['!'])
  })
})
