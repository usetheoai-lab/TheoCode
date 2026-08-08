import { classifyEntry, type ArtifactKind } from '../artifacts.js'
import { type Liveness } from '../liveness-oracle.js'

export const FLOOR_DAYS = 1

export const KEEP_PER_PROJECT = 10

export const DEFAULT_WINDOW_DAYS = 30

export interface ProjectEntry {
  name: string
  isDirectory: boolean
  mtimeMs: number
}

interface RegistryEntry {
  agentId: string
  archived?: boolean
  lastModified?: number
}

export type FormaColetavel = ArtifactKind | 'registry'

interface CandidatoAll {
  project: string
  kind: FormaColetavel
  target: string
  id?: string
  ageDays: number
  inRegistry?: boolean
}

export interface PlanoAll {
  candidates: CandidatoAll[]
  mantidos: string[]
  touchedProjects: string[]
  cwdsVivos: string[]
  totalPorForma: Record<FormaColetavel, number>
  errors: string[]
}

export interface PlanAllOptions {
  projectsRoot: string
  now?: () => number
  keepLast?: number
  maxAgeDays?: number
  listProjects: () => string[]
  listProject: (project: string) => ProjectEntry[]
  classify: (project: string) => Liveness
  listRegistry: (cwd: string) => Promise<RegistryEntry[]>
  hasLiveWriter: (transcriptPath: string) => boolean
  readPointer: (cwd: string) => string | undefined
}

interface ApplyAllOptions {
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

function transcriptId(name: string): string {
  return name.slice(0, -'.jsonl'.length)
}

function lockId(name: string): string {
  return name.replace(/\.jsonl(\.writer)?\.lock$/, '')
}

function empty(): Record<FormaColetavel, number> {
  return { transcript: 0, 'lock-file': 0, 'lock-directory': 0, tmp: 0, registry: 0 }
}

async function resolveGuards(
  liveness: ReturnType<PlanAllOptions['classify']>,
  transcripts: readonly ProjectEntry[],
  keepLast: number,
  opts: PlanAllOptions,
): Promise<{ protectedIds: Set<string>; registry: RegistryEntry[] } | undefined> {
  const protectedIds = new Set<string>()
  if (liveness.state === 'DEAD') {
    return { protectedIds, registry: [] }
  }
  if (liveness.state !== 'ALIVE') return { protectedIds, registry: [] }
  for (const t of transcripts.slice(0, keepLast)) protectedIds.add(transcriptId(t.name))
  if (transcripts[0] !== undefined) protectedIds.add(transcriptId(transcripts[0].name))
  const pointer = opts.readPointer(liveness.cwd)
  if (pointer !== undefined) protectedIds.add(pointer)
  let registry: RegistryEntry[]
  try {
    registry = await opts.listRegistry(liveness.cwd)
  } catch {
    return undefined
  }
  for (const e of registry) if (e.archived !== true) protectedIds.add(e.agentId)
  return { protectedIds, registry }
}

async function planOneProject(
  project: string,
  previewWindow: CollectionWindow,
  keepLast: number,
  opts: PlanAllOptions,
  plan: PlanoAll,
): Promise<void> {
  const { candidates, mantidos, touchedProjects, cwdsVivos, errors, totalPorForma } = plan
  const { maxAgeDays, now } = previewWindow
  const liveness = opts.classify(project)
  if (liveness.state === 'UNDETERMINED') {
    mantidos.push(project)
    return
  }

  let entries: ProjectEntry[]
  try {
    entries = opts.listProject(project)
  } catch (err) {
    errors.push(`${project}: could not list — ${(err as Error).message}`)
    return
  }

  const dir = `${opts.projectsRoot}/${project}`
  const transcripts = entries
    .filter((e) => classifyEntry(e.name, e.isDirectory) === 'transcript')
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name))
  const idsEmDisco = new Set(transcripts.map((t) => transcriptId(t.name)))

  const guards = await resolveGuards(liveness, transcripts, keepLast, opts)
  if (guards === undefined) {
    errors.push(`${project}: registry unavailable — project skipped`)
    return
  }
  const { protectedIds, registry } = guards
  if (liveness.state === 'ALIVE') cwdsVivos.push(liveness.cwd)
  const idsNoRegistry = new Set(registry.map((e) => e.agentId))

  let planejouAlgo = false
  const planejar = (c: CandidatoAll): void => {
    candidates.push(c)
    totalPorForma[c.kind] += 1
    planejouAlgo = true
  }

  planOnDiskEntries(
    { project, dir, entries, protectedIds, idsEmDisco, idsNoRegistry },
    { maxAgeDays, now },
    planejar,
    opts.hasLiveWriter,
  )

  if (liveness.state === 'ALIVE') {
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
  readonly protectedIds: ReadonlySet<string>
  readonly idsEmDisco: ReadonlySet<string>
  readonly idsNoRegistry: ReadonlySet<string>
}

