import { DEFAULT_COMPOSER_SHORTCUTS, type KeyboardShortcut } from '@theokit/tui'

/**
 * B-028 — the help panel lists what THIS build wires, not what the toolkit can do.
 *
 * `DEFAULT_COMPOSER_SHORTCUTS` is a static list in `@theokit/tui`: it advertises `!` = "Run a shell
 * command" unconditionally, while `ChatComposer` gates the feature on an `onShellCommand` prop this
 * app does not pass. So the panel told the user `!npm test` runs a command, and it was sent to the
 * model as prose.
 *
 * Wiring the handler is NOT a wiring task: the TUI has no shell execution path of its own —
 * `run_shell` in this package is a RENDERER for the agent's tool calls — and a `!cmd` has no turn,
 * so the approval ledger has nothing to key on. Wiring it means building a SECOND approval path
 * beside the first, which is the shape B-019 and B-021 were.
 *
 * DECIDED in `docs/adr/0001-shell-shortcut-confinement.md` (B-056): the shortcut
 * stays unwired. That ADR also carries the escape hatch — `composerShortcuts({ shell: true })`
 * restores the help line with no edit here, once the handler reaches the same scope and the same
 * approval ledger as an agent-issued `run_shell`.
 *
 * The filter is keyed on capability rather than on the literal `!`, so the next unwired shortcut
 * cannot be advertised either.
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
