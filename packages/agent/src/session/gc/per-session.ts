import { existsSync, readdirSync, statSync, promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { Agent } from '@theokit/agents'
import { encodeProjectDir, transcriptPath, transcriptRoot } from '@theokit/agents/persistence'

import { listAgents } from '../agent-list.js'
import { readPointerId } from './pointer.js'

const defaultBaseDir = transcriptRoot

export function transcriptDir(cwd: string, baseDir: string = defaultBaseDir()): string {
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
export function readTranscriptDir(dir: string): { id: string; mtimeMs: number }[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ id: f.slice(0, -6), mtimeMs: statSync(join(dir, f)).mtimeMs }))
}

export function resolvePointerId(readFn: () => string): string | undefined {
  let raw: string
  try {
    raw = readFn()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error(
      `cannot read the live-session pointer — refusing to GC (would risk the live session): ${(err as Error).message}`,
    )
  }
  const id = raw.trim()
  return id === '' ? undefined : id
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
  const registryAll = new Set(listed.map((e) => e.agentId))

  const pointer = readPointer(cwd)
  const mostRecent = onDisk[0]?.id
  const protectedIds = new Set<string>([
    ...listed.filter((e) => e.archived !== true).map((e) => e.agentId),
    ...onDisk.slice(0, keepLast).map((x) => x.id),
  ])
  if (pointer !== undefined) protectedIds.add(pointer)
  if (mostRecent !== undefined) protectedIds.add(mostRecent)

  const candidates: SessionGCCandidate[] = []
  const kept: string[] = []
  for (const { id, mtimeMs } of onDisk) {
    const ageDays = (now() - mtimeMs) / 86_400_000
    if (!protectedIds.has(id) && ageDays > maxAgeDays) {
      candidates.push({ id, ageDays, inRegistry: registryAll.has(id) })
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
  const maisRecenteAgora = (opts.readdir ?? readTranscriptDir)(transcriptDir(cwd, baseDir)).sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id),
  )[0]?.id
  const intocaveis = new Set(
    [
      (opts.readPointer ?? realReadPointer)(cwd),
      maisRecenteAgora,
      plan.pointer,
      plan.mostRecent,
    ].filter((id): id is string => id !== undefined),
  )
  return {
    del: opts.delete ?? ((id: string) => Agent.delete(id)),
    unlink: opts.unlink ?? ((id: string) => fsp.unlink(transcriptPath(baseDir, cwd, id))),
    intocaveis,
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
  const { del, unlink, intocaveis } = resolveApply(plan, opts)

  for (const c of plan.candidates) {
    if (intocaveis.has(c.id)) {
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
