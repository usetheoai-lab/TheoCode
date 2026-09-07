/**
 * Fire `SessionStart`, once, when the TUI starts a session.
 *
 * The same composition the CLI does (`cli/src/runtime/session-start.ts`), and the duplication is
 * deliberate rather than a shared helper: the two surfaces resolve their working directory
 * differently — the TUI through its single seam (B-057), the CLI through `process.cwd()` — and a
 * shared function would have to take the directory as an argument, which is the whole content of
 * this file. What is NOT duplicated is the decision about which gates apply: that lives in
 * `sessionStartSpecs` in `@theocode/agent/hooks`, where neither surface can forget it.
 *
 * Never throws and never blocks the frame: a hook failing must not refuse a session the operator
 * just asked for.
 */
import process from 'node:process'

import { resolveEffectiveConfig, resolveTrustPosture } from '@theocode/agent/config'
// This product's `hookFingerprint`, not the framework's — ours converts `timeout_ms` to the
// `timeoutMs` the framework's identity requires, and the store is keyed by ours.
import {
  hookFingerprint,
  loadApprovedHooks,
  runSessionStartHooks,
  sessionStartSpecs,
} from '@theocode/agent/hooks'

export async function fireSessionStart(sessionId: string, cwd: string): Promise<void> {
  const posture = resolveTrustPosture(cwd, undefined, process.env)
  const specs = sessionStartSpecs({
    trusted: posture.allows.hooks,
    hooks: resolveEffectiveConfig({ cwd }).hooks,
  })
  if (specs.length === 0) return

  const approved = new Set([...loadApprovedHooks(cwd).keys()])
  await runSessionStartHooks({
    specs,
    cwd,
    sessionId,
    approved: (spec) => approved.has(hookFingerprint(spec)),
    // Under the TUI stderr is a log file nobody has open, so this is the honest limit of the report
    // rather than the ideal one — `/hooks` is where a wired hook is visible.
    onWarn: (m) => process.stderr.write(`[hooks] ${m}\n`),
  })
}
