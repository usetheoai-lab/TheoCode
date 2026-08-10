import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'

import { dirname } from 'node:path'

import { Agent, TheokitAgentError } from '@theokit/agents'
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

export function legacyRootHint(found: number, legacyRoot: string): string | undefined {
  if (found > 0) return undefined
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

/**
 * B-078 — refusing to delete a session another process is still writing.
 *
 * The same set `forkSession` refuses to overwrite (B-003). Deleting a live transcript is strictly
 * worse than forking onto it: the fork is caught by `wx`, this would not be caught by anything.
 */
export class LiveSessionDeletionError extends TheokitAgentError {
  override readonly name = 'LiveSessionDeletionError'
  readonly agentId: string

  constructor(agentId: string) {
    super(
      `refusing to delete session ${agentId}: its transcript is live — it is either the session ` +
        `this directory points at or the most recently written one, so a TUI is probably still ` +
        `appending to it. Switch to another session (/new) and delete it from there.`,
    )
    this.agentId = agentId
  }
}

export interface DeleteSessionResult {
  /** Whether a transcript file was found and unlinked. False when the registry outlived the file. */
  readonly transcriptRemoved: boolean
}

export interface DeleteSessionOptions {
  cwd?: string
  baseDir?: string
  /**
   * Injected so a test does not mutate the real agent registry. Defaults to `Agent.delete`, which —
   * measured in the SDK, not assumed — is `removeRegisteredAgent()` plus a registry save: it clears
   * the ENTRY and never touches the file. That is exactly why this function exists; calling it alone
   * empties the listing and leaves the transcript on disk, which reads as success.
   */
  removeFromRegistry?: (agentId: string) => Promise<void>
}

/**
 * Permanently delete a session: its registry entry AND its transcript.
 *
 * Order is load-bearing. The live check runs FIRST and throws before anything is mutated, because
 * removing the registry entry and then refusing would leave a session that can be neither opened
 * nor deleted — worse than either outcome on its own.
 */
export async function deleteSession(
  agentId: string,
  opts: DeleteSessionOptions = {},
): Promise<DeleteSessionResult> {
  const cwd = opts.cwd ?? process.cwd()
  const dir = opts.baseDir ?? defaultBaseDir()
  const target = transcriptPath(dir, cwd, agentId)

  if (protectedSessions(cwd, dir).includes(target)) {
    throw new LiveSessionDeletionError(agentId)
  }

  const removeFromRegistry = opts.removeFromRegistry ?? ((id: string) => Agent.delete(id))
  await removeFromRegistry(agentId)

  // `force` reports "already gone" as success; the caller is told which happened through the result
  // rather than through an exception, because a registry entry outliving its file is a normal state
  // (the GC removes transcripts by age) and not an error to raise at a user deleting a session.
  const existed = existsSync(target)
  rmSync(target, { force: true })
  return { transcriptRemoved: existed }
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
