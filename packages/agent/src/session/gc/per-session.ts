import { existsSync, readdirSync, statSync, promises as fsp } from 'node:fs'
import { basename, join } from 'node:path'

import { Agent } from '@theokit/agents'
import { encodeProjectDir, transcriptPath, transcriptRoot } from '@theokit/agents/persistence'

import { listAgents } from '../agent-list.js'
import { readPointerId } from './pointer.js'

const defaultBaseDir = transcriptRoot

function transcriptDir(cwd: string, baseDir: string = defaultBaseDir()): string {
  return join(baseDir, 'projects', encodeProjectDir(cwd))
}

interface SessionGCCandidate {
  id: string
  ageDays: number
  inRegistry: boolean
}

export interface SessionGCPlan {
  candidates: SessionGCCandidate[]
  kept: string[]
  pointer?: string
  mostRecent?: string
  total: number
}

interface RegistryEntry {
  agentId: string
  archived?: boolean
}

export interface PlanSessionGCOptions {
  cwd?: string
  baseDir?: string
  now?: () => number
  keepLast?: number
  maxAgeDays?: number
  list?: (cwd: string) => Promise<RegistryEntry[]>
  readPointer?: (cwd: string) => string | undefined
  readdir?: (dir: string) => { id: string; mtimeMs: number }[]
}

/** Transcripts in a project directory, newest first is the caller's job to sort. Sync by design:
 *  the fork guard runs on a synchronous write path. */
function readTranscriptDir(dir: string): { id: string; mtimeMs: number }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ id: f.slice(0, -6), mtimeMs: statSync(join(dir, f)).mtimeMs }))
}

function realReadPointer(cwd: string): string | undefined {
  return readPointerId(cwd)
}

function resolvePlanOptions(opts: PlanSessionGCOptions) {
  const cwd = opts.cwd ?? process.cwd()
  return {
    cwd,
    baseDir: opts.baseDir ?? defaultBaseDir(),
    now: opts.now ?? Date.now,
    keepLast: opts.keepLast ?? 10,
    maxAgeDays: opts.maxAgeDays ?? 30,
    listFn: opts.list ?? defaultList,
    readdir: opts.readdir ?? readTranscriptDir,
    readPointer: opts.readPointer ?? realReadPointer,
  }
}

export async function planSessionGC(opts: PlanSessionGCOptions = {}): Promise<SessionGCPlan> {
  const { cwd, baseDir, now, keepLast, maxAgeDays, listFn, readdir, readPointer } =
    resolvePlanOptions(opts)

  const onDisk = readdir(transcriptDir(cwd, baseDir)).sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id),
  )
  const listed = await listFn(cwd)
  const registryAll = new Set(listed.map((e) => e.agentId))  // session ids; mapped where compared

  const pointer = readPointer(cwd)
  const mostRecent = onDisk[0]?.id
  // A SESSION ID and a TRANSCRIPT NAME are different strings, and this set held both while the lookup
  // below asks with a name. Measured: a registry entry `tui-838055f5-…` names a file called
  // `80a43d49-….jsonl`. So registry entries and the pointer contributed values nothing could ever ask
  // for, and only `keepLast` and most-recent — filename-derived on both sides — protected anything.
  // The same mismatch made `inRegistry` permanently false, which is why every session read as an
  // orphan: a report that looked like an explanation and was an artefact of the comparison.
  //
  // One namespace, using the SDK's forward mapping. The inverse cannot exist over a hash
  // (usetheokit/theokit-sdk#577) and is not wanted: every id here is already in hand.
  const transcriptIdOf = (session: string): string =>
    basename(transcriptPath(transcriptRoot(), cwd, session)).replace(/\.jsonl$/, '')
  const protectedIds = new Set<string>([
    ...listed.filter((e) => e.archived !== true).map((e) => transcriptIdOf(e.agentId)),
    ...onDisk.slice(0, keepLast).map((x) => x.id),
  ])
  if (pointer !== undefined) protectedIds.add(transcriptIdOf(pointer))
  if (mostRecent !== undefined) protectedIds.add(mostRecent)

  const candidates: SessionGCCandidate[] = []
  const kept: string[] = []
  for (const { id, mtimeMs } of onDisk) {
    const ageDays = (now() - mtimeMs) / 86_400_000
    if (!protectedIds.has(id) && ageDays > maxAgeDays) {
      // `registryAll` holds SESSION ids and `id` is a transcript name — comparing them directly is
      // what made this field permanently false. Ask the registry in its own vocabulary.
      const inRegistry = [...registryAll].some((agentId) => transcriptIdOf(agentId) === id)
      candidates.push({ id, ageDays, inRegistry })
    } else {
      kept.push(id)
    }
  }

  return { candidates, kept, pointer, mostRecent, total: onDisk.length }
}

async function defaultList(cwd: string): Promise<RegistryEntry[]> {
  const items = await listAgents(cwd)
  return items.map((i) => ({ agentId: i.agentId, archived: i.archived ?? false }))
}

export interface RunSessionGCOptions {
  apply?: boolean
  cwd?: string
  baseDir?: string
  delete?: (id: string) => Promise<void>
  unlink?: (idOrPath: string) => Promise<void>
  readPointer?: (cwd: string) => string | undefined
  readdir?: (dir: string) => { id: string; mtimeMs: number }[]
}

export interface SessionGCResult {
  dryRun: boolean
  removed: string[]
  errors: string[]
}

function resolveApply(plan: SessionGCPlan, opts: RunSessionGCOptions) {
  const cwd = opts.cwd ?? process.cwd()
  const baseDir = opts.baseDir ?? defaultBaseDir()
  const newestNow = (opts.readdir ?? readTranscriptDir)(transcriptDir(cwd, baseDir)).sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id),
  )[0]?.id
  const untouchable = new Set(
    [(opts.readPointer ?? realReadPointer)(cwd), newestNow, plan.pointer, plan.mostRecent].filter(
      (id): id is string => id !== undefined,
    ),
  )
  return {
    del: opts.delete ?? ((id: string) => Agent.delete(id)),
    unlink: opts.unlink ?? ((id: string) => fsp.unlink(transcriptPath(baseDir, cwd, id))),
    untouchable,
  }
}

export async function runSessionGC(
  plan: SessionGCPlan,
  opts: RunSessionGCOptions = {},
): Promise<SessionGCResult> {
  const dryRun = opts.apply !== true
  const removed: string[] = []
  const errors: string[] = []
  if (dryRun) {
    return { dryRun: true, removed: plan.candidates.map((c) => c.id), errors: [] }
  }
  const { del, unlink, untouchable } = resolveApply(plan, opts)

  for (const c of plan.candidates) {
    if (untouchable.has(c.id)) {
      errors.push(
        `${c.id}: refused — the live pointer / most-recent transcript must never be deleted`,
      )
      continue
    }
    try {
      if (c.inRegistry) await del(c.id)
      else await unlink(c.id)
      removed.push(c.id)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        removed.push(c.id)
        continue
      }
      errors.push(`${c.id}: ${(err as Error).message}`)
    }
  }
  return { dryRun: false, removed, errors }
}
