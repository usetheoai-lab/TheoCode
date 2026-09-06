import { randomUUID } from 'node:crypto'

import { DEFAULT_SHELL_TIMEOUT_MS } from '@theocode/agent/config'
import { createGitRunner } from '@theocode/shared/git-runner'

import { CursorNotDrainedError, listAgents } from '@theocode/agent/session'

import type { ExecArgs } from './args.js'

/**
 * Seams, so the gate's two guarantees can be tested without a hung git.
 *
 * `run` receives the timeout it is bound by rather than closing over one: the bound IS the finding
 * (B-137), and a test that cannot see the number cannot assert it was passed.
 */
export interface GitGateDeps {
  readonly onWarn: (message: string) => void
  readonly run?: (timeoutMs: number) => { ok: boolean; stdout: string }
  readonly onRefuse?: (code: number) => void
  /** Test seam: the reason a stubbed `run` would have reported. */
  readonly reason?: string
}

/**
 * B-137 — the first thing the CLI does, now bounded, and honest about why it refused.
 *
 * It ran `git rev-parse --is-inside-work-tree` with NO timeout. A git that hangs — a network-backed
 * working tree, a stale `index.lock`, a credential helper waiting on a prompt — hung the CLI
 * forever, before it had printed anything the user could act on.
 *
 * Every failure also took one branch and printed "Not inside a git repository", so a hang, a missing
 * binary and a genuinely non-git directory were reported as the same thing and only one of them was
 * true. The verdict is unchanged — this gate still refuses — but the reason git gave now reaches the
 * user instead of being replaced by a guess.
 *
 * The bound is `DEFAULT_SHELL_TIMEOUT_MS` and NOT `shell_timeout_ms` from config, deliberately: this
 * runs before any config is resolved, and reading a file here would add a failure mode to the
 * earliest path in the process — the one place where a failure has no friendlier path to fall back
 * to. A local `rev-parse` that needs longer than ten seconds is the hang this bound exists for.
 */
export function gitGate(skip: boolean, deps: GitGateDeps = { onWarn: defaultWarn }): void {
  if (skip) return

  let reason = deps.reason ?? ''
  const run =
    deps.run ??
    ((timeoutMs: number) =>
      createGitRunner({
        timeoutMs,
        onWarn: (m) => {
          reason = m
        },
      })(['rev-parse', '--is-inside-work-tree']))

  const result = run(DEFAULT_SHELL_TIMEOUT_MS)
  if (result.ok) return

  deps.onWarn(
    `Not inside a git repository, or git could not answer (use --skip-git-repo-check to override)` +
      `${reason === '' ? '' : ` — ${reason}`}\n`,
  )
  ;(deps.onRefuse ?? ((code: number) => process.exit(code)))(1)
}

function defaultWarn(message: string): void {
  process.stderr.write(message)
}

export async function resolveSessionId(
  args: Extract<ExecArgs, { mode: 'run' | 'resume' }>,
): Promise<string> {
  if (args.mode === 'run' || args.resume === undefined) return `exec-${randomUUID()}`
  if (args.resume.id !== undefined) return args.resume.id
  try {
    const items = await listAgents(process.cwd())
    const mine = items
      .filter((a) => a.cwd === undefined || a.cwd === process.cwd())
      .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
    if (mine[0] !== undefined) return mine[0].agentId
  } catch (err) {
    if (err instanceof CursorNotDrainedError) throw err
    // listing unavailable — fall through to the fallback
  }
  process.stderr.write(
    '[exec] resume --last: no session found for this cwd — starting a NEW session\n',
  )
  return `exec-${randomUUID()}`
}
