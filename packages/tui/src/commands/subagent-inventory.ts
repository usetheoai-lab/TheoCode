/**
 * B-072 — which subagents exist here, answerable before invoking one.
 *
 * Delegation is real: `delegation/roles.ts` builds role agents and `config-commands.ts` routes a
 * custom command to a named subagent from `.theokit/agents/<name>.md`. The only feedback the set
 * ever produced was a FAILURE toast — `subagent "<name>" not found` — so the way to learn which
 * subagents exist was to name one that does not.
 *
 * Resolved through the SAME path the router uses (`.theokit/agents/<name>.md` under the working
 * directory), so this listing cannot claim a subagent the router would then fail to find. That is
 * the bullet the item calls out: a listing derived independently is a second source of truth, and
 * the two drift.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Where `config-commands.ts` looks. Shared so the two cannot diverge. */
export function subagentDir(cwd: string): string {
  return join(cwd, '.theokit', 'agents')
}

/**
 * The subagent names available in `cwd`, sorted.
 *
 * An unreadable or absent directory yields an empty list rather than throwing: "this project
 * defines no subagents" is the normal case, not an error to raise at someone opening a listing.
 */
export function listSubagents(cwd: string): string[] {
  const dir = subagentDir(cwd)
  if (!existsSync(dir)) return []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -'.md'.length))
    .filter((name) => name.length > 0)
    .sort((a, b) => a.localeCompare(b))
}
