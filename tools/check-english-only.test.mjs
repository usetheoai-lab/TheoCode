/**
 * Tests for the English-only guard.
 *
 * The guard is the instrument this whole engagement is about, and until now it had none. It
 * reported `clean` over 144 Portuguese identifiers, and every fix to it was verified by running it
 * once and reading the output — which is exactly how the denylist survived four extensions.
 *
 * Two of these tests are anti-vacuity floors. Without them, a guard that flags everything and a
 * guard that flags nothing would both pass.
 */
import { describe, expect, it } from 'vitest'

import { isPortuguese, portugueseWordsInFilename, wordParts } from './check-english-only.mjs'

describe('T0.1 — a Portuguese filename is a violation', () => {
  it('test_a_portuguese_filename_is_flagged', () => {
    // The gap this closes: `hooks-para-membro.ts` shipped for months and was found by a human
    // reading the tree, not by any detector. Every detector reads file CONTENTS; a path is
    // written text under the same rule.
    //
    // Only `membro` is returned, and that is correct: `para` is in `/usr/share/hunspell/en_US.dic`
    // (English "para", as in parachute/paragraph), so it is a genuine EN/PT collision the lexicon
    // test must clear — the same class as `cli` (to click) and `repo` (cabbage). One flagged word
    // is enough to flag the path, which is what the guard needs.
    expect(portugueseWordsInFilename('packages/agent/src/delegation/hooks-para-membro.ts')).toEqual([
      'membro',
    ])
  })

  it('test_an_english_filename_is_not_flagged', () => {
    // ANTI-VACUITY FLOOR: returning every word would satisfy the assertion above.
    expect(portugueseWordsInFilename('packages/tui/src/terminal-io/input-router.ts')).toEqual([])
  })

  it('test_the_file_extension_is_never_treated_as_a_word', () => {
    // `ts`/`tsx`/`mjs` must not enter the word stream. They are currently below the 3-char floor,
    // which makes passing accidental — this pins it against a future floor change.
    const words = portugueseWordsInFilename('a/instrucao.tsx')
    expect(words).toContain('instrucao')
    expect(words).not.toContain('tsx')
  })
})

describe('T0.1 / M4 — KNOWN_PORTUGUESE matches whole words only', () => {
  it('test_the_portuguese_singular_is_flagged', () => {
    // `índice` — present in no installed lexicon and matching no suffix rule, which is why it
    // survived in hooks.ts after the package was declared clean.
    expect(isPortuguese('indice')).toBe(true)
  })

  it('test_the_english_plural_of_index_is_not_flagged', () => {
    // ANTI-VACUITY FLOOR and the reason the match is exact rather than substring: `indices` is
    // the English plural and appears legitimately in packages/agent/src/session/backtrack.ts.
    // A substring rule would flag correct English and get the whole mechanism deleted.
    expect(isPortuguese('indices')).toBe(false)
  })
})

describe('T0.1 — the lexicon test decides by dictionary, not by a word list', () => {
  it('test_a_portuguese_word_absent_from_english_is_flagged', () => {
    expect(isPortuguese('padrao')).toBe(true)
    expect(isPortuguese('endurecendo')).toBe(true)
  })

  it('test_an_english_word_is_not_flagged', () => {
    // ANTI-VACUITY FLOOR for the assertion above.
    expect(isPortuguese('default')).toBe(false)
    expect(isPortuguese('window')).toBe(false)
  })

  it('test_an_english_term_that_collides_with_a_portuguese_word_is_not_flagged', () => {
    // `cli` is "to click", `repo` is "cabbage", `todo` is "all", `num` is "in the". All four are
    // real Portuguese dictionary entries, so the lexicon test alone cannot clear them.
    for (const w of ['cli', 'repo', 'todo', 'num']) expect(isPortuguese(w)).toBe(false)
  })
})

describe('T0.1 — identifiers are split before they are judged', () => {
  it('test_camel_case_is_split_into_words', () => {
    expect([...wordParts('varrerMarkdownComGuardas')]).toEqual([
      'varrer',
      'markdown',
      'com',
      'guardas',
    ])
  })

  it('test_screaming_snake_case_is_split_into_words', () => {
    expect([...wordParts('THREAD_PADRAO')]).toEqual(['thread', 'padrao'])
  })
})
