import { classifyEntry, type ArtifactKind } from '../artifacts.js'
/**
 * The GC's own verdict vocabulary.
 *
 * Moved here from `liveness-oracle.ts` when that file was deleted in favour of `classifyProjects`
 * from `@theokit/agents/session`. The ALGORITHM was absorbed; this TYPE was not, and should not be:
 * it is a discriminated union that guarantees a `cwd` on ALIVE, which is what lets `resolveGuards`
 * consult the registry and the pointer without a null check on every line. The framework's
 * `LivenessVerdict` carries `cwd` as optional because `undetermined` has none — correct there,
 * weaker here. The adapter that bridges the two lives at the seam, in `filesystem.ts`.
 */
export type Liveness =
  | { state: 'ALIVE'; cwd: string }
  | { state: 'DEAD'; cwd?: string }
  | { state: 'UNDETERMINED'; reason: string }

const FLOOR_DAYS = 1

const KEEP_PER_PROJECT = 10

const DEFAULT_WINDOW_DAYS = 30

export interface ProjectEntry {
  name: string
  isDirectory: boolean
  /** B-020 — `undefined` when the entry could not be stat-ed. An entry with no age is never collected. */
  mtimeMs: number | undefined
}

interface RegistryEntry {
  agentId: string
  archived?: boolean
  lastModified?: number
}

export type CollectableKind = ArtifactKind | 'registry'

interface AllCandidate {
  project: string
  kind: CollectableKind
  target: string
  id?: string
  ageDays: number
  inRegistry?: boolean
}

export interface AllPlan {
  candidates: AllCandidate[]
  kept: string[]
  touchedProjects: string[]
  liveCwds: string[]
  totalByKind: Record<CollectableKind, number>
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
  readPointer: (cwd: string) => string | undefined
  // B-021 — REQUIRED, matching the sibling PlanAllOptions. Optional made the apply-phase TOCTOU
  // backstop opt-in, and backstopRefusal returned undefined outright when it was absent.
  hasLiveWriter: (transcriptPath: string) => boolean
  listProject?: (project: string) => ProjectEntry[]
}

export interface AllResult {
  dryRun: boolean
  removed: string[]
  errors: string[]
}

function transcriptId(name: string): string {
  return name.slice(0, -'.jsonl'.length)
}

/**
 * The suffix a lock adds to the transcript it guards. One definition, because the plan phase and the
 * apply phase both strip it and a divergence between them would let the apply phase delete a lock
 * whose transcript the plan phase believed was still on disk (B-020).
 */
const LOCK_SUFFIX = /\.jsonl(\.writer)?\.lock$/

function lockId(name: string): string {
  return name.replace(LOCK_SUFFIX, '')
}

function empty(): Record<CollectableKind, number> {
  return { transcript: 0, 'lock-file': 0, 'lock-directory': 0, tmp: 0, registry: 0 }
}

