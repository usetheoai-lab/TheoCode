import { classifyEntry, type FormaDeArtefato } from '../artefatos.js'
import { type Liveness } from '../liveness-oracle.js'

export const FLOOR_DAYS = 1

export const KEEP_PER_PROJECT = 10

export const DEFAULT_WINDOW_DAYS = 30

export interface ProjectEntry {
  name: string
  ehDiretorio: boolean
  mtimeMs: number
}

interface RegistryEntry {
  agentId: string
  archived?: boolean
  lastModified?: number
}

export type FormaColetavel = FormaDeArtefato | 'registry'

interface CandidatoAll {
  project: string
  forma: FormaColetavel
  target: string
  id?: string
  ageDays: number
  inRegistry?: boolean
}

export interface PlanoAll {
  candidatos: CandidatoAll[]
  mantidos: string[]
  touchedProjects: string[]
  cwdsVivos: string[]
  totalPorForma: Record<FormaColetavel, number>
  errors: string[]
}

export interface OpcoesPlanoAll {
  projectsRoot: string
  now?: () => number
  keepLast?: number
  maxAgeDays?: number
  listProjects: () => string[]
  listProject: (project: string) => ProjectEntry[]
  classificar: (project: string) => Liveness
  listRegistry: (cwd: string) => Promise<RegistryEntry[]>
  hasLiveWriter: (transcriptPath: string) => boolean
  readPointer: (cwd: string) => string | undefined
}

interface OpcoesApplyAll {
  apply?: boolean
  unlink: (path: string) => Promise<void>
  rmdir: (path: string) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  readPointer?: (cwd: string) => string | undefined
  hasLiveWriter?: (transcriptPath: string) => boolean
  listProject?: (project: string) => ProjectEntry[]
}

export interface ResultadoAll {
  dryRun: boolean
  removidos: string[]
  errors: string[]
}

function idDoTranscript(name: string): string {
  return name.slice(0, -'.jsonl'.length)
}

function idDoLock(name: string): string {
  return name.replace(/\.jsonl(\.writer)?\.lock$/, '')
}

function empty(): Record<FormaColetavel, number> {
  return { transcript: 0, 'lock-arquivo': 0, 'lock-diretorio': 0, tmp: 0, registry: 0 }
}

async function resolverGuardas(
  liveness: ReturnType<OpcoesPlanoAll['classificar']>,
  transcripts: readonly ProjectEntry[],
  keepLast: number,
  opts: OpcoesPlanoAll,
): Promise<{ protegidos: Set<string>; registry: RegistryEntry[] } | undefined> {
  const protegidos = new Set<string>()
  if (liveness.state === 'MORTO') {
    return { protegidos, registry: [] }
  }
  if (liveness.state !== 'VIVO') return { protegidos, registry: [] }
  for (const t of transcripts.slice(0, keepLast)) protegidos.add(idDoTranscript(t.name))
  if (transcripts[0] !== undefined) protegidos.add(idDoTranscript(transcripts[0].name))
  const pointer = opts.readPointer(liveness.cwd)
  if (pointer !== undefined) protegidos.add(pointer)
  let registry: RegistryEntry[]
  try {
    registry = await opts.listRegistry(liveness.cwd)
  } catch {
    return undefined
  }
  for (const e of registry) if (e.archived !== true) protegidos.add(e.agentId)
  return { protegidos, registry }
}

async function planOneProject(
  project: string,
  janela: CollectionWindow,
  keepLast: number,
  opts: OpcoesPlanoAll,
  plano: PlanoAll,
): Promise<void> {
  const { candidatos, mantidos, touchedProjects, cwdsVivos, errors, totalPorForma } = plano
  const { maxAgeDays, now } = janela
  const liveness = opts.classificar(project)
  if (liveness.state === 'INDETERMINADO') {
    mantidos.push(project)
    return
  }

  let entries: ProjectEntry[]
  try {
    entries = opts.listProject(project)
  } catch (err) {
    errors.push(`${project}: não foi possível listar — ${(err as Error).message}`)
    return
  }

  const dir = `${opts.projectsRoot}/${project}`
  const transcripts = entries
    .filter((e) => classifyEntry(e.name, e.ehDiretorio) === 'transcript')
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name))
  const idsEmDisco = new Set(transcripts.map((t) => idDoTranscript(t.name)))

  const guardas = await resolverGuardas(liveness, transcripts, keepLast, opts)
  if (guardas === undefined) {
    errors.push(`${project}: registry indisponível — projeto pulado`)
    return
  }
  const { protegidos, registry } = guardas
  if (liveness.state === 'VIVO') cwdsVivos.push(liveness.cwd)
  const idsNoRegistry = new Set(registry.map((e) => e.agentId))

  let planejouAlgo = false
  const planejar = (c: CandidatoAll): void => {
    candidatos.push(c)
    totalPorForma[c.forma] += 1
    planejouAlgo = true
  }

  planOnDiskEntries(
    { project, dir, entries, protegidos, idsEmDisco, idsNoRegistry },
    { maxAgeDays, now },
    planejar,
    opts.hasLiveWriter,
  )

  if (liveness.state === 'VIVO') {
    planRegistryEntries(project, registry, idsEmDisco, { maxAgeDays, now }, planejar)
  }

  if (planejouAlgo) touchedProjects.push(dir)
  else mantidos.push(project)
}

