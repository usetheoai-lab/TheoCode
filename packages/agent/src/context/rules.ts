import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

type WarnFn = (message: string) => void
type ReadFile = (path: string) => string

const MAX_CHARS = 64_000
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface TraversalBudget {
  maxProfundidade: number
  maxFiles: number
}

const DEFAULT_BUDGET: TraversalBudget = { maxProfundidade: 32, maxFiles: 2_000 }

export function varrerMarkdownComGuardas(
  dir: string,
  orc: TraversalBudget = DEFAULT_BUDGET,
  warn: WarnFn = () => {},
): string[] {
  const acc: string[] = []
  descer(dir, { orc, warn, vistos: new Set(), acc }, 0)
  return acc
}

function jaVisitado(dir: string, vistos: Set<string>, warn: WarnFn): boolean {
  try {
    const st = statSync(dir)
    const key = `${String(st.dev)}:${String(st.ino)}`
    if (vistos.has(key)) {
      warn(`[rules] ${dir}: já visitado (mesmo inode) — ciclo interrompido`)
      return true
    }
    vistos.add(key)
  } catch {
    // Ver o docblock: seguir sem key é a decisão, e os tetos garantem a terminação.
  }
  return false
}

interface WalkState {
  readonly orc: TraversalBudget
  readonly warn: WarnFn
  readonly vistos: Set<string>
  readonly acc: string[]
}

function descer(dir: string, st: WalkState, profundidade: number): void {
  if (profundidade > st.orc.maxProfundidade) {
    st.warn(
      `[rules] ${dir}: profundidade máxima de ${String(st.orc.maxProfundidade)} atingida — descida interrompida`,
    )
    return
  }
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  if (jaVisitado(dir, st.vistos, st.warn)) return
  for (const entry of entries.sort()) {
    if (st.acc.length >= st.orc.maxFiles) {
      st.warn(
        `[rules] ${dir}: teto de ${String(st.orc.maxFiles)} arquivos atingido — varredura interrompida`,
      )
      return
    }
    absorbInput(join(dir, entry), entry, st, profundidade)
  }
}

function absorbInput(
  full: string,
  entry: string,
  st: WalkState,
  profundidade: number,
): void {
  try {
    if (statSync(full).isDirectory()) {
      descer(full, st, profundidade + 1)
    } else if (entry.endsWith('.md')) {
      st.acc.push(full)
    }
  } catch {
    // entrada inalcançável — o mesmo desfecho de não a ter encontrado
  }
}

function escopoDoFrontmatter(yamlBruto: string, file: string, warn: WarnFn): string[] | undefined {
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
  const paths = fm === null ? [] : escopoDoFrontmatter(fm[1] ?? '', file, warn)
  if (paths === undefined) return undefined
  const trimmed = (fm === null ? raw : raw.slice(fm[0].length)).trim()
  if (trimmed.length === 0) return undefined
  return paths.length > 0
    ? `> Applies ONLY to files matching: ${paths.join(', ')}\n\n${trimmed}`
    : trimmed
}

function requirePositiveBudget(budget: TraversalBudget): void {
  if (budget.maxProfundidade <= 0 || budget.maxFiles <= 0) {
    throw new RangeError(
      `orçamento de travessia inválido: maxProfundidade=${String(budget.maxProfundidade)}, ` +
        `maxArquivos=${String(budget.maxFiles)} — ambos precisam ser > 0`,
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
