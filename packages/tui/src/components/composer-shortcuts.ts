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
 * cannot be advertised THROUGH THE SHORTCUT LIST either.
 *
 * B-067 — that last clause originally read "the next unwired shortcut cannot be advertised
 * either", which claimed a scope this filter never had. It reads `DEFAULT_COMPOSER_SHORTCUTS`, and
 * that is the only source it can see. The toolkit advertises affordances through a SECOND channel —
 * `StatusFooter`'s `hint` default — and `← for agents` reached the user through it while this
 * filter was green. `footerHint()` below closes that channel; the correction is recorded here
 * rather than in a commit message because the over-broad sentence is what made the second channel
 * look already covered.
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

/** B-067 — what the status footer is allowed to advertise in THIS build. */
export interface FooterCapabilities {
  /** Whether pressing `?` does anything right now (B-046). */
  readonly shortcuts: boolean
  /** Whether `←` opens an agents panel. Not built — B-072 carries the capability. */
  readonly agents: boolean
}

/** Affordance text in the order the footer reads it, each gated on the capability it names. */
const FOOTER_AFFORDANCES: readonly (readonly [keyof FooterCapabilities, string])[] = [
  ['shortcuts', '? for shortcuts'],
  ['agents', '← for agents'],
]

/**
 * The footer hint for this build, filtered by capability.
 *
 * ALWAYS returns a string, never `undefined`. That is the whole point: `StatusFooter` declares
 * `hint = DEFAULT_HINT` as a default parameter, so `undefined` does not mean "say nothing" — it
 * means "say everything the toolkit can do", which is how `← for agents` was advertised by an app
 * that has no agents panel. An empty string is the honest empty hint.
 */
export function footerHint(caps: FooterCapabilities): string {
  return FOOTER_AFFORDANCES.filter(([cap]) => caps[cap])
    .map(([, text]) => text)
    .join(' · ')
}
