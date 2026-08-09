import process from 'node:process'
import type { ExecSessions } from '../runtime/index.js'

async function gcAcrossAllProjects(args: ExecSessions): Promise<void> {
  const { planAllProjectsOnDisk, runAllProjectsOnDisk, formatReport } =
    await import('@theocode/agent/session')
  let plan
  try {
    plan = await planAllProjectsOnDisk({
      ...(args.keepLast !== undefined ? { keepLast: args.keepLast } : {}),
      ...(args.maxAgeDays !== undefined ? { maxAgeDays: args.maxAgeDays } : {}),
    })
  } catch (err) {
    process.stderr.write(`[sessions gc] ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
  const result = await runAllProjectsOnDisk(plan, { apply: args.apply })
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ type: 'sessions.gc.all', dryRun: result.dryRun, byKind: plan.totalByKind, removed: result.removed.length, kept: plan.kept.length, errors: [...plan.errors, ...result.errors] })}\n`,
    )
  } else {
    for (const l of formatReport(plan, result)) process.stderr.write(`${l}\n`)
  }
  process.exit(plan.errors.length + result.errors.length > 0 ? 1 : 0)
}

function humanReport(
  plan: {
    kept: unknown[]
    pointer?: string
    mostRecent?: string
    candidates: { id: string; ageDays: number; inRegistry: boolean }[]
  },
  result: { dryRun: boolean; removed: unknown[]; errors: string[] },
): string[] {
  const verb = result.dryRun ? 'would remove' : 'removed'
  const pointer = plan.pointer?.slice(0, 16) ?? 'none'
  const mostRecent = plan.mostRecent?.slice(0, 16) ?? 'none'
  const lines = [
    `[sessions gc] ${result.dryRun ? 'DRY-RUN' : 'APPLIED'} — ${result.removed.length} ${verb}; ${plan.kept.length} kept (pointer=${pointer}, most-recent=${mostRecent})`,
    ...plan.candidates.map(
      (c) =>
        `  - ${c.id} (${Math.round(c.ageDays)}d, ${c.inRegistry ? 'registry' : 'orphan'}) [${verb}]`,
    ),
  ]
  if (result.dryRun && plan.candidates.length > 0) lines.push('  → re-run with --apply to delete')
  return [...lines, ...result.errors.map((e) => `  ! ${e}`)]
}

async function gcForCurrentProject(args: ExecSessions): Promise<void> {
  const { planSessionGC, runSessionGC } = await import('@theocode/agent/session')
  const plan = await planSessionGC({
    cwd: process.cwd(),
    ...(args.keepLast !== undefined ? { keepLast: args.keepLast } : {}),
    ...(args.maxAgeDays !== undefined ? { maxAgeDays: args.maxAgeDays } : {}),
  })
  const result = await runSessionGC(plan, { apply: args.apply })
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ type: 'sessions.gc', dryRun: result.dryRun, removed: result.removed, kept: plan.kept.length, pointer: plan.pointer, mostRecent: plan.mostRecent, errors: result.errors })}\n`,
    )
  } else {
    for (const l of humanReport(plan, result)) process.stderr.write(`${l}\n`)
  }
  process.exit(result.errors.length > 0 ? 1 : 0)
}

export async function sessionsCommand(args: ExecSessions): Promise<void> {
  if (args.allProjects) return gcAcrossAllProjects(args)
  return gcForCurrentProject(args)
}
