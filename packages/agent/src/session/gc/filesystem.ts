import {
  existsSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  promises as fsp,
} from 'node:fs'
import { join } from 'node:path'

import { Agent } from '@theokit/agents'
import { sessionHasWriter, transcriptRoot } from '@theokit/agents/persistence'

import { listAgents } from '../agent-list.js'
import { classifyDirectory, type OracleIO } from '../liveness-oracle.js'
import {
  planSessionGCAllProjects,
  runSessionGCAllProjects,
  type ProjectEntry,
  type FormaColetavel,
  type PlanoAll,
  type ResultadoAll,
} from './all-sessions.js'
import { readPointerId } from './pointer.js'

const FIRST_LINE_CAP = 64 * 1024
const MAX_PROFUNDIDADE_DFS = 12
const MAX_NOS_DFS = 20_000

const io: OracleIO = {
  listEntries: (dir) => readdirSync(dir),
  firstLine(file) {
    const fd = openSync(file, 'r')
    try {
      const buf = Buffer.alloc(FIRST_LINE_CAP)
      const lidos = readSync(fd, buf, 0, FIRST_LINE_CAP, 0)
      const text = buf.subarray(0, lidos).toString('utf8')
      const nl = text.indexOf('\n')
      return nl >= 0 ? text.slice(0, nl) : text
    } finally {
      closeSync(fd)
    }
  },
  isDirectory(path) {
    try {
      return statSync(path).isDirectory()
    } catch {
      return false
    }
  },
}

function listRealProject(root: string, project: string): ProjectEntry[] {
  const dir = join(root, project)
  return readdirSync(dir, { withFileTypes: true }).map((e) => {
    let mtimeMs = 0
    try {
      mtimeMs = statSync(join(dir, e.name)).mtimeMs
    } catch {
      // The node vanished between `readdir` and `stat`. `mtimeMs = 0` makes it "infinitely old" and
      // therefore a candidate — and the matching `unlink` returns `ENOENT`, which the collector already
      // treats as idempotent success. No deletion decision rests on this value alone.
    }
    return { name: e.name, isDirectory: e.isDirectory(), mtimeMs }
  })
}

interface CliOptions {
  apply?: boolean
  keepLast?: number
  maxAgeDays?: number
  projectsRoot?: string
}

export async function listProjectRegistry(
  cwd: string,
): Promise<Awaited<ReturnType<typeof listAgents>>> {
  return listAgents(cwd)
}

export async function planAllProjectsNoDisco(opts: CliOptions = {}): Promise<PlanoAll> {
  const root = opts.projectsRoot ?? join(transcriptRoot(), 'projects')
  return planSessionGCAllProjects({
    projectsRoot: root,
    ...(opts.keepLast !== undefined ? { keepLast: opts.keepLast } : {}),
    ...(opts.maxAgeDays !== undefined ? { maxAgeDays: opts.maxAgeDays } : {}),
    listProjects: () =>
      existsSync(root)
        ? readdirSync(root, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
        : [],
    listProject: (p) => listRealProject(root, p),
    classify: (p) =>
      classifyDirectory(p, io, {
        projectsRoot: root,
        maxProfundidadeDFS: MAX_PROFUNDIDADE_DFS,
        maxDfsNodes: MAX_NOS_DFS,
      }),
    listRegistry: (cwd) => listProjectRegistry(cwd),
    hasLiveWriter: (transcript) => sessionHasWriter(transcript),
    readPointer: (cwd) => readPointerId(cwd),
  })
}

export async function runAllProjectsNoDisco(
  plan: PlanoAll,
  opts: CliOptions = {},
): Promise<ResultadoAll> {
  const root = opts.projectsRoot ?? join(transcriptRoot(), 'projects')
  return runSessionGCAllProjects(plan, {
    ...(opts.apply === true ? { apply: true } : {}),
    unlink: (path) => fsp.unlink(path),
    rmdir: (path) => fsp.rmdir(path),
    deleteAgent: (id) => Agent.delete(id),
    hasLiveWriter: (transcript) => sessionHasWriter(transcript),
    readPointer: (cwd) => readPointerId(cwd),
    listProject: (p) => {
      try {
        return listRealProject(root, p)
      } catch {
        return [{ name: '<unreadable>', isDirectory: false, mtimeMs: 0 }]
      }
    },
  })
}

const ROTULO: Record<FormaColetavel, string> = {
  transcript: 'transcript',
  registry: 'registry entry',
  'lock-file': 'orphaned lock (file)',
  'lock-directory': 'orphaned lock (directory)',
  tmp: 'interrupted temporary',
}

export function formatReport(plan: PlanoAll, resultado: ResultadoAll): string[] {
  const lines: string[] = []
  lines.push(
    resultado.dryRun
      ? 'DRY-RUN — nothing was removed; use --apply to execute'
      : `APLICADO — ${String(resultado.removidos.length)} artefato(s) removido(s)`,
  )
  lines.push('')
  lines.push('por kind:')
  for (const [kind, n] of Object.entries(plan.totalPorForma) as [FormaColetavel, number][]) {
    if (n > 0) lines.push(`  ${ROTULO[kind].padEnd(24)} ${String(n).padStart(7)}`)
  }
  const perProject = new Map<string, number>()
  for (const c of plan.candidates) perProject.set(c.project, (perProject.get(c.project) ?? 0) + 1)
  lines.push('')
  lines.push(
    `projetos: ${String(perProject.size)} com candidates, ${String(plan.mantidos.length)} mantidos inteiros`,
  )
  for (const e of plan.errors) lines.push(`  ! ${e}`)
  for (const e of resultado.errors) lines.push(`  ! ${e}`)
  if (plan.candidates.length === 0) lines.push('nothing to collect')
  return lines
}
