/**
 * Characterization of `rules.ts` — 157 LoC that had no test at all (B-103, B-116).
 *
 * These do not assert what the module SHOULD do. They pin what it DOES, today, so that the
 * migration onto `@theokit/sdk/context` has something to be equivalent to. Without them,
 * "behaviourally equivalent" is a claim nobody can check, and the module is consumed by
 * `config/trust-posture.ts` — which decides whether a project's `[[hooks]]` are honoured, and a
 * hook is arbitrary command execution on every tool call (B-086). Getting discovery wrong there is
 * a security change wearing a refactor's clothes.
 *
 * So the cases below deliberately concentrate on the PRODUCT POLICY the SDK's `runDiscovery` may
 * not carry — the traversal budget, the truncation and its warning, the injected `readFile`/`warn`
 * seams, the frontmatter scoping — rather than on the happy path of "it finds markdown files".
 * The happy path is the part any replacement gets right for free.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { loadRules, scanMarkdownWithGuards, type TraversalBudget } from './rules.js'

const sandbox = mkdtempSync(join(tmpdir(), 'rules-char-'))
afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

/** A project root with `.theokit/rules/` populated from `files` (path → content). */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(sandbox, 'proj-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, '.theokit', 'rules', rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  mkdirSync(join(root, '.theokit', 'rules'), { recursive: true })
  return root
}

function collectWarnings(): { warn: (m: string) => void; messages: string[] } {
  const messages: string[] = []
  return { warn: (m) => void messages.push(m), messages }
}

describe('loadRules — what it reads and how it joins', () => {
  it('test_rule_bodies_are_joined_with_a_horizontal_rule', () => {
    const root = project({ 'a.md': 'first rule', 'b.md': 'second rule' })
    const { text, count } = loadRules(root, () => {})

    expect(count).toBe(2)
    // The separator is part of the assembled prompt the model sees, so it is behaviour, not
    // formatting — a replacement that joins with a bare newline changes the prompt.
    expect(text).toBe('first rule\n\n---\n\nsecond rule')
  })

  it('test_the_assembled_order_is_lexicographic', () => {
    // The contract consumers depend on: the same tree assembles the same prompt on any machine.
    //
    // Honest limit, measured rather than assumed: this case CANNOT distinguish the module's
    // explicit `.sort()` from ambient filesystem order. Deleting the sort leaves every case here
    // green, because `readdirSync` on this filesystem already returns entries sorted — checked at
    // 3 and at 40 entries. The assertion still earns its place: it pins the OUTPUT contract, and
    // would catch a replacement that returns directory order on a filesystem where the two differ
    // (APFS, or ext4 with another hash seed). It is simply not a test of the sort call.
    const root = project({ 'z.md': 'last', 'a.md': 'first', 'm.md': 'middle' })
    expect(loadRules(root, () => {}).text).toBe('first\n\n---\n\nmiddle\n\n---\n\nlast')
  })

  it('test_a_missing_rules_directory_yields_nothing_rather_than_throwing', () => {
    // The common case: most projects have no `.theokit/rules/`. It must be silent, not an error.
    const root = mkdtempSync(join(sandbox, 'empty-'))
    const { warn, messages } = collectWarnings()

    expect(loadRules(root, warn)).toEqual({ text: '', count: 0 })
    expect(messages).toEqual([])
  })

  it('test_only_markdown_is_collected', () => {
    const root = project({ 'rule.md': 'kept', 'notes.txt': 'dropped', 'data.json': '{}' })
    expect(loadRules(root, () => {}).text).toBe('kept')
  })

  it('test_nested_directories_are_walked', () => {
    const root = project({ 'top.md': 'top', 'deep/nested/inner.md': 'inner' })
    const { text, count } = loadRules(root, () => {})
    expect(count).toBe(2)
    // `deep/` sorts before `top.md`, and the walk descends before continuing the sweep.
    expect(text).toBe('inner\n\n---\n\ntop')
  })
})

describe('loadRules — frontmatter, which changes what the rule CLAIMS to apply to', () => {
  it('test_a_paths_scope_is_announced_above_the_body', () => {
    // This line is the difference between a rule the model applies everywhere and one it applies to
    // a subset. Losing it in a migration silently widens every scoped rule.
    const root = project({ 'scoped.md': '---\npaths:\n  - "src/**/*.ts"\n  - "*.tsx"\n---\nuse tabs' })

    expect(loadRules(root, () => {}).text).toBe(
      '> Applies ONLY to files matching: src/**/*.ts, *.tsx\n\nuse tabs',
    )
  })

  it('test_frontmatter_without_paths_contributes_only_the_body', () => {
    const root = project({ 'r.md': '---\ntitle: something\n---\nthe body' })
    expect(loadRules(root, () => {}).text).toBe('the body')
  })

  it('test_unclosed_frontmatter_skips_the_rule_and_says_so', () => {
    // Failing open here would feed a half-parsed document into the prompt as if it were a rule.
    const root = project({ 'broken.md': '---\npaths:\n  - x\nno closing fence' })
    const { warn, messages } = collectWarnings()

    expect(loadRules(root, warn)).toEqual({ text: '', count: 0 })
    expect(messages.some((m) => m.includes('frontmatter opened but never closed'))).toBe(true)
  })

  it('test_unparseable_yaml_skips_the_rule_and_says_so', () => {
    const root = project({ 'bad.md': '---\npaths: [unclosed\n---\nbody' })
    const { warn, messages } = collectWarnings()

    expect(loadRules(root, warn).count).toBe(0)
    expect(messages.some((m) => m.includes('failed to parse YAML frontmatter'))).toBe(true)
  })

  it('test_a_rule_whose_body_is_empty_after_frontmatter_is_dropped_silently', () => {
    // Dropped, and NOT warned about — an empty rule is a no-op, not a mistake worth interrupting for.
    const root = project({ 'empty.md': '---\ntitle: x\n---\n   \n' })
    const { warn, messages } = collectWarnings()

    expect(loadRules(root, warn)).toEqual({ text: '', count: 0 })
    expect(messages).toEqual([])
  })

  it('test_non_string_entries_in_paths_are_discarded_rather_than_stringified', () => {
    const root = project({ 'mixed.md': '---\npaths:\n  - "ok.ts"\n  - 42\n  - null\n---\nbody' })
    expect(loadRules(root, () => {}).text).toBe(
      '> Applies ONLY to files matching: ok.ts\n\nbody',
    )
  })
})

