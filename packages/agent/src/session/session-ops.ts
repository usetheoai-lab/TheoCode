import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'

import { dirname } from 'node:path'

import { Agent } from '@theokit/agents'
import { forkTranscript, transcriptPath, transcriptRoot } from '@theokit/agents/persistence'

import { listAgents } from './agent-list.js'
import { readPointerId } from './gc/pointer.js'
import { readTranscriptDir, transcriptDir } from './gc/per-session.js'

const defaultBaseDir = transcriptRoot

export interface SessionInfo {
  agentId: string
  name?: string
  archived: boolean
  lastModified?: number
}

export async function listSessions(cwd: string = process.cwd()): Promise<SessionInfo[]> {
  const items = await listAgents(cwd)
  return items
    .filter((i) => i.agentId.startsWith('tui-'))
    .map((i) => ({
      agentId: i.agentId,
      name: i.name,
      archived: i.archived ?? false,
      lastModified: i.lastModified,
    }))
}

export function legacyRootHint(encontradas: number, legacyRoot: string): string | undefined {
  if (encontradas > 0) return undefined
  const newRoot = process.env.THEOKIT_HOME?.trim()
  if (newRoot === undefined || newRoot.length === 0) return undefined
  if (newRoot === legacyRoot) return undefined
  let projects: string[]
  try {
    projects = readdirSync(join(legacyRoot, 'projects'))
  } catch {
    return undefined
  }
  if (projects.length === 0) return undefined
  return (
    `No sessions in ${newRoot} (THEOKIT_HOME). ` +
    `There are ${projects.length} project(s) with sessions under the previous root ${legacyRoot} — ` +
    `unset THEOKIT_HOME to see them again, or move the contents.`
  )
}

export function archiveSession(agentId: string): Promise<void> {
  return Agent.archive(agentId)
}

export function renameSession(agentId: string, name: string): Promise<void> {
  return Agent.rename(agentId, name)
}

// B-003 — this list is what `forkTranscript` refuses to overwrite. Swallowing a read error and
// returning `[]` handed the SDK an empty guard, which is the one input that disables its
// `LiveSessionError` entirely. Refusing is the safe direction on a path that writes over transcripts.
//
// The SDK documents three categories: the live pointer, the most recent transcript, and any active
// registry entry. The first two are resolvable synchronously and are covered here. The registry is
// NOT: `listAgents` is async and both callers (`forkSession` and the backtrack fork) are synchronous
// write paths, so including it would turn two write paths async for a guard that is already
// backstopped -- `forkTranscript` opens the destination with `wx`, so an existing transcript cannot
// be overwritten regardless. What the missing category costs is the typed `LiveSessionError` in
// place of a bare EEXIST, not the protection itself.
export function protectedSessions(cwd: string, baseDir: string): string[] {
  const live = new Set<string>()

  const pointed = readPointerId(cwd)
  if (pointed !== undefined) live.add(pointed)

  // The most recent transcript is the session a running TUI is most likely still appending to.
  const newest = readTranscriptDir(transcriptDir(cwd, baseDir)).sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id),
  )[0]?.id
  if (newest !== undefined) live.add(newest)

  return [...live].map((id) => transcriptPath(baseDir, cwd, id))
}

export function forkSession(
  sessionId: string,
  newId: string,
  opts: { cwd?: string; baseDir?: string } = {},
): { newId: string; copied: boolean } {
  const cwd = opts.cwd ?? process.cwd()
  const dir = opts.baseDir ?? defaultBaseDir()
  const src = transcriptPath(dir, cwd, sessionId)
  const dst = transcriptPath(dir, cwd, newId)
  if (!existsSync(src)) return { newId, copied: false }
  mkdirSync(dirname(dst), { recursive: true })
  forkTranscript(src, dst, { liveSessionPaths: protectedSessions(cwd, dir) })
  return { newId, copied: true }
}

export async function compactSession(
  sessionId: string,
): Promise<{ preTokens: number; postTokens: number }> {
  return Agent.compact(sessionId, { trigger: 'manual' })
}
