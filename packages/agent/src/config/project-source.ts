/**
 * B-008 — whether the `project` setting source may be enabled.
 *
 * The source is not scoped to one capability. The SDK states in its own typings that enabling
 * `"project"` turns on repository-declared hooks as well as subagent discovery, and a hook is
 * arbitrary command execution on every tool call.
 *
 * TheoCode's own hooks pass a second gate the SDK path does not: a per-hook sha256 fingerprint
 * (`hooks/hook-trust.ts`) whose purpose is catching a hook whose command changed after approval.
 * Gating the source on `subagents` alone therefore left a way to reach command execution that
 * skipped the fingerprint entirely — by declaring the hook where the SDK loads it.
 *
 * So the source requires every capability it enables. Adding one to that list is a deliberate act,
 * which is the point: the previous shape let the source grow new powers without the gate noticing.
 */
export function projectSourceAllowed(allows: {
  subagents: boolean
  hooks: boolean
}): boolean {
  return allows.subagents && allows.hooks
}
