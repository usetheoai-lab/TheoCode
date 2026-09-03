/**
 * Tests for the dangling-reference guard.
 *
 * B-151 — the guard exists because B-134 was a README citation to a file that did not exist, was not
 * tracked, and was not ignored, offered as the record of a decision. It was fixed by hand and
 * nothing stopped the next one — and the next one arrived within the hour, in the section written to
 * fix a sibling finding.
 *
 * Two of these are anti-vacuity floors. Without them a guard that flags everything and a guard that
 * flags nothing would both pass, which is how the English-only guard reported clean over 144
 * identifiers.
 */
import { describe, expect, it } from 'vitest'

import { citedPaths, danglingReferences } from './check-doc-references.mjs'

describe('citedPaths', () => {
  it('test_it_finds_a_backticked_repository_path', () => {
    expect(citedPaths('see `docs/adr/0002-thing.md` for why')).toEqual(['docs/adr/0002-thing.md'])
  })

  it('test_it_ignores_prose_and_urls', () => {
    // Anti-vacuity: a matcher that returned everything would satisfy the test above.
    expect(citedPaths('read https://example.com/a.md and `npm test` and `--apply`')).toEqual([])
  })

  it('test_it_does_not_repeat_a_path_cited_twice', () => {
    expect(citedPaths('`a/b.ts` and again `a/b.ts`')).toEqual(['a/b.ts'])
  })
})

describe('danglingReferences', () => {
  const never = () => false
  const always = () => true

  it('test_a_path_that_does_not_exist_and_is_not_ignored_is_dangling', () => {
    // The finding, as an assertion: this is exactly B-134's shape.
    expect(danglingReferences(['docs/adr/0002.md'], { exists: never, ignored: never })).toEqual([
      'docs/adr/0002.md',
    ])
  })

  it('test_a_path_that_exists_is_not_dangling', () => {
    expect(danglingReferences(['README.md'], { exists: always, ignored: never })).toEqual([])
  })

  it('test_a_deliberately_ignored_path_is_not_dangling', () => {
    // `.claude/` is local by design. Citing it is a choice about what the reader can see, which is
    // different from a citation that resolves to nothing.
    expect(
      danglingReferences(['.claude/rules/public-copy.md'], { exists: never, ignored: always }),
    ).toEqual([])
  })

  it('test_a_path_the_README_describes_rather_than_cites_is_exempt', () => {
    // `AGENTS.md` is the file an operator may put in THEIR project. The gate cannot tell description
    // from citation, so the exemption is explicit and carries its reason in the source.
    expect(danglingReferences(['AGENTS.md'], { exists: never, ignored: never })).toEqual([])
  })

  it('test_the_exemption_list_does_not_swallow_everything', () => {
    // Anti-vacuity floor on the escape hatch itself: an allowlist that grew to match any path would
    // turn the guard off while leaving it green.
    expect(
      danglingReferences(['AGENTS.md', 'docs/invented.md'], { exists: never, ignored: never }),
    ).toEqual(['docs/invented.md'])
  })
})