interface CollectionWindow {
  readonly maxAgeDays: number
  readonly now: () => number
}

interface ProjectState {
  readonly project: string
  readonly dir: string
  readonly entries: readonly ProjectEntry[]
  readonly protegidos: ReadonlySet<string>
  readonly idsEmDisco: ReadonlySet<string>
  readonly idsNoRegistry: ReadonlySet<string>
}

function planOnDiskEntries(
  st: ProjectState,
  janela: CollectionWindow,
  planejar: (c: CandidatoAll) => void,
  hasLiveWriter: (transcriptPath: string) => boolean,
): void {
  for (const e of st.entries) {
    const forma = classifyEntry(e.name, e.ehDiretorio)
    if (forma === undefined) continue
    const ageDays = (janela.now() - e.mtimeMs) / 86_400_000
    if (ageDays <= janela.maxAgeDays) continue
    const target = `${st.dir}/${e.name}`
    const project = st.project

    switch (forma) {
      case 'transcript': {
        const candidato = planejarTranscript(e.name, { st, target, ageDays, hasLiveWriter })
        if (candidato !== undefined) planejar(candidato)
        break
      }
      case 'lock-arquivo':
      case 'lock-diretorio': {
        if (st.idsEmDisco.has(idDoLock(e.name))) continue
        planejar({ project, forma, target, ageDays })
        break
      }
      case 'tmp':
        planejar({ project, forma, target, ageDays })
        break
      default:
        assertNuncaForma(forma)
    }
  }
}

/**
 * Decide whether a stale transcript may be collected, or `undefined` when it must be kept.
 *
 * Two independent guards, and they see different things. `protegidos` covers the live-session
 * pointer, `keepLast` and the registry — all id-based. The writer lease covers a session whose
 * writer is alive but whose id none of those knows, which is precisely the case where the id-based
 * set is silent.
 */
function planejarTranscript(
  name: string,
  ctx: {
    st: ProjectState
    target: string
    ageDays: number
    hasLiveWriter: (transcriptPath: string) => boolean
  },
): CandidatoAll | undefined {
  const id = idDoTranscript(name)
  if (ctx.st.protegidos.has(id)) return undefined
  // B-003 — ask the SDK's cross-process lease, not just the mtime window. Before this, only mtime
  // freshness stood between a live transcript and unlink: a heuristic standing in for a lease the
  // caller had already wired and the plan phase never called.
  if (ctx.hasLiveWriter(ctx.target)) return undefined
  return {
    project: ctx.st.project,
    forma: 'transcript',
    target: ctx.target,
    id,
    ageDays: ctx.ageDays,
    inRegistry: ctx.st.idsNoRegistry.has(id),
  }
}

function planRegistryEntries(
  project: string,
  registry: readonly RegistryEntry[],
  idsEmDisco: ReadonlySet<string>,
  janela: CollectionWindow,
  planejar: (c: CandidatoAll) => void,
): void {
  for (const entry of registry) {
    if (entry.archived === true) continue
    if (idsEmDisco.has(entry.agentId)) continue
    const ageDays = (janela.now() - (entry.lastModified ?? 0)) / 86_400_000
    if (ageDays <= janela.maxAgeDays) continue
    planejar({ project, forma: 'registry', target: entry.agentId, id: entry.agentId, ageDays })
  }
}

