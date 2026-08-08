import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

type WarnFn = (message: string) => void
type ReadFile = (path: string) => string

const MAX_CHARS = 64_000
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface TraversalBudget {
  maxDepth: number
  maxFiles: number
}

const DEFAULT_BUDGET: TraversalBudget = { maxDepth: 32, maxFiles: 2_000 }

export function varrerMarkdownComGuardas(
  dir: string,
  budget: TraversalBudget = DEFAULT_BUDGET,
  warn: WarnFn = () => {},
): string[] {
  const acc: string[] = []
  descer(dir, { budget, warn, seen: new Set(), acc }, 0)
  return acc
}

function jaVisitado(dir: string, seen: Set<string>, warn: WarnFn): boolean {
  try {
    const st = statSync(dir)
    const key = `${String(st.dev)}:${String(st.ino)}`
    if (seen.has(key)) {
      warn(`[rules] ${dir}: already visited (same inode) — cycle broken`)
      return true
    }
    seen.add(key)
  } catch {
    // See the docblock: continuing without a key is the decision, and the ceilings guarantee termination.
  }
  return false
}

interface WalkState {
  readonly budget: TraversalBudget
  readonly warn: WarnFn
  readonly seen: Set<string>
  readonly acc: string[]
}

function descer(dir: string, st: WalkState, depth: number): void {
  if (depth > st.budget.maxDepth) {
    st.warn(
      `[rules] ${dir}: maximum depth of ${String(st.budget.maxDepth)} reached — descent stopped`,
    )
    return
  }
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  if (jaVisitado(dir, st.seen, st.warn)) return
  for (const entry of entries.sort()) {
    if (st.acc.length >= st.budget.maxFiles) {
      st.warn(
        `[rules] ${dir}: ceiling of ${String(st.budget.maxFiles)} files reached — sweep stopped`,
      )
      return
    }
    absorbInput(join(dir, entry), entry, st, depth)
  }
}

function absorbInput(
  full: string,
  entry: string,
  st: WalkState,
  depth: number,
): void {
  try {
    if (statSync(full).isDirectory()) {
      descer(full, st, depth + 1)
    } else if (entry.endsWith('.md')) {
      st.acc.push(full)
    }
  } catch {
    // unreachable entry — the same outcome as never having found it
  }
}

function frontmatterScope(yamlBruto: string, file: string, warn: WarnFn): string[] | undefined {
  try {
    const parsed = yaml.load(yamlBruto)
    if (parsed === null || typeof parsed !== 'object') return []
    const p = (parsed as Record<string, unknown>).paths
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : []
  } catch (err) {
    warn(
      `[rules] ${file}: failed to parse YAML frontmatter (${err instanceof Error ? err.message.split('\n')[0] : String(err)}) — rule skipped`,
    )
    return undefined
  }
}

function blocoDeRegra(file: string, raw: string, warn: WarnFn): string | undefined {
  const fm = FRONTMATTER_REGEX.exec(raw)
  if (fm === null && /^---\r?\n/.test(raw)) {
    warn(`[rules] ${file}: frontmatter opened but never closed (missing ---) — rule skipped`)
    return undefined
  }
  const paths = fm === null ? [] : frontmatterScope(fm[1] ?? '', file, warn)
  if (paths === undefined) return undefined
  const trimmed = (fm === null ? raw : raw.slice(fm[0].length)).trim()
  if (trimmed.length === 0) return undefined
  return paths.length > 0
    ? `> Applies ONLY to files matching: ${paths.join(', ')}\n\n${trimmed}`
    : trimmed
}

function requirePositiveBudget(budget: TraversalBudget): void {
  if (budget.maxDepth <= 0 || budget.maxFiles <= 0) {
    throw new RangeError(
      `invalid traversal budget: maxDepth=${String(budget.maxDepth)}, ` +
        `maxFiles=${String(budget.maxFiles)} — both must be > 0`,
    )
  }
}

export function loadRules(
  cwd: string,
  warn: WarnFn = (m) => process.stderr.write(`${m}\n`),
  budget: TraversalBudget = DEFAULT_BUDGET,
  ler: ReadFile = (f) => readFileSync(f, 'utf8'),
): { text: string; count: number } {
  requirePositiveBudget(budget)
  const base = join(cwd, '.theokit', 'rules')
  const blocks: string[] = []
  let acumulado = 0
  let truncou = false
  for (const file of varrerMarkdownComGuardas(base, budget, warn)) {
    if (acumulado > MAX_CHARS) {
      truncou = true
      break
    }
    const bloco = blocoDeRegra(file, ler(file), warn)
    if (bloco === undefined) continue
    blocks.push(bloco)
    acumulado += bloco.length
  }
  const text = blocks.join('\n\n---\n\n')
  if (truncou || text.length > MAX_CHARS) {
    warn(`[rules] rules block truncated to ${MAX_CHARS} chars (was ${text.length})`)
    return { text: text.slice(0, MAX_CHARS), count: blocks.length }
  }
  return { text, count: blocks.length }
}
