import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const MAX_CHARS = 64_000
const SEPARATOR = '\n\n--- project-doc ---\n\n'
const MAX_IMPORT_DEPTH = 4
const IMPORT_REGEX = /(?<![\w`])@([\w~./-]+\.md)\b/g

type WarnFn = (message: string) => void

function maskCodeSpans(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))
}

function insideRoot(target: string, rootDir: string): boolean {
  const rel = relative(rootDir, target)
  return rel !== '' && !rel.startsWith('..') && !rel.includes('..')
}

function expandableTarget(
  name: string,
  filePath: string,
  rootDir: string,
  visited: ReadonlySet<string>,
  warn: WarnFn,
): string | undefined {
  const target = name.startsWith('~/') ? name : resolve(dirname(filePath), name)
  if (name.startsWith('~/') || !insideRoot(target, rootDir)) {
    warn(
      `[agents-md] ${filePath}: import @${name} resolves outside the project root — kept literal`,
    )
    return undefined
  }
  if (visited.has(target)) return undefined
  if (!existsSync(target)) {
    warn(`[agents-md] ${filePath}: import @${name} not found — kept literal`)
    return undefined
  }
  return target
}

function expandImports(
  text: string,
  filePath: string,
  rootDir: string,
  depth: number,
  visited: Set<string>,
  warn: WarnFn,
): string {
  if (depth > MAX_IMPORT_DEPTH) {
    warn(
      `[agents-md] ${filePath}: import depth cap (${MAX_IMPORT_DEPTH}) reached — deeper imports kept literal`,
    )
    return text
  }
  const masked = maskCodeSpans(text)
  const matches = Array.from(masked.matchAll(IMPORT_REGEX))
  if (matches.length === 0) return text

  const segments: string[] = []
  let cursor = 0
  for (const match of matches) {
    const name = match[1]
    const start = match.index ?? 0
    if (!name) continue
    segments.push(text.slice(cursor, start))
    cursor = start + match[0].length
    const target = expandableTarget(name, filePath, rootDir, visited, warn)
    if (target === undefined) {
      segments.push(match[0]) 
      continue
    }
    visited.add(target)
    const imported = readFileSync(target, 'utf8').trim()
    const expanded = expandImports(imported, target, rootDir, depth + 1, visited, warn)
    segments.push(`\n--- import: ${name} ---\n${expanded}\n--- end import ---\n`)
  }
  segments.push(text.slice(cursor))
  return segments.join('')
}

export function loadAgentsMd(
  cwd: string,
  warn: WarnFn = (m) => process.stderr.write(`${m}\n`),
): string {
  const chain: { dir: string; files: string[] }[] = []
  let dir = cwd
  let rootDir = cwd
  for (;;) {
    const files = ['AGENTS.md', 'AGENTS.local.md']
      .map((f) => join(dir, f))
      .filter((p) => existsSync(p))
    if (files.length > 0) chain.push({ dir, files })
    if (existsSync(join(dir, '.git'))) {
      rootDir = dir
      break
    }
    const parent = dirname(dir)
    if (parent === dir) {
      rootDir = dir
      break
    }
    dir = parent
  }
  const chainPaths = new Set(chain.flatMap((l) => l.files))

  const found: string[] = []
  for (const level of chain) {
    const visited = new Set(chainPaths)
    const parts = level.files.map((p) =>
      expandImports(readFileSync(p, 'utf8').trim(), p, rootDir, 1, visited, warn),
    )
    found.push(parts.filter(Boolean).join(SEPARATOR))
  }

  const joined = found.reverse().filter(Boolean).join(SEPARATOR)
  if (joined.length > MAX_CHARS) {
    warn(
      `[agents-md] instruction chain truncated to ${MAX_CHARS} chars (was ${joined.length}) — root-most content dropped first`,
    )
    return joined.slice(-MAX_CHARS)
  }
  return joined
}

interface AggregateBudget {
  maxChars: number
  warn: (m: string) => void
}

export const MAX_AGREGADO = 96_000

const SEPARADOR_DE_REGRA = '\n\n---\n\n'

function trimBlocksFromStart(text: string, budget: number): string {
  if (text.length <= budget) return text
  const blocos = text.split(SEPARADOR_DE_REGRA)
  while (blocos.length > 0 && blocos.join(SEPARADOR_DE_REGRA).length > budget) blocos.shift()
  return blocos.join(SEPARADOR_DE_REGRA)
}

function separarProjectDoc(doc: string): { rules: string; agentsMd: string } {
  const i = doc.indexOf(SEPARADOR_DE_REGRA)
  if (i < 0) return { rules: '', agentsMd: doc }
  const quebra = doc.lastIndexOf('\n\n', i)
  return quebra < 0
    ? { rules: doc, agentsMd: '' }
    : { agentsMd: doc.slice(0, quebra), rules: doc.slice(quebra + 2) }
}

function juntarProjectDoc(rules: string, agentsMd: string): string {
  return [agentsMd, rules].filter((s) => s.length > 0).join('\n\n')
}

export function composeInstructions(
  base: string,
  projectDoc: string,
  surfaceDoc = '',
  opts?: AggregateBudget,
): string {
  if (opts === undefined) return build(base, projectDoc, surfaceDoc)
  if (opts.maxChars <= 0) {
    throw new RangeError(`maxChars=${String(opts.maxChars)} — the aggregate budget must be > 0`)
  }
  return withinBudget(base, projectDoc, surfaceDoc, opts)
}

function withinBudget(
  base: string,
  projectDoc: string,
  surfaceDoc: string,
  opts: AggregateBudget,
): string {
  let doc = projectDoc
  let surface = surfaceDoc
  const total = (): number => build(base, doc, surface).length

  if (total() > opts.maxChars) {
    const { rules, agentsMd } = separarProjectDoc(doc)
    const truncatedRules = trimBlocksFromStart(
      rules,
      Math.max(0, rules.length - (total() - opts.maxChars)),
    )
    if (truncatedRules.length !== rules.length) {
      opts.warn(
        `[instructions] source 'rules' truncated from ${String(rules.length)} to ` +
          `${String(truncatedRules.length)} chars (aggregate budget ${String(opts.maxChars)})`,
      )
    }
    doc = juntarProjectDoc(truncatedRules, agentsMd)
  }
  if (total() > opts.maxChars) {
    const { rules, agentsMd } = separarProjectDoc(doc)
    const truncatedMd = agentsMd.slice(-Math.max(0, agentsMd.length - (total() - opts.maxChars)))
    if (truncatedMd.length !== agentsMd.length) {
      opts.warn(
        `[instructions] source 'agentsMd' truncated from ${String(agentsMd.length)} to ` +
          `${String(truncatedMd.length)} chars (aggregate budget ${String(opts.maxChars)})`,
      )
    }
    doc = juntarProjectDoc(rules, truncatedMd)
  }
  if (total() > opts.maxChars && surface.length > 0) {
    const before = surface.length
    surface = surface.slice(-Math.max(0, before - (total() - opts.maxChars)))
    opts.warn(
      `[instructions] source 'appendInstructions' truncated from ${String(before)} to ` +
        `${String(surface.length)} chars (aggregate budget ${String(opts.maxChars)})`,
    )
  }
  if (total() > opts.maxChars) {
    opts.warn(
      `[instructions] BASE_INSTRUCTIONS alone exceeds the aggregate budget ` +
        `(${String(total())} > ${String(opts.maxChars)}) — nothing was truncated`,
    )
  }
  return build(base, doc, surface)
}

function build(base: string, projectDoc: string, surfaceDoc: string): string {
  const partes = [base]
  if (projectDoc.trim()) {
    partes.push(
      `## Project instructions (from AGENTS.md — follow these for THIS project)\n${projectDoc}`,
    )
  }
  if (surfaceDoc.trim()) {
    partes.push(`## Surface instructions (how THIS run is being driven)\n${surfaceDoc}`)
  }
  return partes.join('\n\n')
}
