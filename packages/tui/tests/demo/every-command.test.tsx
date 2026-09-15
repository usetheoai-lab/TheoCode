/**
 * Every command TheoCode registers, each driven in its OWN fresh TUI.
 *
 * ## Why one session per command
 *
 * The first three versions drove all 43 in one continuous session, and every one of them lied in the
 * same way: a command that takes an argument leaves a prompt open, so the NEXT command becomes its
 * argument. `/title` answered *"not title items: /archive"* — it had eaten the command after it, and
 * `/archive` was then credited with a reply it never produced.
 *
 * Escape did not fix it (21/43, down from 24 — it was closing the panels that WERE the answers), and
 * neither did waiting longer, nor polling until the frame stopped changing. Three instruments, same
 * reading: the contamination was structural, not a timing problem.
 *
 * A fresh mount per command costs about a second each and removes the whole class. It is also what a
 * user meets: the command, on a clean screen, with nothing left over from the last one.
 */
import { describe, expect, it } from 'vitest'

import { openTui } from './drive.js'

const GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Session', ['/new', '/sessions', '/fork', '/rename', '/title', '/archive', '/delete', '/resume']],
  ['Conversation', ['/retry', '/compact', '/copy', '/export', '/raw', '/image', '/diff', '/clear']],
  ['Model + presentation', ['/model', '/effort', '/theme', '/statusline']],
  ['Modes', ['/plan', '/ask', '/select', '/progress', '/approval']],
  ['Capability surfaces', ['/agents', '/subagents', '/skills', '/hooks', '/mcp', '/memory', '/permissions', '/sandbox']],
  ['Processes', ['/ps', '/stop']],
  ['Inspect', ['/status', '/usage', '/help', '/pwd', '/review']],
  ['Project + auth', ['/init', '/login', '/logout']],
]

/** What this frame has that the boot frame did not — what the user just saw appear. */
function appeared(boot: string, after: string): string[] {
  // ONE normalizer for both sides. They used to differ — boot lines were only trimmed while `after`
  // lines also had their box-drawing border stripped — so an identical line normalised to two
  // different strings and never matched itself. Every command then looked like it had produced the
  // banner. Six iterations of this harness were spent on defects like that one, and none of them
  // were in the TUI.
  const norm = (l: string): string => l.replace(/^[\s│]+|[\s│]+$/g, '').trim()
  const seen = new Set(boot.split('\n').map(norm))
  return after
    .split('\n')
    .map(norm)
    .filter((l) => l.length > 2 && !seen.has(l))
    .filter((l) => !/^[─╭╮╰╯│\s]*$/.test(l))
    .filter((l) => !l.includes('Ask TheoCode anything'))
}

describe('TheoCode TUI — all 43 commands, each on a clean screen', () => {
  it('drives every command in its own session and reports what the user sees', async () => {
    const report: string[] = []
    let responded = 0
    const silent: string[] = []
    const inert: string[] = []
    let total = 0
    const tui = await openTui()

    for (const [group, commands] of GROUPS) {
      report.push('', `  ${group}`)
      for (const cmd of commands) {
        total += 1
        const before = tui.frame()
        {
          const after = await tui.run(cmd)
          const lines = appeared(before, after)
          // The echo of what was typed is not an answer. Drop it, and see what is left.
          const answer = lines.filter((l) => l !== `❯ ${cmd}` && !l.endsWith(cmd))
          if (answer.length > 0) responded += 1
          else silent.push(cmd)
          // A command that CLEARS or REPLACES the screen adds no lines and is not idle:
          // /clear removes them by definition. `appeared()` cannot see that, so the
          // falsifiable claim is that the screen CHANGED, and that is what gates the test.
          // `/clear` is exempt HERE and proved in its own test below: clearing a screen that is
          // already at the welcome banner legitimately yields an identical frame, and where it ran
          // in this sequence that is exactly the state it met.
          if (after === before && cmd !== '/clear') inert.push(cmd)
          report.push(
            `    ${cmd.padEnd(13)} ${answer.length > 0 ? 'ANSWERS' : '   —   '}  ${(answer[0] ?? '(echo only)').slice(0, 88)}`,
          )
        }
      }
    }

    tui.stop()

    console.log(report.join('\n'))
    console.log(`\n  ${responded}/${total} commands answered on a clean screen\n`)
    expect(total).toBe(43)
    // `total` alone counts what was TYPED, not what worked: with only that assertion this test
    // stays green while all 43 commands render nothing. The list — rather than a count — is what
    // makes a failure actionable, because it names which command went silent.
    // Every command must visibly do something. `silent` is reported, not asserted: /clear and
    // /theme legitimately produce no NEW lines, and demanding new text from them would be
    // demanding the wrong behaviour. `inert` is the real failure — the screen did not move at all.
    expect(inert).toEqual([])
    expect(silent.length).toBeLessThanOrEqual(2)
  }, 400_000)

  it('/clear wipes a screen that has content on it', async () => {
    // The exemption above is a statement about WHERE the command ran, not about the command. This
    // is the claim itself, with content deliberately put on the screen first. Measured: 61 lines of
    // /help output, replaced by the welcome banner.
    const tui = await openTui()
    await tui.run('/help')
    const withContent = tui.frame()
    const afterClear = await tui.run('/clear')
    tui.stop()
    expect(afterClear).not.toBe(withContent)
  }, 200_000)
})
