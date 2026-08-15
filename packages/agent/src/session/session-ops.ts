import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'

import { dirname } from 'node:path'

import { Agent, TheokitAgentError } from '@theokit/agents'
import { forkTranscript, transcriptPath, transcriptRoot } from '@theokit/agents/persistence'
import {
  deleteSession as deleteInFramework,
  protectedTranscripts,
} from '@theokit/agents/session'

import { listAgents } from './agent-list.js'

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

  // The transcript removal is the framework's — and not only to avoid a second copy.
  //
  // This used to be `existsSync(target)` followed by `rmSync(target, { force: true })`, reporting
  // the FIRST call's answer. Between the two there is a window: a GC sweep or a second TUI can
  // unlink the file, and the result then claims `transcriptRemoved: true` for a file this call did
  // not remove. `deleteSession` in `@theokit/agents/session` derives the answer from whether its own
  // `rmSync` threw, so what it reports is what happened.
  //
  // `force: true` is honest here rather than a bypass: the live check ran above, BEFORE the registry
  // entry was removed, and it raised this product's typed error. Re-running it now would test a
  // state that this function itself has already changed.
  //
  // A registry entry outliving its file stays a normal state (the GC removes transcripts by age),
  // reported through the result rather than raised at someone deleting a session.
  const { transcriptRemoved } = deleteInFramework(agentId, {
    cwd,
    root: dir,
    force: true,
  })
  return { transcriptRemoved }
}

/**
 * B-003 — what `forkTranscript` refuses to overwrite, and what `deleteSession` refuses to remove.
 *
 * ## The third category, which this file documented as unreachable
 *
 * The comment this replaces named the SDK's three categories — live pointer, most recent transcript,
 * active registry entry — covered two, and explained the omission: *"`listAgents` is async and both
 * callers are synchronous write paths, so including it would turn two write paths async for a guard
 * that is already backstopped."* The stated cost was losing the typed `LiveSessionError` in favour
 * of a bare `EEXIST` — not losing the protection.
 *
 * `protectedTranscripts` (M71) covers that third category SYNCHRONOUSLY, through the SDK's writer
 * lease instead of the async registry. The constraint that forced the omission does not apply to it,
 * so the guard is complete now and neither caller became async.
 *
 * It also carries the REASON per session (`'resumable session pointer'`, `'most recent session'`,
 * `'active writer lease'`) — which is what a refusal needs to say. This projection drops it because
 * both callers here take paths; anything wanting the reason calls the primitive directly.
 */
export function protectedSessions(cwd: string, baseDir: string): string[] {
  return [...protectedTranscripts(cwd, baseDir).keys()].map((id) =>
    transcriptPath(baseDir, cwd, id),
  )
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
