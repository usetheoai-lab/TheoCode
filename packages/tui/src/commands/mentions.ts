import { existsSync, readFileSync } from 'node:fs'

import {
  assertNoSymlinkEscape,
  estimateTokens,
  isForbiddenPath,
  safePathJoin,
} from '@theokit/agents'

const MENTION_RE = /@([^\s]+)/g
const MAX_MENTION_TOKENS = 2000

export const MAX_TOTAL_MENTION_TOKENS = 20_000

export function parseMentions(text: string): string[] {
  return Array.from(text.matchAll(MENTION_RE), (m) => m[1])
}

export interface ResolvedMentions {
  message: string
  attached: string[]
}

export function resolveMentions(text: string, cwd: string): ResolvedMentions {
  const seen = new Set<string>()
  const blocks: string[] = []
  const attached: string[] = []
  let usados = 0
  let naoCouberam = 0

  for (const path of parseMentions(text)) {
    if (seen.has(path)) continue
    seen.add(path)
    try {
      if (isForbiddenPath(path)) continue
      const abs = safePathJoin(cwd, path) 
      assertNoSymlinkEscape(abs, cwd)
      if (!existsSync(abs)) continue
      let content = readFileSync(abs, 'utf8')
      if (estimateTokens(content) > MAX_MENTION_TOKENS) {
        content = `${content.slice(0, MAX_MENTION_TOKENS * 4)}\n…(truncated)`
      }
      const custo = estimateTokens(content)
      if (usados + custo > MAX_TOTAL_MENTION_TOKENS) {
        naoCouberam++
        continue
      }
      usados += custo
      blocks.push(`--- ${path} ---\n${content}`)
      attached.push(path)
    } catch {
      // unresolvable / unsafe mention — skip it silently (the raw @token stays in the message text).
    }
  }

  if (naoCouberam > 0) {
    blocks.push(
      `--- (budget de anexos atingido: ${String(attached.length)} de ` +
        `${String(attached.length + naoCouberam)} arquivos anexados — ${String(naoCouberam)} não ` +
        `couberam em ~${String(MAX_TOTAL_MENTION_TOKENS)} tokens; mencione menos arquivos ou use grep) ---`,
    )
  }

  if (blocks.length === 0) return { message: text, attached: [] }
  return { message: `${text}\n\n[Attached files]\n${blocks.join('\n\n')}`, attached }
}
