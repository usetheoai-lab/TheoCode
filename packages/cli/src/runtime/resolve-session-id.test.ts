/**
 * `resolveSessionId` decides WHICH SESSION `--resume --last` reopens, and had no test at all.
 *
 * Found by measuring coverage on the files this release touched rather than by reading them:
 * `preflight.ts` sat at 42.85% with lines 66-87 uncovered, and the uncovered half was this entire
 * function — exported, consumed at `commands/run.ts:111`, and deciding which of a user's transcripts
 * a resume lands on. `rules/testing.md` § 3 admits no exception for business logic, and picking the
 * wrong session is not a cosmetic failure: it appends a new turn to somebody else's conversation.
 *
 * The clause worth pinning hardest is `a.cwd === undefined`. A registry entry with no recorded
 * working directory is treated as belonging to THIS one — deliberate, because entries predating the
 * cwd field must stay resumable, and load-bearing, because it is also the one path by which a
 * session started elsewhere can be reopened here. A test is the only thing that keeps that a
 * decision rather than an accident.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const listAgents = vi.fn()

class CursorNotDrainedError extends Error {}

vi.mock('@theocode/agent/session', () => ({
  listAgents: (...args: unknown[]) => listAgents(...args),
  CursorNotDrainedError,
}))

const { resolveSessionId } = await import('./preflight.js')

const resumeLast = { mode: 'resume', resume: {} } as never
const here = () => process.cwd()

beforeEach(() => {
  listAgents.mockReset()
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})

describe('resolveSessionId', () => {
  it('test_run_mode_never_consults_the_registry', async () => {
    const id = await resolveSessionId({ mode: 'run' } as never)

    expect(id).toMatch(/^exec-/)
    expect(listAgents, 'a fresh run listed the registry it has no reason to read').not.toHaveBeenCalled()
  })

  it('test_an_explicit_id_is_used_verbatim', async () => {
    const id = await resolveSessionId({ mode: 'resume', resume: { id: 'abc' } } as never)

    expect(id).toBe('abc')
    expect(listAgents).not.toHaveBeenCalled()
  })

  it('test_resume_last_picks_the_most_recently_modified_session', async () => {
    listAgents.mockResolvedValue([
      { agentId: 'older', cwd: here(), lastModified: 100 },
      { agentId: 'newest', cwd: here(), lastModified: 900 },
    ])

    expect(await resolveSessionId(resumeLast)).toBe('newest')
  })

  it('test_a_session_from_another_directory_is_not_resumed_here', async () => {
    listAgents.mockResolvedValue([{ agentId: 'elsewhere', cwd: '/somewhere/else', lastModified: 900 }])

    const id = await resolveSessionId(resumeLast)

    expect(id, 'a session belonging to another directory was reopened').toMatch(/^exec-/)
  })

  it('test_an_entry_with_no_recorded_cwd_counts_as_this_one', async () => {
    // Deliberate, and the reason is in the file docblock: entries written before the cwd field
    // existed must stay resumable. Pinned so that widening or narrowing it is a decision.
    listAgents.mockResolvedValue([{ agentId: 'legacy', cwd: undefined, lastModified: 900 }])

    expect(await resolveSessionId(resumeLast)).toBe('legacy')
  })

  it('test_an_entry_with_no_timestamp_sorts_last_rather_than_first', async () => {
    // The same shape as B-140 one package over: a missing number must not win the ordering it
    // cannot participate in. `?? 0` puts it last, which is the safe direction here.
    listAgents.mockResolvedValue([
      { agentId: 'undated', cwd: here(), lastModified: undefined },
      { agentId: 'dated', cwd: here(), lastModified: 5 },
    ])

    expect(await resolveSessionId(resumeLast)).toBe('dated')
  })

  it('test_an_unreadable_registry_starts_a_new_session_instead_of_failing', async () => {
    listAgents.mockRejectedValue(new Error('EACCES'))

    expect(await resolveSessionId(resumeLast)).toMatch(/^exec-/)
  })

  it('test_the_fallback_says_it_started_a_new_session', async () => {
    // "I found nothing" must not look like "I resumed what you asked for". Silently opening a new
    // conversation when the user asked to continue one is the failure this line prevents.
    listAgents.mockResolvedValue([])
    const written: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((c: unknown) => {
      written.push(String(c))
      return true
    })

    await resolveSessionId(resumeLast)

    expect(written.join('')).toContain('starting a NEW session')
  })

  it('test_a_not_drained_cursor_is_rethrown_rather_than_swallowed', async () => {
    // The one error the catch must NOT absorb: it means the registry read was interrupted mid-scan,
    // so "no session found" would be a claim about data nobody finished reading.
    listAgents.mockRejectedValue(new CursorNotDrainedError('interrupted'))

    await expect(resolveSessionId(resumeLast)).rejects.toBeInstanceOf(CursorNotDrainedError)
  })
})
