/**
 * B-173 — the WIRING arm: what the aggregate ceiling cut reaches the published record.
 *
 * The two halves are unit-tested next door — `context/aggregate-cut-reporting.test.ts` pins what
 * `composeInstructions` reports, `packages/tui/tests/commands/rules-row.test.ts` pins how the row
 * renders it. Both could pass against a product where the number never travels between them,
 * which is exactly the state this item found: the information existed, in a `warn` string, and
 * nothing carried it to the record.
 *
 * So this drives the real `buildChatAgent` against a rule corpus large enough to trip the
 * aggregate ceiling, and reads `onWired`.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { buildChatAgent } from '../src/chat.js'
import type { WiredCapabilities } from '../src/wired-capabilities.js'

/**
 * The build only folds project rules into the persona for a TRUSTED directory, and a fresh
 * temporary one is not. Probed rather than assumed: with the default posture the record still
 * reported 180,403 chars read while the composed prompt received none of them, so nothing was
 * there for the aggregate ceiling to cut and the positive arm failed for the wrong reason.
 */
const TRUSTED = {
  level: 'trusted',
  source: 'store',
  allows: {
    projectConfig: true,
    agentsMd: true,
    hooks: true,
    memory: true,
    mcp: true,
    skills: true,
    subagents: true,
    customCommands: true,
  },
} as never

/** A project whose `.theokit/rules/` holds `blocks` files of `size` chars each. */
function projectWithRules(blocks: number, size: number): string {
  const cwd = mkdtempSync(join(tmpdir(), 'b173-project-'))
  const rules = join(cwd, '.theokit', 'rules')
  mkdirSync(rules, { recursive: true })
  for (let i = 0; i < blocks; i += 1) {
    writeFileSync(join(rules, `r${String(i)}.md`), `# rule ${String(i)}\n\n${'x'.repeat(size)}\n`)
  }
  return cwd
}

async function wiredFor(cwd: string, appendInstructions = ''): Promise<WiredCapabilities | undefined> {
  let seen: WiredCapabilities | undefined
  await buildChatAgent({
    cwd,
    home: mkdtempSync(join(tmpdir(), 'b173-home-')),
    surface: 'headless',
    posture: TRUSTED,
    appendInstructions,
    onWired: (w) => {
      seen = w
    },
  })
  return seen
}

describe('B-173 — the aggregate cut travels from the composer to the record', () => {
  test('a rule corpus over the aggregate ceiling is reported as cut', async () => {
    // The loader's own ceiling caps the rules near 60,000 SOURCE chars, so rules alone never
    // reach the 96,000 aggregate. A surface document pushes the composed persona past it, and
    // `withinBudget` trims the rules FIRST — which is the path this arm exercises.
    const wired = await wiredFor(projectWithRules(30, 6_000), 'S'.repeat(40_000))

    expect(wired?.rules?.aggregateCut).toBeDefined()
    expect(wired?.rules?.aggregateCut?.to).toBeLessThan(wired?.rules?.aggregateCut?.from ?? 0)
  })

  test('two loads that each fit their own ceiling still trip the aggregate one', async () => {
    // The DoD's own scenario, and the honest one — no surface document propping up the total.
    // `bothRuleRoots` reads the project root and the operator root against SEPARATE `MAX_CHARS`
    // budgets (64,000 each), so two corpora can each pass the loader and together hand the
    // composer ~120,000 chars against a 96,000 aggregate. That is the shape a real operator with
    // a large `~/.theokit/rules/` meets on a repository with a large `.theokit/rules/`.
    const cwd = projectWithRules(20, 6_000)
    const home = mkdtempSync(join(tmpdir(), 'b173-home-full-'))
    const userRules = join(home, '.theokit', 'rules')
    mkdirSync(userRules, { recursive: true })
    for (let i = 0; i < 20; i += 1) {
      writeFileSync(join(userRules, `u${String(i)}.md`), `# user ${String(i)}\n\n${'y'.repeat(6_000)}\n`)
    }

    let seen: WiredCapabilities | undefined
    await buildChatAgent({
      cwd,
      home,
      surface: 'headless',
      posture: TRUSTED,
      onWired: (w) => {
        seen = w
      },
    })

    expect(seen?.rules?.aggregateCut).toBeDefined()
    expect(seen?.rules?.aggregateCut?.to).toBeLessThan(seen?.rules?.aggregateCut?.from ?? 0)
  })

  test('a rule corpus that fits carries no aggregate cut at all', async () => {
    // ANTI-VACUITY CONTROL — and the arm that matters most here. The assertion above passes
    // against a build that reports a cut unconditionally; only this one fails it. The previous
    // attempt at this item shipped with that exact mutant alive, after its own plan named it.
    const wired = await wiredFor(projectWithRules(2, 200))

    expect(wired?.rules).toBeDefined()
    expect(wired?.rules?.aggregateCut).toBeUndefined()
  })
})
