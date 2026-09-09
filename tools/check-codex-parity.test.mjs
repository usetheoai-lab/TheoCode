/**
 * Tests for the Codex parity guard.
 *
 * B-158 — `packages/tui/src/commands/codex-names.ts` asserts which Codex commands this product does
 * not implement, and nothing verified that assertion. Measured 2026-09-09 against
 * `@openai/codex@0.153.4`: `recap` was new and `approve` was a rename of `auto-review`, and both
 * answered `unknown command`.
 *
 * The tests that matter here are the ones about a parse that finds nothing. A comparison whose
 * input failed to parse emits an empty list, and an empty list reads as "no drift" on one side and
 * as "everything is missing" on the other. Both are wrong, and neither looks wrong.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEBUG_ONLY,
  parseCodexCommands,
  parseLocalSurface,
  unaccounted,
  floorViolations,
} from './check-codex-parity.mjs'

const REPO = new URL('..', import.meta.url).pathname

describe('parsing the Codex enum', () => {
  it('test_it_parses_a_kebab_cased_variant', () => {
    const src = 'pub enum SlashCommand {\n    AutoReview,\n    Model,\n}'

    expect(parseCodexCommands(src)).toEqual(['auto-review', 'model'])
  })

  it('test_it_honours_a_strum_serialize_override', () => {
    // Codex annotates two variants this way. A parser that only kebab-cases the variant name
    // reports both as unaccounted and is wrong twice.
    const src = [
      'pub enum SlashCommand {',
      '    #[strum(serialize = "sandbox-add-read-dir")]',
      '    SandboxReadDir,',
      '}',
    ].join('\n')

    expect(parseCodexCommands(src)).toEqual(['sandbox-add-read-dir'])
  })

  it('test_it_reads_only_the_enum_body', () => {
    // `description()` below the enum is a match arm full of `SlashCommand::Name =>` pairs. Reading
    // past the closing brace would double every command and hide a real absence behind a duplicate.
    const src = [
      'pub enum SlashCommand {',
      '    Model,',
      '}',
      'impl SlashCommand {',
      '    pub fn description(self) -> &str {',
      '        match self { SlashCommand::Ghost => "not a variant" }',
      '    }',
      '}',
    ].join('\n')

    expect(parseCodexCommands(src)).toEqual(['model'])
  })
})

describe('parsing the local surface', () => {
  it('test_it_reads_both_the_builtin_list_and_the_pointer_map', () => {
    const registry = "  { name: 'diff', description: 'show the diff' },\n"
    const names = "  [\n    'auto-review',\n    { answer: 'it is /review here', listed: true },\n  ],\n"
    const local = parseLocalSurface(registry, names)

    expect([...local.builtin]).toEqual(['diff'])
    expect([...local.pointers]).toEqual(['auto-review'])
  })
})

describe('computing the delta', () => {
  const local = (builtin, pointers) => ({ builtin: new Set(builtin), pointers: new Set(pointers) })

  it('test_it_reports_a_codex_command_absent_from_both_local_surfaces', () => {
    expect(unaccounted(['recap'], local([], []))).toEqual({ missingHere: ['recap'], staleHere: [] })
  })

  it('test_it_reports_a_pointer_naming_a_command_codex_no_longer_has', () => {
    // The reverse direction, and the one that would have caught `auto-review` becoming `approve`.
    expect(unaccounted(['approve'], local([], ['auto-review']))).toEqual({
      missingHere: ['approve'],
      staleHere: ['auto-review'],
    })
  })

  it('test_a_command_in_the_builtin_list_is_accounted_for', () => {
    // Negative case: something accounted for must NOT be reported.
    expect(unaccounted(['diff'], local(['diff'], [])).missingHere).toEqual([])
  })

  it('test_plan_is_not_accounted_for_by_the_presence_of_plugins', () => {
    // EC-3. Membership, never substring: `includes()` would account for plan, ps, raw and cd —
    // every short name in the surface.
    expect(unaccounted(['plan'], local(['plugins'], [])).missingHere).toEqual(['plan'])
  })

  it('test_codex_debug_commands_are_not_reported_as_gaps', () => {
    // ADR-2: excluded by name, so a fourth debug command shows up and a human decides.
    expect(unaccounted([...DEBUG_ONLY], local([], [])).missingHere).toEqual([])
  })
})

describe('the anti-vacuity floors', () => {
  const local = (b, p) => ({ builtin: new Set(b), pointers: new Set(p) })
  const many = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

  it('test_a_codex_parse_that_found_almost_nothing_is_a_violation', () => {
    const v = floorViolations(['model', 'diff'], local(many(46, 'b'), many(24, 'p')))

    expect(v).toHaveLength(1)
    expect(v[0]).toMatch(/2\b.*40/)
  })

  it('test_a_local_parse_that_found_almost_nothing_is_a_violation', () => {
    // EC-1. Without this, a reformatted registry.ts makes every Codex command read as unaccounted:
    // 50+ false positives, a red gate nobody can act on, and a checker deleted from the chain.
    const v = floorViolations(many(53, 'c'), local([], []))

    expect(v).toHaveLength(2)
    expect(v.join(' ')).toMatch(/builtin/)
    expect(v.join(' ')).toMatch(/pointer/)
  })

  it('test_the_real_sources_clear_both_floors', async () => {
    // Positive control on BOTH sides: this fails if either parser breaks.
    const { readFileSync, existsSync } = await import('node:fs')
    const enumPath = join(REPO, 'codex/codex-rs/tui/src/slash_command.rs')
    if (!existsSync(enumPath)) return // the clone is optional; ADR-1

    const codex = parseCodexCommands(readFileSync(enumPath, 'utf8'))
    const parsed = parseLocalSurface(
      readFileSync(join(REPO, 'packages/tui/src/commands/registry.ts'), 'utf8'),
      readFileSync(join(REPO, 'packages/tui/src/commands/codex-names.ts'), 'utf8'),
    )

    expect(floorViolations(codex, parsed)).toEqual([])
    expect(codex.length).toBeGreaterThanOrEqual(40)
    expect(parsed.builtin.size).toBeGreaterThanOrEqual(30)
    expect(parsed.pointers.size).toBeGreaterThanOrEqual(15)
  })
})

describe('the wiring', () => {
  it('test_the_lint_script_invokes_the_parity_checker', async () => {
    // Pillar (a). A checker nothing calls is the exact defect B-158 is about — sixteen checkers ran
    // in this chain and the parity map had none.
    const { readFileSync } = await import('node:fs')
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))

    expect(pkg.scripts.lint).toContain('check-codex-parity')
  })
})

describe('the CLI entry', () => {
  const run = async (root, args = []) => {
    const { execFileSync } = await import('node:child_process')
    try {
      return {
        out: execFileSync(process.execPath, [join(REPO, 'tools/check-codex-parity.mjs'), ...args], {
          encoding: 'utf8',
          env: { ...process.env, CODEX_PARITY_ROOT: root },
        }),
        code: 0,
      }
    } catch (err) {
      return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 }
    }
  }

  const scaffold = () => {
    const root = mkdtempSync(join(tmpdir(), 'parity-'))
    mkdirSync(join(root, 'packages/tui/src/commands'), { recursive: true })
    writeFileSync(
      join(root, 'packages/tui/src/commands/registry.ts'),
      Array.from({ length: 46 }, (_, i) => `  { name: 'b${i}', description: 'x' },`).join('\n'),
    )
    writeFileSync(
      join(root, 'packages/tui/src/commands/codex-names.ts'),
      Array.from({ length: 24 }, (_, i) => `  [\n    'p${i}',\n    { answer: 'x' },\n  ],`).join('\n'),
    )
    return root
  }

  it('test_it_skips_loudly_when_the_codex_checkout_is_absent', async () => {
    const root = scaffold()
    try {
      const { out, code } = await run(root)

      expect(out).toContain('SKIPPED')
      expect(out).toContain('slash_command.rs')
      expect(out).not.toContain('up to date')
      expect(code).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('test_it_skips_when_the_enum_file_is_missing_though_the_clone_exists', async () => {
    // EC-2: the skip keys on the FILE. A restructured clone satisfies a directory check and then
    // throws on the read — a stack trace inside `pnpm lint` instead of the deliberate skip.
    const root = scaffold()
    mkdirSync(join(root, 'codex/codex-rs/tui/src'), { recursive: true })
    try {
      const { out, code } = await run(root)

      expect(out).toContain('SKIPPED')
      expect(out).not.toMatch(/at Object\.|Error:/)
      expect(code).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('test_it_reports_drift_and_exits_non_zero', async () => {
    const root = scaffold()
    mkdirSync(join(root, 'codex/codex-rs/tui/src'), { recursive: true })
    writeFileSync(
      join(root, 'codex/codex-rs/tui/src/slash_command.rs'),
      `pub enum SlashCommand {\n${Array.from({ length: 45 }, (_, i) => `    C${i},`).join('\n')}\n}`,
    )
    try {
      const { out, code } = await run(root)

      expect(code).toBe(1)
      expect(out).toContain('c0')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('test_quiet_prints_nothing_when_there_is_no_drift', async () => {
    // EC-5. `--quiet` suppresses the pleasantry, never the finding.
    const root = scaffold()
    mkdirSync(join(root, 'codex/codex-rs/tui/src'), { recursive: true })
    // A clean state means BOTH directions empty: every Codex command accounted for, and no pointer
    // naming a command Codex does not have. The first draft of this fixture had 24 pointers Codex
    // never declared, so `staleHere` fired and the checker was right to exit 1.
    writeFileSync(
      join(root, 'codex/codex-rs/tui/src/slash_command.rs'),
      `pub enum SlashCommand {\n${[
        ...Array.from({ length: 46 }, (_, i) => `    B${i},`),
        ...Array.from({ length: 24 }, (_, i) => `    P${i},`),
      ].join('\n')}\n}`,
    )
    try {
      const { out, code } = await run(root, ['--quiet'])

      expect(code).toBe(0)
      expect(out.trim()).toBe('')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
