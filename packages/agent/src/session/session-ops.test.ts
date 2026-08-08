/**
 * B-003 — the fork guard is handed every live path it can see.
 *
 * `forkTranscript` accepts `liveSessionPaths`: the paths it must never write over. The SDK documents
 * what belongs there — *"the live pointer, the most recent transcript, any active registry entry"* —
 * and states why the caller supplies them: only the caller knows which session is live.
 *
 * TheoCode supplied one of the three. The most recent transcript is the session a TUI is most likely
 * still appending to, and it was absent, so a fork could target it and the SDK's typed
 * `LiveSessionError` never fired.
 *
 * Residual protection is real and worth naming: `forkTranscript` opens the destination with `wx`, so
 * an existing transcript still cannot be overwritten — the loser gets a bare EEXIST instead of a
 * typed error the callers can tell apart. That is why this was MEDIUM, not HIGH.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { encodeProjectDir } from '@theokit/agents/persistence'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { protectedSessions } from './session-ops.js'

let base: string
let cwd: string

/** Write a transcript for `id` and stamp its mtime so "most recent" is deterministic. */
function writeTranscript(id: string, ageSeconds: number): string {
  const dir = join(base, 'projects', encodeProjectDir(cwd))
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${id}.jsonl`)
  writeFileSync(path, '{}\n')
  const when = new Date(Date.now() - ageSeconds * 1000)
  utimesSync(path, when, when)
  return path
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'theocode-sessops-'))
  cwd = mkdtempSync(join(tmpdir(), 'theocode-proj-'))
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
  rmSync(cwd, { recursive: true, force: true })
})

describe('B-003 — protectedSessions covers what the caller can see', () => {
  it('test_the_live_pointer_is_protected', () => {
    writeTranscript('tui-pointed', 10)
    mkdirSync(join(cwd, '.theokit'), { recursive: true })
    writeFileSync(join(cwd, '.theokit', 'tui-session'), 'tui-pointed\n')

    expect(protectedSessions(cwd, base).some((p) => p.endsWith('tui-pointed.jsonl'))).toBe(true)
  })

  it('test_the_most_recent_transcript_is_protected_even_without_a_pointer', () => {
    writeTranscript('older', 3600)
    writeTranscript('newest', 5)

    expect(
      protectedSessions(cwd, base),
      'the most recent transcript is the one a running session is most likely still appending to, ' +
        'and it was absent from the guard the SDK uses to refuse a fork onto a live session',
    ).toEqual([expect.stringContaining('newest.jsonl')])
  })

  it('test_an_empty_project_protects_nothing', () => {
    // Anti-vacuity floor: a function returning a constant would satisfy the assertions above.
    expect(protectedSessions(cwd, base)).toEqual([])
  })

  it('test_the_pointer_and_the_most_recent_are_not_duplicated', () => {
    writeTranscript('only-one', 5)
    mkdirSync(join(cwd, '.theokit'), { recursive: true })
    writeFileSync(join(cwd, '.theokit', 'tui-session'), 'only-one\n')

    expect(protectedSessions(cwd, base)).toHaveLength(1)
  })
})
