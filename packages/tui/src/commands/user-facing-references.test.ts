/**
 * B-046 — a string the user reads does not cite something that does not exist.
 *
 * Ten command descriptions carried milestone IDs — `(M21)`, `(M39)`, `(M50)` — and this repository
 * has no ROADMAP.md at all, so none of them resolve. A rendered configuration error pointed the
 * user at `docs/CONFIGURATION.md`, and there is no `docs/` directory.
 *
 * These are not comments. They are what the product SAYS, at the moment the user is already looking
 * for help, and each one sends them somewhere that is not there. Internal provenance in a `//`
 * comment is a different thing and is left alone.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../../../..')

/** Every `.ts`/`.tsx` under packages/, as text. */
function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === 'node_modules' || name.name === 'dist') continue
      const p = join(dir, name.name)
      if (name.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(name.name)) out.push({ path: p, text: readFileSync(p, 'utf8') })
    }
  }
  walk(join(ROOT, 'packages'))
  return out
}

/** Lines that are NOT comments — i.e. lines that can end up in front of a user. */
function codeLines(text: string): { n: number; line: string }[] {
  return text
    .split('\n')
    .map((line, i) => ({ n: i + 1, line }))
    .filter(({ line }) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
}

describe('B-046 — user-facing strings cite only what exists', () => {
  it('test_no_user_facing_string_cites_a_milestone', () => {
    // There is no ROADMAP.md in this repository, so no milestone id can resolve. If one is added,
    // this becomes "the milestone exists" rather than "no milestone is cited".
    expect(existsSync(join(ROOT, 'ROADMAP.md')), 'a ROADMAP.md appeared — tighten this test').toBe(
      false,
    )

    const offenders = sources().flatMap(({ path, text }) =>
      codeLines(text)
        .filter(({ line }) => /['"`][^'"`]*\bM\d{1,3}\b[^'"`]*['"`]/.test(line))
        .map(({ n }) => `${path.replace(ROOT, '')}:${String(n)}`),
    )

    expect(offenders, 'a string the user reads cites a milestone that resolves to nothing').toEqual(
      [],
    )
  })

  it('test_every_doc_path_in_a_user_facing_string_resolves', () => {
    const offenders = sources().flatMap(({ path, text }) =>
      codeLines(text).flatMap(({ n, line }) =>
        [...line.matchAll(/['"`][^'"`]*?((?:docs|\.claude)\/[\w./-]+\.md)/g)]
          .filter((m) => !existsSync(join(ROOT, m[1] ?? '')))
          .map((m) => `${path.replace(ROOT, '')}:${String(n)} -> ${m[1] ?? ''}`),
      ),
    )

    expect(offenders, 'the product sent the user to a document that does not exist').toEqual([])
  })
})

/**
 * B-083 — the English-only guard cannot see this one, so a test must.
 *
 * `(use /model <name> para trocar)` reached users while `check-english-only.mjs` printed `clean`.
 * Not a bug in the guard: every word in that sentence is in `/usr/share/hunspell/en_US.dic` —
 * `para` (paragraph/parachute) and `trocar` (a surgical instrument) included — so the rule
 * "Portuguese iff a PT lexicon has it and an EN one does not" declines each word correctly.
 *
 * Word-membership cannot see a sentence built entirely from homographs. This test does not fix
 * that limit; it pins the one line that proved it, so the string cannot come back while the
 * general detector question is still open.
 */
describe('B-083 — the toast the guard could not read', () => {
  it('test_no_user_facing_string_says_para_trocar', () => {
    const offenders = sources().flatMap(({ path, text }) =>
      codeLines(text)
        .filter(({ line }) => /\bpara trocar\b/.test(line))
        .map(({ n }) => `${path.replace(ROOT, '')}:${String(n)}`),
    )

    expect(
      offenders,
      'a Portuguese instruction is rendered to the user; the english-only guard cannot detect it (B-083)',
    ).toEqual([])
  })
})