export async function planSessionGCAllProjects(opts: OpcoesPlanoAll): Promise<PlanoAll> {
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_WINDOW_DAYS
  if (maxAgeDays < FLOOR_DAYS) {
    throw new RangeError(
      `maxAgeDays=${String(maxAgeDays)} está abaixo do floor de ${String(FLOOR_DAYS)} dia(s) — ` +
        `recusando: normalizar em silêncio apagaria a sessão de ontem`,
    )
  }
  const now = opts.now ?? Date.now
  const keepLast = opts.keepLast ?? KEEP_PER_PROJECT

  const candidatos: CandidatoAll[] = []
  const mantidos: string[] = []
  const touchedProjects: string[] = []
  const cwdsVivos: string[] = []
  const errors: string[] = []
  const totalPorForma = empty()

  let projects: string[]
  try {
    projects = opts.listProjects()
  } catch {
    return { candidatos, mantidos, touchedProjects, cwdsVivos, totalPorForma, errors }
  }

  const plano: PlanoAll = { candidatos, mantidos, touchedProjects, cwdsVivos, totalPorForma, errors }
  for (const project of projects) {
    await planOneProject(project, { maxAgeDays, now }, keepLast, opts, plano)
  }

  return { candidatos, mantidos, touchedProjects, cwdsVivos, totalPorForma, errors }
}

function backstopRefusal(
  c: CandidatoAll,
  ponteirosAgora: ReadonlySet<string>,
  opts: OpcoesApplyAll,
): string | undefined {
  if (c.id !== undefined && ponteirosAgora.has(c.id)) {
    return `${c.target}: refused — the live-session pointer changed between plan and apply`
  }
  if (opts.hasLiveWriter === undefined) return undefined
  // B-003 — transcripts are re-checked here too. The early return used to drop everything that was
  // not a lock, so a transcript that gained a writer between plan and apply was deleted anyway.
  if (c.forma === 'transcript') {
    return opts.hasLiveWriter(c.target)
      ? `${c.target}: refused — the transcript gained a live writer between plan and apply`
      : undefined
  }
  if (c.forma !== 'lock-arquivo' && c.forma !== 'lock-diretorio') return undefined
  const transcript = c.target.replace(/\.jsonl(\.writer)?\.lock$/, '.jsonl')
  return opts.hasLiveWriter(transcript)
    ? `${c.target}: refused — the sibling transcript gained a live writer between plan and apply`
    : undefined
}

async function removerCandidato(c: CandidatoAll, opts: OpcoesApplyAll): Promise<void> {
  switch (c.forma) {
    case 'transcript':
      if (c.inRegistry === true && c.id !== undefined) await opts.deleteAgent(c.id)
      else await opts.unlink(c.target)
      return
    case 'registry':
      await opts.deleteAgent(c.target)
      return
    case 'lock-arquivo':
    case 'tmp':
      await opts.unlink(c.target)
      return
    case 'lock-diretorio':
      await opts.rmdir(c.target)
      return
    default:
      assertNuncaForma(c.forma)
  }
}

export async function runSessionGCAllProjects(
  plano: PlanoAll,
  opts: OpcoesApplyAll,
): Promise<ResultadoAll> {
  if (opts.apply !== true) {
    return { dryRun: true, removidos: plano.candidatos.map((c) => c.target), errors: [] }
  }
  const removidos: string[] = []
  const errors: string[] = []

  const ponteirosAgora = new Set<string>()
  if (opts.readPointer !== undefined) {
    for (const cwd of new Set(plano.cwdsVivos)) {
      const p = opts.readPointer(cwd)
      if (p !== undefined) ponteirosAgora.add(p)
    }
  }

  for (const c of plano.candidatos) {
    const refusal = backstopRefusal(c, ponteirosAgora, opts)
    if (refusal !== undefined) {
      errors.push(refusal)
      continue
    }
    try {
      await removerCandidato(c, opts)
      removidos.push(c.target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        removidos.push(c.target) 
        continue
      }
      errors.push(`${c.target}: ${(err as Error).message}`)
    }
  }

  await removeEmptyProjects(plano, opts, removidos, errors)

  return { dryRun: false, removidos, errors }
}

async function removeEmptyProjects(
  plano: PlanoAll,
  opts: OpcoesApplyAll,
  removidos: string[],
  errors: string[],
): Promise<void> {
  const list = opts.listProject
  if (list === undefined) return
  for (const dir of plano.touchedProjects) {
    const project = dir.slice(dir.lastIndexOf('/') + 1)
    try {
      if (list(project).length === 0) {
        await opts.rmdir(dir)
        removidos.push(dir)
      }
    } catch (err) {
      errors.push(`${dir}: ${(err as Error).message}`)
    }
  }
}

function assertNuncaForma(forma: never): never {
  throw new Error(`unhandled artifact shape: ${String(forma)}`)
}

