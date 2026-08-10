/**
 * B-081 — `theocode doctor`.
 *
 * Reports the RESOLVED state, not the config files: the gap between what config asks for and what
 * the product does is the failure class being diagnosed, so re-printing config would answer the
 * wrong question. The wiring half comes from the record `buildChatAgent` publishes — the same
 * source `/mcp`, `/skills` and `/hooks` read, so a support session and the TUI cannot disagree.
 *
 * Exits non-zero on a failure so it is usable in a script, and never prints a credential value.
 */
import process from 'node:process'
import { homedir } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'

/** Presence only — the file is opened to tell "absent" from "corrupt", never to read a secret. */
function credentialState(path: string): 'present' | 'absent' | 'unreadable' {
  if (!existsSync(path)) return 'absent'
  try {
    JSON.parse(readFileSync(path, 'utf8'))
    return 'present'
  } catch {
    return 'unreadable'
  }
}

export async function doctorCommand(opts: { json: boolean; cd?: string }): Promise<void> {
  const agent = await import('@theocode/agent')
  const { authFilePath } = await import('@theocode/agent/auth')
  const { resolveEffectiveConfig, resolveTrustPosture } = await import('@theocode/agent/config')
  const cwd = opts.cd ?? process.cwd()

  const posture = resolveTrustPosture(cwd)
  const cfg = resolveEffectiveConfig({ cwd })

  // Built for real, so the wiring reported is the wiring an actual turn would get. A cheaper
  // "read the files again" would reproduce the defect B-071 was reopened for.
  let wired = agent.wiredCapabilities({
    posture,
    projectSourcesAllowed: false,
    mcpServers: {},
    configuredSkills: [],
    hookEvents: [],
  })
  agent.buildChatAgent({ cwd, surface: 'headless', onWired: (w) => (wired = w) })

  const checks = agent.collectChecks({
    cwd,
    trustLevel: posture.level,
    model: cfg.model,
    effort: cfg.reasoning_effort,
    sandboxMode: cfg.sandbox_mode,
    approvalPolicy: cfg.approval_policy,
    // B-081 — resolved through `authFilePath`, the product's own function, and handed the same env
    // it reads. MEASURED, not assumed: with the current store `~/.theocode/auth.json` is the answer
    // either way, but computing the path a second way here would be the divergence a diagnostic
    // must never introduce — it would report on a file the product does not use.
    credential: credentialState(authFilePath(homedir(), process.env)),
    wired,
  })
  const result = agent.diagnose(checks)

  if (opts.json) process.stdout.write(`${JSON.stringify({ type: 'doctor', ...result })}\n`)
  else process.stderr.write(`${agent.renderDiagnosis(result)}\n`)
  process.exit(result.failed ? 1 : 0)
}
