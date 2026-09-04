import { join } from 'node:path'

import { loadInstructionTree } from '@theokit/agents/config'

type WarnFn = (message: string) => void

const MAX_CHARS = 64_000
const SEPARATOR = '\n\n---\n\n'

export interface TraversalBudget {
  maxDepth: number
  maxFiles: number
}

const DEFAULT_BUDGET: TraversalBudget = { maxDepth: 32, maxFiles: 2_000 }

/**
 * `.theokit/rules/` — every markdown file under it, assembled into one block of guidance.
 *
 * ## What moved, and why it was never ours
 *
 * This file owned a directory walk (depth ceiling, file ceiling, inode-keyed cycle guard,
 * unreadable-entry tolerance) and a frontmatter parser (`paths:` extraction, unclosed-frontmatter
 * detection). Both are `@theokit/agents/config` now, through `loadInstructionTree`, which returns
 * `{ path, content, scopes, scopesUnreadable }` per file with the frontmatter already handled.
 *
 * The walk was never product knowledge — it answers "how do I read a tree of instruction files
 * without following a symlink loop", the same question in every agent. It lived here because the
 * framework's version could not be asked what a rules folder asks: it matched file NAMES exactly,
 * and a rules folder holds files the user names.
 *
 * ## The four things that had to become true before this could move
 *
 * 1. **The file set.** `fileNames` takes a predicate, so `entry.endsWith('.md')` is expressible.
 * 2. **The order.** A rules folder is not an instruction tree. There the outer file states the rule
 *    and the inner refines it, so files come before subdirectories; here the files are peers and the
 *    contract is one alphabetical pass — the same directory assembling the same prompt on any
 *    machine. `order: 'lexicographic'` is that contract, kept rather than traded away.
 * 3. **The two ceilings.** `budget.maxChars` bounds the WALK, in raw bytes including frontmatter
 *    that never reaches the prompt. `MAX_CHARS` bounds the PROMPT. Passing the second as the first
 *    stops reading early, and the assembled text falls short of its own budget for the wrong reason.
 * 4. **The scope.** `scopes: []` means both "no scope declared" and "a `paths:` we could not read",
 *    and only `scopesUnreadable` separates them — see {@link scopedBlock}.
 *
 * ## What stays, and why
 *
 * The BLOCK FORMAT and the prompt ceiling. `> Applies ONLY to files matching: …` is this product's
 * prompt, read by this product's model; the framework hands over the scopes, and what a scope should
 * SAY is not a decision it can make for us.
 */
export function loadRules(
  cwd: string,
  warn: WarnFn = (m) => process.stderr.write(`${m}\n`),
  budget: TraversalBudget = DEFAULT_BUDGET,
): { text: string; count: number } {
  return loadRulesFrom(cwd, [join('.theokit', 'rules'), CLAUDE_RULES], warn, budget)
}

/**
 * The operator's own rules — `~/.theocode/rules/` (#65).
 *
 * `.theocode` and not `.theokit`, and the difference is not cosmetic: `.theokit/` inside a PROJECT
 * is the framework's directory, but what this product owns in the operator's home is `.theocode/` —
 * where `config.toml`, `auth.json` and `AGENTS.md` already live. A user rule is the operator's file,
 * not the framework's.
 *
 * Read OUTSIDE the trust gate, for the reason `user-agents-md.ts` sets out at length: that gate asks
 * whether this repository's code is trusted, and nobody's home directory is the repository.
 */
export function loadUserRules(
  home: string,
  warn: WarnFn = (m) => process.stderr.write(`${m}\n`),
  budget: TraversalBudget = DEFAULT_BUDGET,
): { text: string; count: number } {
  return loadRulesFrom(home, [join('.theocode', 'rules'), CLAUDE_RULES], warn, budget)
}

/**
 * #72 — the directory a Claude Code repository already keeps its rules in.
 *
 * Read ALONGSIDE ours, never instead: a rules directory is a SET, and Claude Code loads every `.md`
 * under it exactly as this product does under its own. A repository that has both meant both, which
 * is the opposite of the instruction chain — one document steering the agent, where a second one
 * silently shadowing the first is the confusion `THEO.md > AGENTS.md > CLAUDE.md` exists to prevent.
 *
 * Ours is walked FIRST because `loadInstructionTree` documents the order as the caller's, and with
 * additive loading that decides the order in the prompt rather than what gets read at all.
 */
const CLAUDE_RULES = join('.claude', 'rules')

function loadRulesFrom(
  cwd: string,
  roots: readonly string[],
  warn: WarnFn,
  budget: TraversalBudget,
): { text: string; count: number } {
  requirePositiveBudget(budget)

  const tree = loadInstructionTree({
    cwd,
    roots,
    // See § 3 — the walk is bounded by depth and file count, the ceilings this product declares.
    budget: {
      maxDepth: budget.maxDepth,
      maxFiles: budget.maxFiles,
      maxChars: Number.MAX_SAFE_INTEGER,
    },
    // Prefixed, not rewritten. The wording is the framework's — it knows what it refused and why —
    // and the prefix says which subsystem is speaking.
    onWarn: (message) => {
      warn(`[rules] ${message}`)
    },
    fileNames: (entry) => entry.endsWith('.md'),
    order: 'lexicographic',
  })

  const blocks = tree.blocks.map(scopedBlock).filter((block) => block.length > 0)
  return assemble(blocks, warn)
}

/**
 * Join the blocks, and slice at the prompt ceiling.
 *
 * The slice is mid-block on purpose, and it is the behaviour this function inherited: filling the
 * budget beats stopping short of it, because the rules a user wrote are worth more to the model
 * than a tidy boundary.
 *
 * `count` is the number of rules that CONTRIBUTED to the returned text — not the number read. The
 * first attempt at this migration read every block and reported that, so a caller was told "3 rules"
 * while the model saw two. A number describing something the caller cannot see is worse than none.
 */
function assemble(blocks: readonly string[], warn: WarnFn): { text: string; count: number } {
  const full = blocks.join(SEPARATOR)
  if (full.length <= MAX_CHARS) return { text: full, count: blocks.length }

  let consumed = 0
  let count = 0
  for (const block of blocks) {
    if (consumed >= MAX_CHARS) break
    count += 1
    consumed += block.length + (count > 1 ? SEPARATOR.length : 0)
  }

  warn(`[rules] rules block truncated to ${String(MAX_CHARS)} chars (was ${String(full.length)})`)
  return { text: full.slice(0, MAX_CHARS), count }
}

/**
 * How a scope is announced to the model.
 *
 * FAIL CLOSED on a scope that was declared and could not be read. `scopes: []` means two different
 * things — "no scope declared" and "a `paths:` we could not parse" — and only the flag separates
 * them. Rendering the second as unscoped takes a rule written for one subtree and applies it to
 * every file, silently. A dropped rule is one the author notices missing; a widened one is one
 * nobody sees widen.
 */
function scopedBlock(block: {
  readonly content: string
  readonly scopes: readonly string[]
  readonly scopesUnreadable: boolean
}): string {
  if (block.scopesUnreadable) return ''

  const body = block.content.trim()
  if (body.length === 0) return ''
  return block.scopes.length > 0
    ? `> Applies ONLY to files matching: ${block.scopes.join(', ')}\n\n${body}`
    : body
}

function requirePositiveBudget(budget: TraversalBudget): void {
  if (budget.maxDepth <= 0 || budget.maxFiles <= 0) {
    throw new RangeError(
      `invalid traversal budget: maxDepth=${String(budget.maxDepth)}, ` +
        `maxFiles=${String(budget.maxFiles)} — both must be > 0`,
    )
  }
}