describe('loadRules — the seams a caller can inject', () => {
  it('test_readFile_is_the_seam_content_arrives_through', () => {
    // The migration must keep this: `trust-posture.ts` and the tests both rely on being able to
    // supply content without touching the disk.
    const root = project({ 'a.md': 'ON DISK' })
    const { text } = loadRules(root, () => {}, undefined, () => 'INJECTED')
    expect(text).toBe('INJECTED')
  })

  it('test_warn_is_the_seam_diagnostics_arrive_through_and_nothing_reaches_stderr', () => {
    const root = project({ 'broken.md': '---\nunclosed' })
    const { warn, messages } = collectWarnings()
    loadRules(root, warn)
    expect(messages.length).toBeGreaterThan(0)
  })
})

describe('loadRules — the traversal budget', () => {
  it.each([
    ['maxDepth', { maxDepth: 0, maxFiles: 10 }],
    ['maxFiles', { maxDepth: 10, maxFiles: 0 }],
    ['both', { maxDepth: -1, maxFiles: -1 }],
  ])('test_a_non_positive_%s_is_a_typed_RangeError', (_label, budget) => {
    // Fail fast and typed, rather than silently sweeping nothing — a budget of zero that quietly
    // returned an empty rule set would look exactly like a project with no rules.
    const root = project({ 'a.md': 'x' })
    expect(() => loadRules(root, () => {}, budget as TraversalBudget)).toThrow(RangeError)
    expect(() => loadRules(root, () => {}, budget as TraversalBudget)).toThrow(
      /invalid traversal budget/,
    )
  })

  it('test_the_file_ceiling_stops_the_sweep_and_says_where', () => {
    const root = project({ 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' })
    const { warn, messages } = collectWarnings()

    const { count } = loadRules(root, warn, { maxDepth: 32, maxFiles: 2 })

    expect(count).toBe(2)
    expect(messages.some((m) => m.includes('ceiling of 2 files reached'))).toBe(true)
  })

  it('test_the_depth_ceiling_stops_the_descent_and_says_where', () => {
    const root = project({ 'top.md': 'T', 'one/two/deep.md': 'D' })
    const { warn, messages } = collectWarnings()

    const { count } = loadRules(root, warn, { maxDepth: 1, maxFiles: 100 })

    // `one/` is depth 1 and is entered; `one/two/` is depth 2 and is refused.
    expect(count).toBe(1)
    expect(messages.some((m) => m.includes('maximum depth of 1 reached'))).toBe(true)
  })
})

describe('scanMarkdownWithGuards — the cycle guard', () => {
  it('test_a_symlink_loop_is_broken_by_inode_rather_than_by_path', () => {
    // A path-based guard is defeated by two different paths reaching the same directory; this one
    // keys on dev:ino. Without it the walk does not terminate, it merely hits the ceilings — which
    // is termination by accident rather than by design.
    const root = mkdtempSync(join(sandbox, 'cycle-'))
    const inner = join(root, 'inner')
    mkdirSync(inner)
    writeFileSync(join(inner, 'a.md'), 'A')
    symlinkSync(root, join(inner, 'loop'), 'dir')

    const { warn, messages } = collectWarnings()
    const found = scanMarkdownWithGuards(root, { maxDepth: 32, maxFiles: 2_000 }, warn)

    expect(found).toHaveLength(1)
    expect(messages.some((m) => m.includes('already visited (same inode)'))).toBe(true)
  })

  it('test_an_unreadable_directory_is_skipped_without_a_warning', () => {
    // Same outcome as never having found it — the docblock's words, pinned so a replacement that
    // starts warning here does not turn a normal condition into noise.
    const { warn, messages } = collectWarnings()
    expect(scanMarkdownWithGuards(join(sandbox, 'does-not-exist'), undefined, warn)).toEqual([])
    expect(messages).toEqual([])
  })
})

describe('loadRules — truncation at the character ceiling', () => {
  it('test_the_assembled_text_is_sliced_and_the_loss_is_announced', () => {
    // 64_000 chars is the ceiling. Two blocks of 40k each exceed it, and the caller is told rather
    // than silently handed a shortened prompt — a truncation nobody reports is indistinguishable
    // from a rule that was never written.
    const big = 'x'.repeat(40_000)
    const root = project({ 'a.md': big, 'b.md': big, 'c.md': 'never reached' })
    const { warn, messages } = collectWarnings()

    const { text, count } = loadRules(root, warn)

    expect(text.length).toBe(64_000)
    // The third file is not read: the loop breaks once the accumulated length passes the ceiling.
    expect(count).toBe(2)
    expect(messages.some((m) => m.includes('truncated to 64000 chars'))).toBe(true)
  })

  it('test_content_under_the_ceiling_is_returned_whole_and_unannounced', () => {
    // Anti-vacuity for the case above.
    const root = project({ 'a.md': 'y'.repeat(1_000) })
    const { warn, messages } = collectWarnings()

    const { text } = loadRules(root, warn)

    expect(text.length).toBe(1_000)
    expect(messages).toEqual([])
  })
})
