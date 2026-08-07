import { join } from 'node:path'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'

import { dirname } from 'node:path'

import { Agent } from '@theokit/agents'
import { forkTranscript, transcriptPath, transcriptRoot } from '@theokit/agents/persistence'

import { listAgents } from './agent-list.js'
import { readPointerId } from './gc/pointer.js'

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
    `Nenhuma sessão em ${newRoot} (THEOKIT_HOME). ` +
    `Há ${projects.length} projeto(s) com sessões na raiz anterior ${legacyRoot} — ` +
    `desdefina THEOKIT_HOME para voltar a vê-las, ou mova o conteúdo.`
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
export function protectedSessions(cwd: string, baseDir: string): string[] {
  const id = readPointerId(cwd)
  return id === undefined ? [] : [transcriptPath(baseDir, cwd, id)]
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
