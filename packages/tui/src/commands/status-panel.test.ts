/**
 * `/status` answers "what am I actually running?", and it answered it raggedly.
 *
 * Two defects, both visible in the first render of a fresh session and neither covered by a test:
 *
 *   model:     gpt-5.4                     <- one column left of the other seven
 *   sandbox:    sandbox:workspace-write    <- the column label repeated inside the value
 *
 * The alignment was typed into eight template literals by hand, so it was wrong on arrival and
 * would have drifted again on the next label added. The duplication came from filling a column
 * that already says `sandbox:` with `sandboxLabel`, which carries that prefix for the FOOTER —
 * where it sits in a `·`-joined run of bare values and has to say which knob it is.
 */
import { describe, expect, it, vi } from 'vitest'

import { agentsMdRow, statusPanel } from './command-content.js'
import type { PtysTheInterpreterUses, SessionTheInterpreterUses } from './command-capabilities.js'

function session(over: Partial<ReturnType<SessionTheInterpreterUses['cfg']>> = {}) {
  return {
    attachImages: vi.fn(),
    effort: () => 'medium' as never,
    setEffort: vi.fn(),
    cfg: () => ({
      modelLabel: 'gpt-5.4',
      sandboxLabel: 'sandbox:workspace-write',
      sandboxDetail: 'workspace-write',
      ...over,
    }),
    sessionModel: () => undefined,
    setSessionModel: vi.fn(),
    setModel: vi.fn(),
    session: () => 'tui-1',
  } satisfies SessionTheInterpreterUses
}

const ptys = {
  backend: () => ({ activeSessionCount: () => 0, killAll: vi.fn() }),
} as unknown as PtysTheInterpreterUses

const rows = (body: string): readonly string[] => body.split('\n')

/** Where the value starts on a row — the column the panel is supposed to align on. */
function valueColumn(row: string): number {
  const afterLabel = row.indexOf(':') + 1
  return afterLabel + (row.slice(afterLabel).length - row.slice(afterLabel).trimStart().length)
}

describe('the status panel aligns its values on one column', () => {
  it('test_every_row_starts_its_value_at_the_same_column', () => {
    const columns = rows(statusPanel(session(), 'suggest', () => 'tui-1', ptys).body).map(
      valueColumn,
    )

    expect(
      new Set(columns).size,
      `the value column is ragged: ${JSON.stringify(columns)}. The padding used to be typed into ` +
        'each row by hand, and `model:` sat one column left of the other seven.',
    ).toBe(1)
  })

  it('test_a_longer_label_moves_every_value_together', () => {
    // Anti-vacuity: padding every row to a hard-coded constant would satisfy the test above while
    // still breaking the moment a label outgrows it. This proves the width is COMPUTED.
    const body = statusPanel(session(), 'suggest', () => 'tui-1', ptys).body
    const widest = Math.max(...rows(body).map((r) => r.indexOf(':')))

    expect(
      valueColumn(rows(body)[0] ?? ''),
      'the value column does not clear the widest label',
    ).toBeGreaterThan(widest)
  })
})

describe('the status panel does not repeat a column label inside its value', () => {
  it('test_the_sandbox_row_names_the_mode_once', () => {
    const sandboxRow = rows(statusPanel(session(), 'suggest', () => 'tui-1', ptys).body).find((r) =>
      r.startsWith('sandbox:'),
    )

    expect(sandboxRow, 'the sandbox row vanished').toBeDefined()
    expect(
      (sandboxRow ?? '').match(/sandbox:/g)?.length,
      'the row reads `sandbox:    sandbox:workspace-write` — the panel supplies the label as a ' +
        'column, so the value must not carry it too',
    ).toBe(1)
  })

  it('test_the_sandbox_row_still_carries_the_unenforced_warning', () => {
    // The prefix is what was redundant, not the warning. Dropping `⚠ tool-gating` would remove the
    // one thing that tells a user commands are auto-approved with no confinement behind them.
    const row = rows(
      statusPanel(
        session({ sandboxDetail: 'danger-full-access ⚠ tool-gating' }),
        'full-auto',
        () => 'tui-1',
        ptys,
      ).body,
    ).find((r) => r.startsWith('sandbox:'))

    expect(row).toContain('⚠ tool-gating')
  })
})

/**
 * The `AGENTS.md` row, and the state it exists for.
 *
 * `/skills`, `/mcp` and `/hooks` each report what survived the trust gate. The file that most
 * directly steers the model reported nothing — so on an untrusted directory the agent ran without
 * the rules the repository wrote for it and the screen said nothing at all. Codex puts the same
 * fact on its status panel (`Agents.md: <none>`).
 */
describe('the status panel says what is steering the agent', () => {
  const wired = (agentsMd: { active: string[]; requested: string[]; suppressedByTrust: boolean }) =>
    ({ agentsMd }) as unknown as Parameters<typeof statusPanel>[4]

  const agentsRow = (w?: Parameters<typeof statusPanel>[4]): string =>
    rows(statusPanel(session(), 'suggest', () => 'tui-1', ptys, w).body).find((r) =>
      r.startsWith('agents.md:'),
    ) ?? ''

  it('test_before_the_first_build_it_reports_what_is_on_disk_without_claiming_it_is_loaded', () => {
    // `/status` is what a person runs BEFORE the first turn, which is exactly when there is no
    // wiring record — so the row used to answer `<unknown>` at the only moment it was asked. The
    // walk is a pure read of the disk, so the question does have an answer.
    const row = agentsMdRow(undefined, () => ['/repo/AGENTS.md', '/repo/pkg/AGENTS.md'])

    expect(row, 'the files that would steer the agent are not named').toContain('AGENTS.md')
    expect(row, 'the row does not say the trust gate has not run yet').toContain('not loaded yet')
  })

  it('test_a_repository_with_no_instruction_file_reads_the_same_before_and_after_a_build', () => {
    // Anti-vacuity, and a real equivalence: "the walk found nothing" is the same fact whether or
    // not an agent has been built, so inventing a second wording for it would be noise.
    expect(agentsMdRow(undefined, () => [])).toBe('<none>')
  })

  it('test_an_untrusted_directory_is_reported_as_a_REFUSAL_not_an_absence', () => {
    // The case the row exists for. `<none>` here would tell the user their repository has no
    // AGENTS.md, when in fact it has one and the agent was forbidden to read it.
    const row = agentsRow(
      wired({ active: [], requested: ['/repo/AGENTS.md'], suppressedByTrust: true }),
    )

    expect(row, 'a suppressed chain rendered as an empty one').not.toContain('<none>')
    expect(row).toContain('NOT LOADED')
    expect(row, 'the row does not say how many files were ignored').toContain('1 file')
  })

  it('test_a_repository_with_no_instruction_file_reports_none', () => {
    expect(agentsRow(wired({ active: [], requested: [], suppressedByTrust: false }))).toContain(
      '<none>',
    )
  })

  it('test_loaded_files_are_named', () => {
    const row = agentsRow(
      wired({
        active: ['/repo/AGENTS.md'],
        requested: ['/repo/AGENTS.md'],
        suppressedByTrust: false,
      }),
    )

    expect(row).toContain('AGENTS.md')
    expect(row).not.toContain('<none>')
  })
})
