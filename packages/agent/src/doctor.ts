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

/**
 * What is known about the stored credential. Presence only — never the value, not even truncated,
 * because this output is pasted into issues.
 *
 * `expired` is a distinct state, not a flavour of `present`. An OAuth credential that parsed but
 * whose `expires` had passed made this report `✓ credential: present` — measured 2026-08-25 against
 * a token ten days past expiry. A diagnostic whose job is to answer "is this ready to run?" said
 * yes about the one thing that was going to fail first.
 *
 * The docstring on `collectChecks` has claimed since it was written that the tests can "drive an
 * expired credential". They could not: the state did not exist.
 */
export type CredentialState = 'present' | 'absent' | 'unreadable' | 'expired'

export { diagnose, renderDiagnosis } from '@theokit/agents/doctor'

/** The credential row, one branch per state — no state collapses into another. */
function credentialCheck(state: CredentialState): Check {
  switch (state) {
    case 'present':
      return { name: 'credential', status: 'ok', detail: 'present' }
    case 'expired':
      return {
        name: 'credential',
        status: 'warn',
        detail:
          'EXPIRED — the stored token is past its expiry. A refresh may still renew it on the ' +
          'next turn; if it does not, run `theocode` and use /login.',
      }
    case 'absent':
      return {
        name: 'credential',
        status: 'fail',
        detail: 'absent — run `theocode` and use /login, or set the provider key',
      }
    case 'unreadable':
      return {
        name: 'credential',
        status: 'fail',
        detail: 'unreadable — the credential file exists and could not be parsed',
      }
  }
}

/**
 * One capability row: what is active, or why nothing is.
 *
 * At module scope rather than inside `collectChecks` — it closes over nothing, and the linter's
 * function-length ceiling is a real signal here: the row now carries three states.
 */
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
        //
        // #72 — suppressed AND non-empty is a real state for `mcp` alone: the operator's own
        // servers are not gated on project trust. Reporting only the suppression would say "not
        // wired" about a server that is running; reporting only the list would hide that the
        // repository's share was withheld. Whoever is debugging either half needs the other.
        detail:
          e.active.length === 0
            ? 'declared but NOT wired — this directory is untrusted'
            : `${e.active.join(', ')} — yours; the project's are NOT wired, this directory is untrusted`,
      }
    : {
        name,
        status: 'ok',
        detail: e.active.length === 0 ? 'none' : e.active.join(', '),
      }

/**
 * The checks for a directory: resolved config, trust, sandbox, credential presence, and what an
 * agent built here would actually wire.
 *
 * Every dependency is INJECTED. That is not ceremony — it is what lets the tests drive an expired
 * credential, an untrusted directory and a broken config without arranging any of them on disk,
 * and it keeps this function from being a second resolution path of its own.
 */
/** The disagreement between the declared skills and the disk, or no row when there is none. */
function skillsOnDiskCheck(
  found:
    | { readonly declaredButAbsent: readonly string[]; readonly presentButUndeclared: readonly string[] }
    | undefined,
): Check[] {
  if (found === undefined) return []
  const parts: string[] = []
  if (found.declaredButAbsent.length > 0)
    parts.push(`declared with no SKILL.md: ${found.declaredButAbsent.join(', ')}`)
  if (found.presentButUndeclared.length > 0)
    parts.push(`on disk but declared nowhere, so not loaded: ${found.presentButUndeclared.join(', ')}`)
  if (parts.length === 0) return []
  // A warning, never a failure: neither direction breaks a working install, and exiting non-zero
  // over a skill someone is midway through writing would report work-in-progress as broken.
  return [{ name: 'skills-on-disk', status: 'warn', detail: parts.join(' · ') }]
}

export function collectChecks(input: {
  readonly cwd: string
  readonly trustLevel: string
  readonly model: string
  readonly effort: string
  readonly sandboxMode: string
  readonly approvalPolicy: string
  readonly credential: CredentialState
  /**
   * Credential files in a state directory this product does not read (#72). Optional: a caller that
   * does not look for them says nothing, rather than asserting there are none.
   */
  readonly strayCredentials?: readonly string[]
  /**
   * What configuration claims about skills, held against the disk (#67). Optional: a caller that did
   * not look says nothing, rather than asserting the two agree.
   */
  readonly skillsOnDisk?: {
    readonly declaredButAbsent: readonly string[]
    readonly presentButUndeclared: readonly string[]
  }
  readonly wired: {
    readonly mcp: { active: readonly string[]; suppressedByTrust: boolean }
    readonly skills: { active: readonly string[]; suppressedByTrust: boolean }
    readonly hooks: { active: readonly string[]; suppressedByTrust: boolean }
  }
}): Check[] {
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
    credentialCheck(input.credential),
    { name: 'model', status: 'ok', detail: `${input.model} (${input.effort})` },
    { name: 'sandbox', status: 'ok', detail: input.sandboxMode },
    { name: 'approval', status: 'ok', detail: input.approvalPolicy },
    entity('mcp', input.wired.mcp),
    entity('skills', input.wired.skills),
    entity('hooks', input.wired.hooks),
    // #67 — the skills row above reports what was DECLARED. This one reports where that disagrees
    // with the disk, in both directions, because they have different remedies: a name to delete or a
    // file to write, against a config line to add. A green tick for a skill that is not there is the
    // shape this repository has fixed three times.
    ...skillsOnDiskCheck(input.skillsOnDisk),
    // Appended only when there is something to say. A row that permanently reads "none" is noise in
    // a nine-row diagnostic, and noise is what makes a diagnostic stop being read.
    ...((input.strayCredentials ?? []).length > 0
      ? [
          {
            name: 'credential-strays',
            // A warning, never a failure: nothing is broken. It is a leftover to remove, and exiting
            // non-zero over one would report a working install as broken.
            status: 'warn' as const,
            detail: `not read by this product — remove if you no longer need it: ${(input.strayCredentials ?? []).join(', ')}`,
          },
        ]
      : []),
  ]
}
