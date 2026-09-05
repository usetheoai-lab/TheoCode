#!/usr/bin/env node
/**
 * Fail when a test asserts that something throws without saying WHAT.
 *
 * `rules/error-handling.md` § 2 requires errors to be explicit and typed. Nothing checked that the
 * TESTS honour it, which is the inverted shape of a defect this repository has paid for before: a
 * principle written down with no mechanism reads exactly like an enforced one.
 *
 * ## What a bare assertion costs
 *
 * `expect(fn).toThrow()` is satisfied by ANY throw — including a `TypeError` from an unrelated null
 * deref. So a test guarding a typed refusal keeps reporting green after that refusal has decayed
 * into a crash, and the decay is invisible precisely where the contract mattered. Measured
 * 2026-09-05: two such assertions in this repository, both guarding fail-loud contracts —
 * `config/memory-default.test.ts` (a non-boolean must be REJECTED, not coerced) and
 * `composition/agent-spec.test.ts` (an unknown tool name must fail at declaration).
 *
 * The upstream `theokit-sdk` gate that inspired this one exists because two of its tests had been
 * typed with the shape of each other's `ZodError`, and only running them revealed it. Its message
 * tells the author to MEASURE which error arrives — which is the half that makes the gate useful
 * rather than merely strict, and is repeated below.
 *
 * ## What it does NOT flag
 *
 * `.not.toThrow()` — there is no error to name when the assertion is that none arrives.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['packages', 'tools']
const TEST = /\.test\.tsx?$/
/** A `toThrow` / `toThrowError` / `rejects.toThrow` with an EMPTY argument list. */
const BARE = /(?<!not\.)\btoThrow(?:Error)?\(\s*\)/

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (TEST.test(entry)) yield path
  }
}

const found = []
for (const root of ROOTS) {
  let exists = true
  try {
    statSync(root)
  } catch {
    exists = false
  }
  if (!exists) continue
  for (const path of files(root)) {
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // A line that only TALKS about the bare form (this file's own prose, or a comment
        // explaining why an assertion was tightened) is not an assertion.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
        if (BARE.test(code)) found.push(`${path}:${i + 1}: ${line.trim().slice(0, 100)}`)
      })
  }
}

if (found.length > 0) {
  process.stderr.write(
    'Assertions that something throws, without saying what:\n\n' +
      found.map((f) => `  ${f}\n`).join('') +
      '\nAny throw satisfies a bare `toThrow()`, so this passes on a crash for an unrelated reason\n' +
      'and keeps passing after the typed refusal it guards has decayed into one.\n\n' +
      'MEASURE which error arrives — run the case and read it — then assert that class or a regex\n' +
      'over its message. Do not infer the type from what the code looks like it should raise.\n',
  )
  process.exit(1)
}

if (!process.argv.includes('--quiet')) process.stdout.write('typed error assertions: clean\n')
