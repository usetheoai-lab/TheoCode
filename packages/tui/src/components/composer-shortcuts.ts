import { DEFAULT_COMPOSER_SHORTCUTS, type KeyboardShortcut } from '@theokit/tui'

/**
 * B-028 — the help panel lists what THIS build wires, not what the toolkit can do.
 *
 * `DEFAULT_COMPOSER_SHORTCUTS` is a static list in `@theokit/tui`: it advertises `!` = "Run a shell
 * command" unconditionally, while `ChatComposer` gates the feature on an `onShellCommand` prop this
 * app does not pass. So the panel told the user `!npm test` runs a command, and it was sent to the
 * model as prose.
 *
 * Wiring the handler is NOT a wiring task and was deliberately not done here: the TUI has no shell
 * execution path of its own — `run_shell` in this package is a RENDERER for the agent's tool calls —
 * so a composer-driven shell run would bypass the approval gate, the sandbox scope and the hook veto
 * that every agent-issued command passes through. That is a product decision about confinement, and
 * B-056 carries it.
 *
 * Until then the honest move is to stop advertising it. The filter is keyed on capability rather
 * than on the literal `!`, so the next unwired shortcut cannot be advertised either.
 */
export interface ComposerCapabilities {
  /** Whether `onShellCommand` is passed to `ChatComposer`. */
  readonly shell: boolean
}

const KEYS_REQUIRING = new Map<string, keyof ComposerCapabilities>([['!', 'shell']])

export function composerShortcuts(caps: ComposerCapabilities): readonly KeyboardShortcut[] {
  return DEFAULT_COMPOSER_SHORTCUTS.filter((s) => {
    const needs = KEYS_REQUIRING.get(s.keys)
    return needs === undefined || caps[needs]
  })
}
