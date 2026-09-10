/**
 * B-173 — `/status` must not report the rules as whole after a later ceiling cut them.
 *
 * Two ceilings run in series. `assemble` bounds ONE rules load at `MAX_CHARS` (64,000);
 * `composeInstructions` then bounds the whole persona at `MAX_AGGREGATE` (96,000). Two loads that
 * each fit can compose into a persona that does not, and the second cut is invisible to
 * `rules.truncated`, which was computed by the first.
 *
 * The row this feeds exists FOR that silence: `command-content.ts` says a truncated rules block is
 * silent by construction, "the agent answers normally, having never seen the part that was cut",
 * and cites 74% of the rules dropped in this product's own checkout at v0.7.0.
 *
 * The fix carries the outcome from where the cut already happens rather than moving when the record
 * is published — `baseAgent` runs at `chat.ts:151` and `publishWiring` at `:194`, so the truncation
 * is already done by the time the record is built. An earlier reading of this item had that ordering
 * backwards, from comparing line numbers instead of call order.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MAX_AGGREGATE, composeInstructions } from '../../src/context/index.js'

const realHome = process.env.HOME
const realStateDir = process.env.THEOKIT_HOME

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
  if (realStateDir === undefined) delete process.env.THEOKIT_HOME
  else process.env.THEOKIT_HOME = realStateDir
})

describe('a persona cut by the aggregate ceiling is reported as cut', () => {
  it('test_composing_past_the_aggregate_budget_reports_the_truncation', () => {
    const warnings: string[] = []
    const half = 'x'.repeat(63_000)

    const out = composeInstructions('base', [half, half].join('\n\n'), '', {
      maxChars: MAX_AGGREGATE,
      warn: (m) => warnings.push(m),
    })

    // The callback is the seam the fix uses: it already fires exactly when content is dropped, so
    // nothing needs to recompute the budget to know.
    expect(out.length, 'the aggregate ceiling did not bound the persona').toBeLessThanOrEqual(MAX_AGGREGATE)
    expect(warnings, 'the cut happened and nothing reported it').toHaveLength(1)
    expect(warnings[0]).toMatch(/truncated from \d+ to \d+/)
  })

  it('test_composing_within_the_budget_reports_nothing', () => {
    // Anti-vacuity: without this, a `warn` that fired unconditionally would pass the test above.
    const warnings: string[] = []

    composeInstructions('base', 'a short project document', '', {
      maxChars: MAX_AGGREGATE,
      warn: (m) => warnings.push(m),
    })

    expect(warnings, 'a build within budget reported a truncation').toEqual([])
  })
})

describe('the published record reflects the aggregate cut', () => {
  it('test_the_record_reports_truncation_when_the_persona_was_cut', async () => {
    // Each load fits its own 64,000 ceiling; together with an appended persona they pass the 96,000
    // aggregate. `appendInstructions` carries the bulk because a fresh temp directory is UNTRUSTED,
    // so its rules reach the RECORD (read=2, chars=100,010 — measured) and not the persona. Building
    // the fixture from the record's numbers instead of the persona's is what made the first version
    // of this test green against a build that never truncated.
    const home = mkdtempSync(join(tmpdir(), 'b173-home-'))
    mkdirSync(join(home, '.theokit', 'rules'), { recursive: true })
    writeFileSync(join(home, '.theokit', 'rules', 'r.md'), `# R\n\n${'u'.repeat(50_000)}\n`)

    const cwd = mkdtempSync(join(tmpdir(), 'b173-project-'))

    const { buildChatAgent } = await import('../../src/chat.js')
    let wired: { rules?: { truncated?: boolean } } | undefined
    await buildChatAgent({
      cwd,
      home,
      appendInstructions: 'a'.repeat(50_000),
      onWired: (w: { rules?: { truncated?: boolean } }) => {
        wired = w
      },
    } as never)

    expect(
      wired?.rules?.truncated,
      'the persona was cut by the aggregate ceiling and /status still reports the rules as whole',
    ).toBe(true)
  })
})