async function resolveGuards(
  liveness: ReturnType<PlanAllOptions['classify']>,
  transcripts: readonly ProjectEntry[],
  keepLast: number,
  opts: PlanAllOptions,
): Promise<{ protectedIds: Set<string>; registry: RegistryEntry[] } | undefined> {
  const protectedIds = new Set<string>()
  if (liveness.state !== 'ALIVE' && liveness.state !== 'DEAD') {
    return { protectedIds, registry: [] }
  }

  // B-020 — retention applies to DEAD projects too, and they are the ONLY kind the collector deletes
  // from. Returning an empty set here made `KEEP_PER_PROJECT` and the `--keep-last` flag apply
  // exclusively to the projects that were being spared anyway. Neither existing test could see it:
  // both force ALIVE or pass `keepLast: 0`.
  for (const t of transcripts.slice(0, keepLast)) protectedIds.add(transcriptId(t.name))

  // The registry and pointer guards need a live cwd to consult, so they stay ALIVE-only.
  if (liveness.state === 'DEAD') return { protectedIds, registry: [] }

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
  plan: AllPlan,
): Promise<void> {
  const { candidates, kept, touchedProjects, liveCwds, errors, totalByKind } = plan
  const { maxAgeDays, now } = previewWindow
  const liveness = opts.classify(project)
  if (liveness.state === 'UNDETERMINED') {
    kept.push(project)
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
    .sort(
      (a, b) => (b.mtimeMs ?? Infinity) - (a.mtimeMs ?? Infinity) || a.name.localeCompare(b.name),
    )
  const idsOnDisk = new Set(transcripts.map((t) => transcriptId(t.name)))

  const guards = await resolveGuards(liveness, transcripts, keepLast, opts)
  if (guards === undefined) {
    errors.push(`${project}: registry unavailable — project skipped`)
    return
  }
  const { protectedIds, registry } = guards
  if (liveness.state === 'ALIVE') liveCwds.push(liveness.cwd)
  const idsInRegistry = new Set(registry.map((e) => e.agentId))

  let plannedSomething = false
  const recordCandidate = (c: AllCandidate): void => {
    candidates.push(c)
    totalByKind[c.kind] += 1
    plannedSomething = true
  }

  planOnDiskEntries(
    { project, dir, entries, protectedIds, idsOnDisk, idsInRegistry },
    { maxAgeDays, now },
    recordCandidate,
    opts.hasLiveWriter,
  )

  if (liveness.state === 'ALIVE') {
    planRegistryEntries(project, registry, idsOnDisk, { maxAgeDays, now }, recordCandidate)
  }

  if (plannedSomething) touchedProjects.push(dir)
  else kept.push(project)
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
  readonly idsOnDisk: ReadonlySet<string>
  readonly idsInRegistry: ReadonlySet<string>
}

/**
 * The entry's age in days when it is past the window, or `undefined` when it must not be collected.
 *
 * B-020 — an entry with no mtime has NO AGE, and the window is the primary guard on this path. It
 * used to arrive here as `mtimeMs = 0`, which computed to ~20 000 days and cleared every window.
 */
function collectableAge(e: ProjectEntry, window: CollectionWindow): number | undefined {
  if (e.mtimeMs === undefined) return undefined
  const ageDays = (window.now() - e.mtimeMs) / 86_400_000
  return ageDays > window.maxAgeDays ? ageDays : undefined
}

function planOnDiskEntries(
  st: ProjectState,
  previewWindow: CollectionWindow,
  recordCandidate: (c: AllCandidate) => void,
  hasLiveWriter: (transcriptPath: string) => boolean,
): void {
  for (const e of st.entries) {
    const kind = classifyEntry(e.name, e.isDirectory)
    if (kind === undefined) continue
    const ageDays = collectableAge(e, previewWindow)
    if (ageDays === undefined) continue
    const target = `${st.dir}/${e.name}`
    const project = st.project

    switch (kind) {
      case 'transcript': {
        const candidate = planTranscript(e.name, { st, target, ageDays, hasLiveWriter })
        if (candidate !== undefined) recordCandidate(candidate)
        break
      }
      case 'lock-file':
      case 'lock-directory': {
        if (st.idsOnDisk.has(lockId(e.name))) continue
        recordCandidate({ project, kind, target, ageDays })
        break
      }
      case 'tmp':
        recordCandidate({ project, kind, target, ageDays })
        break
      default:
        assertNeverKind(kind)
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
function planTranscript(
  name: string,
  ctx: {
    st: ProjectState
    target: string
    ageDays: number
    hasLiveWriter: (transcriptPath: string) => boolean
  },
): AllCandidate | undefined {
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
    inRegistry: ctx.st.idsInRegistry.has(id),
  }
}

function planRegistryEntries(
  project: string,
  registry: readonly RegistryEntry[],
  idsOnDisk: ReadonlySet<string>,
  previewWindow: CollectionWindow,
  recordCandidate: (c: AllCandidate) => void,
): void {
  for (const entry of registry) {
    if (entry.archived === true) continue
    if (idsOnDisk.has(entry.agentId)) continue
    const ageDays = (previewWindow.now() - (entry.lastModified ?? 0)) / 86_400_000
    if (ageDays <= previewWindow.maxAgeDays) continue
    recordCandidate({
      project,
      kind: 'registry',
      target: entry.agentId,
      id: entry.agentId,
      ageDays,
    })
  }
}

export async function planSessionGCAllProjects(opts: PlanAllOptions): Promise<AllPlan> {
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_WINDOW_DAYS
  if (maxAgeDays < FLOOR_DAYS) {
    throw new RangeError(
      `maxAgeDays=${String(maxAgeDays)} is below the floor of ${String(FLOOR_DAYS)} day(s) — ` +
        `refusing: silently normalising would delete yesterday's session`,
    )
  }
  const now = opts.now ?? Date.now
  const keepLast = opts.keepLast ?? KEEP_PER_PROJECT

  const candidates: AllCandidate[] = []
  const kept: string[] = []
  const touchedProjects: string[] = []
  const liveCwds: string[] = []
  const errors: string[] = []
  const totalByKind = empty()

  let projects: string[]
  try {
    projects = opts.listProjects()
  } catch (err) {
    // B-020 — an empty plan AND an empty error list is the shape the renderer prints as "nothing to
    // collect". "I found nothing" and "I could not look" are different facts, and swallowing this
    // reported the reassuring one.
    errors.push(`could not list projects — ${(err as Error).message}`)
    return { candidates, kept, touchedProjects, liveCwds, totalByKind, errors }
  }

  const plan: AllPlan = { candidates, kept, touchedProjects, liveCwds, totalByKind, errors }
  for (const project of projects) {
    await planOneProject(project, { maxAgeDays, now }, keepLast, opts, plan)
  }

  return { candidates, kept, touchedProjects, liveCwds, totalByKind, errors }
}

function backstopRefusal(
  c: AllCandidate,
  livePointers: ReadonlySet<string>,
  opts: ApplyAllOptions,
): string | undefined {
  if (c.id !== undefined && livePointers.has(c.id)) {
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
  const transcript = c.target.replace(LOCK_SUFFIX, '.jsonl')
  return opts.hasLiveWriter(transcript)
    ? `${c.target}: refused — the sibling transcript gained a live writer between plan and apply`
    : undefined
}

async function removeCandidate(c: AllCandidate, opts: ApplyAllOptions): Promise<void> {
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
      assertNeverKind(c.kind)
  }
}

export async function runSessionGCAllProjects(
  plan: AllPlan,
  opts: ApplyAllOptions,
): Promise<AllResult> {
  if (opts.apply !== true) {
    return { dryRun: true, removed: plan.candidates.map((c) => c.target), errors: [] }
  }
  const removed: string[] = []
  const errors: string[] = []

  const livePointers = new Set<string>()
  if (opts.readPointer !== undefined) {
    for (const cwd of new Set(plan.liveCwds)) {
      const p = opts.readPointer(cwd)
      if (p !== undefined) livePointers.add(p)
    }
  }

  for (const c of plan.candidates) {
    const refusal = backstopRefusal(c, livePointers, opts)
    if (refusal !== undefined) {
      errors.push(refusal)
      continue
    }
    try {
      await removeCandidate(c, opts)
      removed.push(c.target)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        removed.push(c.target)
        continue
      }
      errors.push(`${c.target}: ${(err as Error).message}`)
    }
  }

  await removeEmptyProjects(plan, opts, removed, errors)

  return { dryRun: false, removed, errors }
}

async function removeEmptyProjects(
  plan: AllPlan,
  opts: ApplyAllOptions,
  removed: string[],
  errors: string[],
): Promise<void> {
  const list = opts.listProject
  if (list === undefined) return
  for (const dir of plan.touchedProjects) {
    const project = dir.slice(dir.lastIndexOf('/') + 1)
    try {
      if (list(project).length === 0) {
        await opts.rmdir(dir)
        removed.push(dir)
      }
    } catch (err) {
      errors.push(`${dir}: ${(err as Error).message}`)
    }
  }
}

function assertNeverKind(kind: never): never {
  throw new Error(`unhandled artifact shape: ${String(kind)}`)
}
