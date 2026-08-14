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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { encodeProjectDir } from '@theokit/agents/persistence'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LiveSessionDeletionError, deleteSession, protectedSessions } from './session-ops.js'

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

  it('test_an_ACTIVE_WRITER_LEASE_protects_a_transcript_that_is_neither', async () => {
    // The third category, and the reason this migration was worth making.
    //
    // This file used to carry a comment explaining that the category was UNREACHABLE here:
    // `listAgents` is async and both callers are synchronous write paths, so covering it would
    // have made two write paths async. `protectedTranscripts` (M71) resolves it through the SDK's
    // writer LEASE instead of the async registry — synchronously — so the constraint no longer
    // applies.
    //
    // The assertion is deliberately over a transcript that is NEITHER the pointer NOR the most
    // recent: those two were already protected, so a test using one of them would pass against the
    // old implementation and prove nothing about what changed.
    const { acquireSessionWriter } = await import('@theokit/agents/persistence')
    const leased = writeTranscript('leased', 3600) // old, and not pointed at
    writeTranscript('newest', 5) // the most recent, so `leased` is protected only by its lease

    // Anti-vacuity, in the same test: WITHOUT the lease this transcript is collectable. That is the
    // assertion the old implementation would satisfy, and it is what makes the one below meaningful
    // instead of true-by-construction.
    expect(protectedSessions(cwd, base)).not.toContain(leased)

    const lease = await acquireSessionWriter(leased)
    try {
      expect(
        protectedSessions(cwd, base),
        'a transcript with a live writer lease was collectable — the category this file previously ' +
          'documented as out of reach',
      ).toContain(leased)
    } finally {
      await (lease as { release?: () => Promise<void> }).release?.()
    }
  })

  it('test_the_pointer_and_the_most_recent_are_not_duplicated', () => {
    writeTranscript('only-one', 5)
    mkdirSync(join(cwd, '.theokit'), { recursive: true })
    writeFileSync(join(cwd, '.theokit', 'tui-session'), 'only-one\n')

    expect(protectedSessions(cwd, base)).toHaveLength(1)
  })
})

/**
 * B-078 — deletion removes the transcript, not just the listing.
 *
 * `Agent.archive` only flips a flag: `/sessions` still lists the session, suffixed `(archived)`, and
 * the transcript stays on disk. So a session that captured a pasted credential could not be removed
 * through the product at all.
 *
 * The trap this pins was MEASURED in the SDK, not guessed: `Agent.delete` is
 * `removeRegisteredAgent(agentId); await flushRegistrySaves()` — an in-memory registry delete plus a
 * save. It never touches the file. Calling it alone would empty the listing and leave the transcript
 * exactly where it was, which is the failure mode that reads as success.
 *
 * The live-session guard reuses `protectedSessions`, the same set `forkSession` already refuses to
 * overwrite (B-003) — deleting the transcript a running TUI is appending to is worse than forking
 * onto it.
 */
describe('B-078 — deleteSession', () => {
  it('test_removes_the_transcript_from_disk', async () => {
    // A NEWER transcript must exist, or the target is the most recent one and the live guard
    // correctly refuses it. The first draft of this test omitted it and read as a product failure.
    const path = writeTranscript('tui-doomed', 500)
    writeTranscript('tui-current', 1)
    expect(existsSync(path)).toBe(true)

    const result = await deleteSession('tui-doomed', {
      cwd,
      baseDir: base,
      removeFromRegistry: async () => {},
    })

    expect(result.transcriptRemoved).toBe(true)
    expect(existsSync(path), 'the transcript survived a delete that reported success').toBe(false)
  })

  it('test_removes_the_registry_entry_too', async () => {
    writeTranscript('tui-doomed', 500)
    writeTranscript('tui-current', 1)
    const removed: string[] = []

    await deleteSession('tui-doomed', {
      cwd,
      baseDir: base,
      removeFromRegistry: async (id) => {
        removed.push(id)
      },
    })

    // Both halves or neither: a transcript gone from disk while the registry still lists it leaves a
    // session that cannot be opened and cannot be removed.
    expect(removed).toEqual(['tui-doomed'])
  })

})

/** The guard half — separated so each block stays readable, not to dodge the length rule. */
describe('B-078 — deleteSession refuses a live session', () => {
  it('test_refuses_to_delete_a_live_session', async () => {
    // The newest transcript is the one a running TUI is most likely still appending to.
    writeTranscript('tui-old', 5000)
    const live = writeTranscript('tui-live', 1)

    await expect(
      deleteSession('tui-live', { cwd, baseDir: base, removeFromRegistry: async () => {} }),
    ).rejects.toThrow(LiveSessionDeletionError)

    expect(existsSync(live), 'a refused delete still removed the file').toBe(true)
  })

  it('test_refusing_leaves_the_registry_untouched', async () => {
    // Order matters: removing the registry entry and THEN refusing would leave the session
    // unreachable and undeletable — worse than either outcome alone.
    writeTranscript('tui-old', 5000)
    writeTranscript('tui-live', 1)
    const removed: string[] = []

    await expect(
      deleteSession('tui-live', {
        cwd,
        baseDir: base,
        removeFromRegistry: async (id) => {
          removed.push(id)
        },
      }),
    ).rejects.toThrow(LiveSessionDeletionError)

    expect(removed).toEqual([])
  })

  it('test_a_missing_transcript_is_reported_not_invented', async () => {
    // The registry can outlive the file. Deleting must still clear the entry, and must SAY the file
    // was already gone rather than claim it removed one.
    writeTranscript('tui-other', 5000)
    const removed: string[] = []

    writeTranscript('tui-current', 1)
    const result = await deleteSession('tui-ghost', {
      cwd,
      baseDir: base,
      removeFromRegistry: async (id) => {
        removed.push(id)
      },
    })

    expect(result.transcriptRemoved).toBe(false)
    expect(removed).toEqual(['tui-ghost'])
  })
})
