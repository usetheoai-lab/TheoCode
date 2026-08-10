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

const PAIRS = [
  ['.claude/knowledge-base/plans', 'docs/plans'],
  ['.claude/knowledge-base/reviews', 'docs/reviews'],
  ['.claude/knowledge-base/adrs', 'docs/adr'],
]

async function markdownIn(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
}

const problems = []

for (const [working, published] of PAIRS) {
  const inWorking = await markdownIn(working)
  const inPublished = new Set(await markdownIn(published))

  for (const name of inWorking) {
    if (!inPublished.has(name)) continue
    const [a, b] = await Promise.all([
      readFile(join(working, name), 'utf8'),
      readFile(join(published, name), 'utf8'),
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
