/**
 * B-081 — one command that reports what this installation WILL do.
 *
 * The product has a lot to misconfigure — OAuth credentials, layered config, trust posture, the
 * sandbox backend, `.mcp.json` servers that are SPAWNED, disk skills, hooks — and nothing reported
 * on any of it. When something did not take effect, the tools available were reading source and
 * guessing, which is what B-069, B-070 and B-071 each described from inside their own corner.
 *
 * It reports the RESOLVED state, not the files. The gap between what config asks for and what the
 * product does is the whole failure class being diagnosed, so re-printing config would answer the
 * wrong question — the same reasoning that reopened B-071.
 *
 * NO SECRET EVER LEAVES THIS FILE. A credential is reported present / absent / unreadable and never
 * by value, not even truncated: a diagnostic is the output people paste into issues.
 */

/**
 * The quartet — `Check`, `Diagnosis`, `diagnose`, `renderDiagnosis` — moved to
 * `@theokit/agents/doctor` and was deleted here. It is the part every product re-derives
 * identically; the LIST of checks below is the part that is actually this product's.
 *
 * Two things came back richer than what was removed. `Diagnosis.failed` is now a COUNT rather than
 * a boolean, and `diagnose([])` no longer reports a clean bill of health: an empty list exits
 * non-zero, because a product whose check list failed to load would otherwise announce that an
 * installation nobody examined is fine. The local version had exactly that hole.
 */
import type { Check } from '@theokit/agents/doctor'

export { diagnose, renderDiagnosis } from '@theokit/agents/doctor'

/**
 * The checks for a directory: resolved config, trust, sandbox, credential presence, and what an
 * agent built here would actually wire.
 *
 * Every dependency is INJECTED. That is not ceremony — it is what lets the tests drive an expired
 * credential, an untrusted directory and a broken config without arranging any of them on disk,
 * and it keeps this function from being a second resolution path of its own.
 */
export function collectChecks(input: {
  readonly cwd: string
  readonly trustLevel: string
  readonly model: string
  readonly effort: string
  readonly sandboxMode: string
  readonly approvalPolicy: string
  /** Presence only. Never the value, not even truncated — this output is pasted into issues. */
  readonly credential: 'present' | 'absent' | 'unreadable'
  readonly wired: {
    readonly mcp: { active: readonly string[]; suppressedByTrust: boolean }
    readonly skills: { active: readonly string[]; suppressedByTrust: boolean }
    readonly hooks: { active: readonly string[]; suppressedByTrust: boolean }
  }
}): Check[] {
  const entity = (
    name: string,
    e: { active: readonly string[]; suppressedByTrust: boolean },
  ): Check =>
    e.suppressedByTrust
      ? {
          name,
          status: 'warn',
          // A warning, not a failure: trust-gating is the product working as designed. It is
          // reported because a user debugging "my hook does not run" needs to see it, not because
          // anything is broken.
          detail: 'declared but NOT wired — this directory is untrusted',
        }
      : {
          name,
          status: 'ok',
          detail: e.active.length === 0 ? 'none' : e.active.join(', '),
        }

  return [
    { name: 'cwd', status: 'ok', detail: input.cwd },
    {
      name: 'trust',
      status: input.trustLevel === 'trusted' ? 'ok' : 'warn',
      detail:
        input.trustLevel === 'trusted'
          ? 'trusted'
          : `${input.trustLevel} — project config, AGENTS.md, hooks, skills, MCP and memory are all withheld`,
    },
    {
      name: 'credential',
      status:
        input.credential === 'present' ? 'ok' : input.credential === 'absent' ? 'fail' : 'fail',
      detail:
        input.credential === 'present'
          ? 'present'
          : input.credential === 'absent'
            ? 'absent — run `theocode` and use /login, or set the provider key'
            : 'unreadable — the credential file exists and could not be parsed',
    },
    { name: 'model', status: 'ok', detail: `${input.model} (${input.effort})` },
    { name: 'sandbox', status: 'ok', detail: input.sandboxMode },
    { name: 'approval', status: 'ok', detail: input.approvalPolicy },
    entity('mcp', input.wired.mcp),
    entity('skills', input.wired.skills),
    entity('hooks', input.wired.hooks),
  ]
}
