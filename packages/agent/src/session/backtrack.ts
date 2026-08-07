import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'

import { dirname } from 'node:path'

import { forkTranscript, transcriptPath, transcriptRoot } from '@theokit/agents/persistence'

import { protectedSessions } from './session-ops.js'
import type { SessionRecord } from '@theokit/agents'

const defaultBaseDir = transcriptRoot

let cacheTranscript: { key: string; records: readonly SessionRecord[] } | undefined

function lerTranscript(src: string): readonly SessionRecord[] {
  const st = statSync(src)
  const key = `${src}:${String(st.mtimeMs)}:${String(st.size)}`
  if (cacheTranscript?.key === key) return cacheTranscript.records
  const records = Object.freeze(parseTranscript(readFileSync(src, 'utf8')))
  cacheTranscript = { key, records }
  return records
}



function parseTranscript(raw: string): SessionRecord[] {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)
  const out: SessionRecord[] = []
  for (let i = 0; i < lines.length; i++) {
    try {
      out.push(JSON.parse(lines[i]) as SessionRecord)
    } catch (err) {
      if (i === lines.length - 1) break 
      throw new SyntaxError(`transcript corrupt at line ${i + 1}: ${(err as Error).message}`)
    }
  }
  return out
}

function textOf(record: SessionRecord): string {
  return textBlocks(record).join('')
}

function textBlocks(record: SessionRecord): string[] {
  const content = (record.message?.content ?? []) as ReadonlyArray<{
    type?: unknown
    text?: unknown
  }>
  return content
    .filter(
      (p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string',
    )
    .map((p) => p.text)
}

function isRealUserTurn(record: SessionRecord): boolean {
  if (record.type !== 'user') return false
  const hasText = textBlocks(record).some((t) => t.length > 0)
  if (!hasText) return false
  return !textOf(record).startsWith('[[theokit:goal-continuation]]')
}

export interface TruncationResult {
  prefix: SessionRecord[]
  selectedText: string
}

export function truncateRecordsBeforeUserTurn(
  records: readonly SessionRecord[],
  nth: number,
): TruncationResult {
  let floor = -1
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].type === 'system' && records[i].subtype === 'compact_boundary') {
      floor = i
      break
    }
  }
  const userIdx: number[] = []
  for (let i = floor + 1; i < records.length; i++) {
    if (isRealUserTurn(records[i])) userIdx.push(i)
  }
  if (!Number.isInteger(nth) || nth < 0 || nth >= userIdx.length) {
    throw new RangeError(
      `backtrack: nth=${nth} out of range — ${userIdx.length} user turn(s) in the window`,
    )
  }
  const cut = userIdx[nth]
  return { prefix: records.slice(0, cut), selectedText: textOf(records[cut]) }
}

export interface ForkBeforeResult {
  newId: string
  copied: boolean
  selectedText?: string
}

export function forkSessionBeforeUserTurn(
  srcId: string,
  newId: string,
  nth: number,
  opts: { cwd?: string; baseDir?: string } = {},
): ForkBeforeResult {
  const cwd = opts.cwd ?? process.cwd()
  const dir = opts.baseDir ?? defaultBaseDir()
  const src = transcriptPath(dir, cwd, srcId)
  if (!existsSync(src)) return { newId, copied: false }

  const records = lerTranscript(src)

  const { prefix, selectedText } = truncateRecordsBeforeUserTurn(records, nth)

  const dst = transcriptPath(dir, cwd, newId)
  mkdirSync(dirname(dst), { recursive: true })
  forkTranscript(src, dst, {
    beforeRecordIndex: prefix.length,
    liveSessionPaths: protectedSessions(cwd, dir),
  })
  return { newId, copied: true, selectedText }
}

export function countUserTurnsInWindow(records: readonly SessionRecord[]): number {
  let floor = -1
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].type === 'system' && records[i].subtype === 'compact_boundary') {
      floor = i
      break
    }
  }
  let n = 0
  for (let i = floor + 1; i < records.length; i++) if (isRealUserTurn(records[i])) n++
  return n
}


export function userTurnPreviews(records: readonly SessionRecord[]): string[] {
  let floor = -1
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].type === 'system' && records[i].subtype === 'compact_boundary') {
      floor = i
      break
    }
  }
  const previews: string[] = []
  for (let i = floor + 1; i < records.length; i++) {
    if (isRealUserTurn(records[i])) previews.push(textOf(records[i]))
  }
  return previews
}


async function lerTranscriptAsync(src: string): Promise<readonly SessionRecord[]> {
  const { stat, readFile } = await import('node:fs/promises')
  const st = await stat(src)
  const key = `${src}:${String(st.mtimeMs)}:${String(st.size)}`
  if (cacheTranscript?.key === key) return cacheTranscript.records
  const records = Object.freeze(parseTranscript(await readFile(src, 'utf8')))
  cacheTranscript = { key, records }
  return records
}

export async function readUserTurnPreviewsAsync(
  sessionId: string,
  opts: { cwd?: string; baseDir?: string } = {},
): Promise<string[]> {
  const cwd = opts.cwd ?? process.cwd()
  const dir = opts.baseDir ?? defaultBaseDir()
  const src = transcriptPath(dir, cwd, sessionId)
  const { access } = await import('node:fs/promises')
  try {
    await access(src)
  } catch {
    return []
  }
  return userTurnPreviews(await lerTranscriptAsync(src))
}
