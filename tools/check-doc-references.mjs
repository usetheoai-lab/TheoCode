/**
 * Every repository path the README cites resolves — or is deliberately ignored.
 *
 * B-134 was a citation to `docs/adr/0002-cycle-artifacts-are-promoted-to-docs.md`, offered as the
 * record of a decision. The file did not exist, was not tracked, and was not gitignored — so a
 * reader who cloned and asked why the toolchain was absent was sent to a document they could not
 * open. It was fixed by hand, and nothing stopped the next one.
 *
 * That is the shape B-150 named: a guarantee written into a Definition of Done is not a gate. This
 * is the gate.
 *
 * A path that IS gitignored passes. `.claude/` is local by design, and citing it is a deliberate
 * choice about what the reader can see — different from a citation that resolves to nothing.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'

/**
 * Paths the README DESCRIBES rather than cites, with the reason each is here.
 *
 * The distinction is real and the gate cannot see it: a citation says "the record is there", while a
 * description says "a file of this name plays this role". Getting it wrong in the permissive
 * direction is what B-134 was; getting it wrong in the strict direction makes the gate unusable and
 * it gets removed. Each entry names why, because an unexplained exemption is how a guard rots.
 */
const DESCRIBED_NOT_CITED = new Map([
  [
    'AGENTS.md',
    'the instruction file an operator may put in THEIR project — described in the configuration ' +
      'table, not a record in this repository',
  ],
])

/** Backticked paths that look like repository files, not URLs, globs or shell fragments. */
const PATH_RE = /`([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:md|ts|tsx|mjs|cjs|json|yaml|yml|toml))`/g

export function citedPaths(markdown) {
  return [...new Set([...markdown.matchAll(PATH_RE)].map((m) => m[1]))]
}

export function isIgnored(path, runGit = (args) => execFileSync('git', args, { encoding: 'utf8' })) {
  try {
    runGit(['check-ignore', '-q', path])
    return true
  } catch {
    return false
  }
}

/**
 * A cited path is dangling when it neither exists on disk nor is deliberately ignored.
 *
 * `exists` and `ignored` are injected so the rule can be tested without a filesystem — the guard
 * that has no test is the one that reports clean over anything.
 */
export function danglingReferences(paths, { exists = existsSync, ignored = isIgnored } = {}) {
  return paths.filter((p) => !DESCRIBED_NOT_CITED.has(p) && !exists(p) && !ignored(p))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const quiet = process.argv.includes('--quiet')
  const file = 'README.md'
  const dangling = danglingReferences(citedPaths(readFileSync(file, 'utf8')))
  if (dangling.length > 0) {
    process.stderr.write(
      `${file} cites ${String(dangling.length)} path(s) that neither exist nor are ignored:\n` +
        dangling.map((p) => `  ${p}\n`).join('') +
        'A citation that resolves to nothing reads as a record that exists (B-134).\n',
    )
    process.exit(1)
  }
  if (!quiet) process.stdout.write(`${file}: every cited path resolves or is deliberately ignored\n`)
}