function planOnDiskEntries(
  st: ProjectState,
  previewWindow: CollectionWindow,
  planejar: (c: CandidatoAll) => void,
  hasLiveWriter: (transcriptPath: string) => boolean,
): void {
  for (const e of st.entries) {
    const kind = classifyEntry(e.name, e.isDirectory)
    if (kind === undefined) continue
    const ageDays = (previewWindow.now() - e.mtimeMs) / 86_400_000
    if (ageDays <= previewWindow.maxAgeDays) continue
    const target = `${st.dir}/${e.name}`
    const project = st.project

    switch (kind) {
      case 'transcript': {
        const candidate = planejarTranscript(e.name, { st, target, ageDays, hasLiveWriter })
        if (candidate !== undefined) planejar(candidate)
        break
      }
      case 'lock-file':
      case 'lock-directory': {
        if (st.idsEmDisco.has(lockId(e.name))) continue
        planejar({ project, kind, target, ageDays })
        break
      }
      case 'tmp':
        planejar({ project, kind, target, ageDays })
        break
      default:
        assertNuncaForma(kind)
    }
  }
}

/**
 * Decide whether a stale transcript may be collected, or `undefined` when it must be kept.
 *
 * Two independent guards, and they see different things. `protectedIds` covers the live-session
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
  const id = transcriptId(name)
  if (ctx.st.protectedIds.has(id)) return undefined
  // B-003 — ask the SDK's cross-process lease, not just the mtime window. Before this, only mtime
  // freshness stood between a live transcript and unlink: a heuristic standing in for a lease the
  // caller had already wired and the plan phase never called.
  if (ctx.hasLiveWriter(ctx.target)) return undefined
  return {
    project: ctx.st.project,
    kind: 'transcript',
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
  previewWindow: CollectionWindow,
  planejar: (c: CandidatoAll) => void,
): void {
  for (const entry of registry) {
    if (entry.archived === true) continue
    if (idsEmDisco.has(entry.agentId)) continue
    const ageDays = (previewWindow.now() - (entry.lastModified ?? 0)) / 86_400_000
    if (ageDays <= previewWindow.maxAgeDays) continue
    planejar({ project, kind: 'registry', target: entry.agentId, id: entry.agentId, ageDays })
  }
}

export async function planSessionGCAllProjects(opts: PlanAllOptions): Promise<PlanoAll> {
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_WINDOW_DAYS
  if (maxAgeDays < FLOOR_DAYS) {
    throw new RangeError(
      `maxAgeDays=${String(maxAgeDays)} is below the floor of ${String(FLOOR_DAYS)} day(s) — ` +
        `refusing: silently normalising would delete yesterday's session`,
    )
  }
  const now = opts.now ?? Date.now
  const keepLast = opts.keepLast ?? KEEP_PER_PROJECT

  const candidates: CandidatoAll[] = []
  const mantidos: string[] = []
  const touchedProjects: string[] = []
  const cwdsVivos: string[] = []
  const errors: string[] = []
  const totalPorForma = empty()

  let projects: string[]
  try {
    projects = opts.listProjects()
  } catch {
    return { candidates, mantidos, touchedProjects, cwdsVivos, totalPorForma, errors }
  }

  const plan: PlanoAll = { candidates, mantidos, touchedProjects, cwdsVivos, totalPorForma, errors }
  for (const project of projects) {
    await planOneProject(project, { maxAgeDays, now }, keepLast, opts, plan)
  }

  return { candidates, mantidos, touchedProjects, cwdsVivos, totalPorForma, errors }
}

function backstopRefusal(
  c: CandidatoAll,
  ponteirosAgora: ReadonlySet<string>,
  opts: ApplyAllOptions,
): string | undefined {
  if (c.id !== undefined && ponteirosAgora.has(c.id)) {
    return `${c.target}: refused — the live-session pointer changed between plan and apply`
  }
  if (opts.hasLiveWriter === undefined) return undefined
  // B-003 — transcripts are re-checked here too. The early return used to drop everything that was
  // not a lock, so a transcript that gained a writer between plan and apply was deleted anyway.
  if (c.kind === 'transcript') {
    return opts.hasLiveWriter(c.target)
      ? `${c.target}: refused — the transcript gained a live writer between plan and apply`
      : undefined
  }
  if (c.kind !== 'lock-file' && c.kind !== 'lock-directory') return undefined
  const transcript = c.target.replace(/\.jsonl(\.writer)?\.lock$/, '.jsonl')
  return opts.hasLiveWriter(transcript)
    ? `${c.target}: refused — the sibling transcript gained a live writer between plan and apply`
    : undefined
}

async function removeCandidate(c: CandidatoAll, opts: ApplyAllOptions): Promise<void> {
  switch (c.kind) {
    case 'transcript':
      if (c.inRegistry === true && c.id !== undefined) await opts.deleteAgent(c.id)
      else await opts.unlink(c.target)
      return
    case 'registry':
      await opts.deleteAgent(c.target)
      return
    case 'lock-file':
    case 'tmp':
      await opts.unlink(c.target)
      return
    case 'lock-directory':
      await opts.rmdir(c.target)
      return
    default:
      assertNuncaForma(c.kind)
  }
}

export async function runSessionGCAllProjects(
  plan: PlanoAll,
  opts: ApplyAllOptions,
): Promise<ResultadoAll> {
  if (opts.apply !== true) {
    return { dryRun: true, removidos: plan.candidates.map((c) => c.target), errors: [] }
  }
  const removidos: string[] = []
  const errors: string[] = []

  const ponteirosAgora = new Set<string>()
  if (opts.readPointer !== undefined) {
    for (const cwd of new Set(plan.cwdsVivos)) {
      const p = opts.readPointer(cwd)
      if (p !== undefined) ponteirosAgora.add(p)
    }
  }

  for (const c of plan.candidates) {
    const refusal = backstopRefusal(c, ponteirosAgora, opts)
    if (refusal !== undefined) {
      errors.push(refusal)
      continue
    }
    try {
      await removeCandidate(c, opts)
      removidos.push(c.target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        removidos.push(c.target) 
        continue
      }
      errors.push(`${c.target}: ${(err as Error).message}`)
    }
  }

  await removeEmptyProjects(plan, opts, removidos, errors)

  return { dryRun: false, removidos, errors }
}

async function removeEmptyProjects(
  plan: PlanoAll,
  opts: ApplyAllOptions,
  removidos: string[],
  errors: string[],
): Promise<void> {
  const list = opts.listProject
  if (list === undefined) return
  for (const dir of plan.touchedProjects) {
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

function assertNuncaForma(kind: never): never {
  throw new Error(`unhandled artifact shape: ${String(kind)}`)
}

