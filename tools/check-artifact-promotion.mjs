#!/usr/bin/env node
/**
 * B-064 / ADR 0002 — a cycle artifact must not exist in two homes with two different contents.
 *
 * `docs/` is where an artifact lives once it is worth keeping; `.claude/knowledge-base/` is the
 * working area it is produced in. Both are legitimate. What is not legitimate is the SAME file
 * name in both with divergent bodies, because then "the plan" has two answers and whichever one a
 * reader opens is luck. Measured on 2026-08-10: that had already happened to
 * `english-only-completion-plan.md`, and the stale copy was the one a session resolved as active.
 *
 * Deliberately narrow. It does NOT demand that every working file be promoted: drafts, intake logs
 * and in-flight notes belong in the working area, and a check that demanded promotion of all of
 * them would push people to stop using the working area at all — which is the failure mode this
 * repository already has, one directory over.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

export const PAIRS = [
  ['.claude/knowledge-base/plans', 'docs/plans'],
  ['.claude/knowledge-base/reviews', 'docs/reviews'],
  ['.claude/knowledge-base/adrs', 'docs/adr'],
]

async function markdownIn(dir, readDir) {
  try {
    return (await readDir(dir)).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
}

/**
 * The decision, separated from the process it used to be welded to.
 *
 * Rewritten 2026-09-10: this file ran its whole check at module top level and called
 * `process.exit`, so importing it WAS running it. That is why it shipped without a test while
 * sitting in the `npm run lint` chain that gates every build, and it is the shape the finding
 * objected to: a checker that mis-globs, throws early, or returns 0 over an empty match set passes
 * the gate having inspected nothing. Nobody sees a red build — they see a green one, and the green
 * is read as evidence.
 *
 * `readDir` and `readFileText` are injected for the same reason the eight tested checkers inject
 * theirs: a test must be able to state a tree that MUST fail, and asserting on a real directory
 * would make the test a description of this repository's current contents rather than of the rule.
 */
export async function divergentDuplicates(
  pairs = PAIRS,
  { readDir = readdir, readFileText = (p) => readFile(p, 'utf8') } = {},
) {
  const problems = []
  for (const [working, published] of pairs) {
    const inWorking = await markdownIn(working, readDir)
    const inPublished = new Set(await markdownIn(published, readDir))

    for (const name of inWorking) {
      if (!inPublished.has(name)) continue
      const [a, b] = await Promise.all([
        readFileText(join(working, name)),
        readFileText(join(published, name)),
      ])
      if (a !== b) {
        problems.push(
          `${name}\n` +
            `    working  : ${join(working, name)}\n` +
            `    published: ${join(published, name)}\n` +
            `    The two differ. ${published} is authoritative (ADR 0002) — copy it over the working\n` +
            `    copy, or delete the working copy. A reader who opens the wrong one is reading a\n` +
            `    version of the truth nobody chose.`,
        )
      }
    }
  }
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = await divergentDuplicates()

  if (problems.length > 0) {
    process.stderr.write(
      `\ncheck-artifact-promotion: ${problems.length} artifact(s) exist in both homes and disagree.\n\n`,
    )
    for (const p of problems) process.stderr.write(`  ${p}\n\n`)
    process.exit(1)
  }

  if (!process.argv.includes('--quiet')) {
    process.stdout.write('check-artifact-promotion: no divergent duplicates\n')
  }
}
