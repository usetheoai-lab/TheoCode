import { expandInstructionImports } from '@theokit/agents/config'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

type WarnFn = (message: string) => void

const MAX_CHARS = 64_000
const SEPARATOR = '\n\n--- project-doc ---\n\n'
/**
 * B-042 / absorbed 2026-08-15 — the `@file.md` expansion now comes from the framework.
 *
 * ~75 lines lived here: the regex, the code-span masking, the `realpath` containment check and the
 * depth/cycle bounds. All four are `expandInstructionImports` in `@theokit/agents/config`, and this
 * copy is where the containment bug B-042 had to be found and fixed by hand.
 *
 * What did NOT move is the WALK. The framework's `loadInstructionTree` descends into subdirectories;
 * this product's convention is the opposite — climb from the working directory to the git root and
 * read the ancestor chain. Two different traversals, and swapping one for the other would change
 * which files load. So the walk below stays ours and the expansion becomes theirs, which is the
 * split that was always correct.
 */
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
      // B-042 — reaching the FILESYSTEM ROOT used to set `rootDir = '/'`, which makes
      // `insideRoot(anything, '/')` true: outside a git repository the confinement did not merely
      // stop working, it permitted reading any file on the machine into the system prompt. With no
      // repository to bound it, the project IS the working directory.
      rootDir = cwd
      break
    }
    dir = parent
  }
  const chainPaths = new Set(chain.flatMap((l) => l.files))

  const found: string[] = []
  for (const level of chain) {
    const visited = new Set(chainPaths)
    const parts = level.files.map((p) =>
      expandInstructionImports({
        text: readFileSync(p, 'utf8').trim(),
        filePath: p,
        rootDir,
        onWarn: warn,
        // Markers stay: they are visible in the model's prompt, and presentation is this product's.
        wrap: (name, content) =>
          `\n--- import: ${name} ---\n${content}\n--- end import ---\n`,
        // Everything the chain already read — otherwise a file the walk loaded AND an import names
        // lands in the prompt twice.
        alreadyLoaded: [...visited],
      }),
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

export const MAX_AGGREGATE = 96_000

const RULE_SEPARATOR = '\n\n---\n\n'

function trimBlocksFromStart(text: string, budget: number): string {
  if (text.length <= budget) return text
  const blocks = text.split(RULE_SEPARATOR)
  while (blocks.length > 0 && blocks.join(RULE_SEPARATOR).length > budget) blocks.shift()
  return blocks.join(RULE_SEPARATOR)
}

function splitProjectDoc(doc: string): { rules: string; agentsMd: string } {
  const i = doc.indexOf(RULE_SEPARATOR)
  if (i < 0) return { rules: '', agentsMd: doc }
  const breakAt = doc.lastIndexOf('\n\n', i)
  return breakAt < 0
    ? { rules: doc, agentsMd: '' }
    : { agentsMd: doc.slice(0, breakAt), rules: doc.slice(breakAt + 2) }
}

function joinProjectDoc(rules: string, agentsMd: string): string {
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
    const { rules, agentsMd } = splitProjectDoc(doc)
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
    doc = joinProjectDoc(truncatedRules, agentsMd)
  }
  if (total() > opts.maxChars) {
    const { rules, agentsMd } = splitProjectDoc(doc)
    const truncatedMd = agentsMd.slice(-Math.max(0, agentsMd.length - (total() - opts.maxChars)))
    if (truncatedMd.length !== agentsMd.length) {
      opts.warn(
        `[instructions] source 'agentsMd' truncated from ${String(agentsMd.length)} to ` +
          `${String(truncatedMd.length)} chars (aggregate budget ${String(opts.maxChars)})`,
      )
    }
    doc = joinProjectDoc(rules, truncatedMd)
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
  const parts = [base]
  if (projectDoc.trim()) {
    parts.push(
      `## Project instructions (from AGENTS.md — follow these for THIS project)\n${projectDoc}`,
    )
  }
  if (surfaceDoc.trim()) {
    parts.push(`## Surface instructions (how THIS run is being driven)\n${surfaceDoc}`)
  }
  return parts.join('\n\n')
}
