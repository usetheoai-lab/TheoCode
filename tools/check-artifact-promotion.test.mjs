/**
 * Tests for the artifact-promotion guard.
 *
 * Why this file exists at all. The guard sits in the `npm run lint` chain, which gates every
 * build, and it had no test — measured 2026-09-10, alongside `check-typed-error-assertions.mjs`
 * and `build-cli.mjs`. That is this repository's own rule inverted: `rules/testing.md` says code
 * without a test works by coincidence, and `packages/` honours it with 198 test files against 239
 * sources. The checkers that ENFORCE the rules were the part exempted.
 *
 * The failure mode is silent and specific. A checker that mis-globs, throws early, or returns 0
 * over an empty match set passes the lint chain having inspected nothing. Nobody sees a red build
 * — they see a green one, and a green build is read as evidence. That is strictly worse than
 * having no checker.
 *
 * So the first test below is the NEGATIVE case: a tree that MUST fail. Without it, a guard that
 * has been quietly turned into a no-op still passes its own suite. The two anti-vacuity floors
 * that follow are the same discipline the doc-reference and English-only guards already apply.
 */
import { describe, expect, it } from 'vitest'

import { divergentDuplicates } from './check-artifact-promotion.mjs'

/** A fake tree: { dir: { file: contents } }. */
const fakeFs = (tree) => ({
  readDir: async (dir) => {
    if (!(dir in tree)) throw new Error(`ENOENT: ${dir}`)
    return Object.keys(tree[dir])
  },
  readFileText: async (path) => {
    const cut = path.lastIndexOf('/')
    const [dir, name] = [path.slice(0, cut), path.slice(cut + 1)]
    if (!tree[dir] || !(name in tree[dir])) throw new Error(`ENOENT: ${path}`)
    return tree[dir][name]
  },
})

const PAIRS = [['work', 'published']]

describe('divergentDuplicates', () => {
  it('test_it_fails_when_the_same_artifact_differs_in_both_homes', async () => {
    // THE negative case. This is the exact defect ADR 0002 was written for: measured on
    // 2026-08-10, `english-only-completion-plan.md` existed in both homes with divergent bodies
    // and a session resolved the stale one as active.
    const io = fakeFs({
      work: { 'plan.md': 'version A\n' },
      published: { 'plan.md': 'version B\n' },
    })
    const problems = await divergentDuplicates(PAIRS, io)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('plan.md')
    expect(problems[0]).toContain('published')
  })

  it('test_it_passes_when_the_two_copies_agree', async () => {
    // Anti-vacuity floor: a guard that flags everything would pass the test above.
    const io = fakeFs({
      work: { 'plan.md': 'same\n' },
      published: { 'plan.md': 'same\n' },
    })
    expect(await divergentDuplicates(PAIRS, io)).toEqual([])
  })

  it('test_a_working_only_draft_is_not_a_violation', async () => {
    // Deliberately narrow, per the guard's own header: drafts and in-flight notes belong in the
    // working area. A check that demanded promotion of all of them would push people to stop
    // using the working area, which is the failure this repository already has one directory over.
    const io = fakeFs({ work: { 'draft.md': 'wip\n' }, published: {} })
    expect(await divergentDuplicates(PAIRS, io)).toEqual([])
  })

  it('test_a_published_only_artifact_is_not_a_violation', async () => {
    const io = fakeFs({ work: {}, published: { 'old.md': 'kept\n' } })
    expect(await divergentDuplicates(PAIRS, io)).toEqual([])
  })

  it('test_a_missing_directory_is_not_a_violation', async () => {
    // Neither home is required to exist. Throwing here would fail the lint chain for every
    // repository that has not created the working area yet.
    const io = fakeFs({})
    expect(await divergentDuplicates(PAIRS, io)).toEqual([])
  })

  it('test_non_markdown_files_are_ignored', async () => {
    const io = fakeFs({
      work: { 'notes.txt': 'A\n' },
      published: { 'notes.txt': 'B\n' },
    })
    expect(await divergentDuplicates(PAIRS, io)).toEqual([])
  })

  it('test_it_reports_every_divergent_pair_not_just_the_first', async () => {
    // Stopping at the first would let a second divergence ride in behind a fixed one, which is
    // the shape of "the gate passed, so it must be clean".
    const io = fakeFs({
      work: { 'a.md': '1\n', 'b.md': '1\n' },
      published: { 'a.md': '2\n', 'b.md': '2\n' },
    })
    expect(await divergentDuplicates(PAIRS, io)).toHaveLength(2)
  })

  it('test_it_checks_every_declared_pair', async () => {
    // A checker that inspects one of three directory pairs and exits 0 is the inert-gate failure
    // this suite exists to catch.
    const io = fakeFs({
      w1: { 'x.md': 'A\n' },
      p1: { 'x.md': 'B\n' },
      w2: { 'y.md': 'A\n' },
      p2: { 'y.md': 'B\n' },
    })
    const problems = await divergentDuplicates([['w1', 'p1'], ['w2', 'p2']], io)
    expect(problems).toHaveLength(2)
  })
})
