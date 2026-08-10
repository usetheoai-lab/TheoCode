/**
 * B-071 — what is allowed to block me in this repository, answerable before the first turn.
 *
 * Hooks are wired at `chat.ts:428`, gated on a trusted directory, and B-055 established that one
 * can VETO a tool call. B-055 made the veto visible at the moment it fires; nothing made the
 * REGISTERED SET visible before it does. For a cloned repository that is the question worth asking
 * first, not after.
 *
 * Derived from the same three inputs the consent gate uses — effective config, approved store,
 * `classifyHooks` — rather than from a second read of the config file. A listing built its own way
 * becomes a second source of truth and drifts from what actually runs.
 */
export type HookTrust = 'trusted' | 'modified' | 'untrusted'

export interface HookEntry {
  readonly event: string
  readonly command: string
  readonly matcher?: string
  readonly status: HookTrust
}

export interface HookInventory {
  /**
   * True when the DIRECTORY is untrusted, in which case no repository hook enters the handler set
   * at all. Distinct from a hook that is merely unapproved: the remedies differ, so the listing
   * must not collapse them (`rules/cycle-discover.md` calls the same distinction out for MCP).
   */
  readonly suppressedByTrust: boolean
  readonly entries: readonly HookEntry[]
  /** Set when the `hooks` block could not be read — reported, never rendered as "no hooks". */
  readonly error?: string
}

export interface HookInventoryDeps {
  readonly directoryTrusted: boolean
  readonly classified: () => readonly {
    spec: { event: string; command: string; matcher?: string }
    status: HookTrust
  }[]
}

export function hookInventory(deps: HookInventoryDeps): HookInventory {
  let classified: ReturnType<HookInventoryDeps['classified']>
  try {
    classified = deps.classified()
  } catch (err) {
    // An unreadable hooks block means NO hook runs. Rendering that as "no hooks configured" is the
    // fail-open the consent gate was already fixed for (B-039); the listing must not reintroduce it.
    return {
      suppressedByTrust: !deps.directoryTrusted,
      entries: [],
      error: `the \`hooks\` block could not be read — ${(err as Error).message}`,
    }
  }
  return {
    suppressedByTrust: !deps.directoryTrusted,
    entries: classified.map((h) => ({
      event: h.spec.event,
      command: h.spec.command,
      ...(h.spec.matcher === undefined ? {} : { matcher: h.spec.matcher }),
      status: h.status,
    })),
  }
}

/** The inventory rendered for a panel. */
export function renderHookInventory(inv: HookInventory): string {
  if (inv.error !== undefined) return inv.error
  if (inv.entries.length === 0) {
    return inv.suppressedByTrust
      ? 'this directory is untrusted, so no repository hook is wired — and none is declared either'
      : 'no hooks declared for this directory'
  }
  const lines = inv.entries.map((h) => {
    const matcher = h.matcher === undefined ? '' : ` [${h.matcher}]`
    return `  ${h.event}${matcher}  ${h.status}\n      ${h.command}`
  })
  // The banner comes FIRST: a reader who skims the list must not conclude these hooks are running.
  const banner = inv.suppressedByTrust
    ? 'DIRECTORY UNTRUSTED — none of the hooks below is wired. They are declared, not active.\n\n'
    : ''
  return banner + lines.join('\n')
}
