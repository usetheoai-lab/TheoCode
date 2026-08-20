import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { CursorNotDrainedError, listAgents } from '@theocode/agent/session'

import type { ExecArgs } from './args.js'

export function gitGate(skip: boolean): void {
  if (skip) return
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'pipe' })
  } catch {
    process.stderr.write('Not inside a git repository (use --skip-git-repo-check to override)\n')
    process.exit(1)
  }
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
