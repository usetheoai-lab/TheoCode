import {
  existsSync,
  readdirSync,
  readFileSync,
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
  ehDiretorio(path) {
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
      // O nó sumiu entre o `readdir` e o `stat`. `mtimeMs = 0` o torna "infinitamente velho" e
      // portanto candidato — e o `unlink` correspondente devolverá `ENOENT`, que o coletor já trata
      // como sucesso idempotente. Nenhuma decisão de deleção depende deste valor sozinho.
    }
    return { name: e.name, ehDiretorio: e.isDirectory(), mtimeMs }
  })
}

interface OpcoesCLI {
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

export async function planAllProjectsNoDisco(opts: OpcoesCLI = {}): Promise<PlanoAll> {
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
    classificar: (p) =>
      classifyDirectory(p, io, {
        projectsRoot: root,
        maxProfundidadeDFS: MAX_PROFUNDIDADE_DFS,
        maxNosDFS: MAX_NOS_DFS,
      }),
    listRegistry: (cwd) => listProjectRegistry(cwd),
    hasLiveWriter: (transcript) => sessionHasWriter(transcript),
    readPointer: (cwd) => {
      try {
        const id = readFileSync(join(cwd, '.theokit', 'tui-session'), 'utf8').trim()
        return id === '' ? undefined : id
      } catch {
        return undefined
      }
    },
  })
}

export async function runAllProjectsNoDisco(
  plano: PlanoAll,
  opts: OpcoesCLI = {},
): Promise<ResultadoAll> {
  const root = opts.projectsRoot ?? join(transcriptRoot(), 'projects')
  return runSessionGCAllProjects(plano, {
    ...(opts.apply === true ? { apply: true } : {}),
    unlink: (path) => fsp.unlink(path),
    rmdir: (path) => fsp.rmdir(path),
    deleteAgent: (id) => Agent.delete(id),
    hasLiveWriter: (transcript) => sessionHasWriter(transcript),
    readPointer: (cwd) => {
      try {
        const id = readFileSync(join(cwd, '.theokit', 'tui-session'), 'utf8').trim()
        return id === '' ? undefined : id
      } catch {
        return undefined
      }
    },
    listProject: (p) => {
      try {
        return listRealProject(root, p)
      } catch {
        return [{ name: '<ilegível>', ehDiretorio: false, mtimeMs: 0 }]
      }
    },
  })
}

const ROTULO: Record<FormaColetavel, string> = {
  transcript: 'transcript',
  registry: 'entrada de registry',
  'lock-arquivo': 'lock órfão (arquivo)',
  'lock-diretorio': 'lock órfão (diretório)',
  tmp: 'temporário interrompido',
}

export function formatReport(plano: PlanoAll, resultado: ResultadoAll): string[] {
  const lines: string[] = []
  lines.push(
    resultado.dryRun
      ? 'DRY-RUN — nada foi removido; use --apply para executar'
      : `APLICADO — ${String(resultado.removidos.length)} artefato(s) removido(s)`,
  )
  lines.push('')
  lines.push('por forma:')
  for (const [forma, n] of Object.entries(plano.totalPorForma) as [FormaColetavel, number][]) {
    if (n > 0) lines.push(`  ${ROTULO[forma].padEnd(24)} ${String(n).padStart(7)}`)
  }
  const perProject = new Map<string, number>()
  for (const c of plano.candidatos) perProject.set(c.project, (perProject.get(c.project) ?? 0) + 1)
  lines.push('')
  lines.push(
    `projetos: ${String(perProject.size)} com candidatos, ${String(plano.mantidos.length)} mantidos inteiros`,
  )
  for (const e of plano.errors) lines.push(`  ! ${e}`)
  for (const e of resultado.errors) lines.push(`  ! ${e}`)
  if (plano.candidatos.length === 0) lines.push('nada a coletar')
  return lines
}
