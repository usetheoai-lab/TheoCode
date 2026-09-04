/**
 * #70 — `/resume` must leave the screen saying the session was resumed.
 *
 * The transcript after `/resume` is the welcome banner and nothing else, because `clearEpoch`
 * remounts the timeline and `agent.thread` is never repopulated. That is INDISTINGUISHABLE from a
 * command that did nothing, while the model demonstrably has the earlier turns — the issue's step 6.
 *
 * The greeting could already say it. `useTimeline(agent, resumed)` writes "(resumed — I remember our
 * last conversation)" and `resumed` was bound to whether the PROCESS started on a session pointer,
 * so a mid-session `/resume` never reached the one affordance that existed.
 */
import { describe, expect, it, vi } from 'vitest'

import { handleResume } from './session-commands.js'

function resume(arg: string, streaming = false, known: string[] = ['tui-other', 'tui-current']) {
  const calls = { resumed: [] as boolean[], epoch: 0, session: '' }
  handleResume(arg, {
    currentSessionId: () => 'tui-current',
    streaming,
    setSessionAndPersist: (id) => {
      calls.session = id
    },
    setClearEpoch: () => {
      calls.epoch += 1
    },
    setResumed: (v) => {
      calls.resumed.push(v as boolean)
    },
    setToast: vi.fn(),
    listKnownSessions: async () => known.map((agentId) => ({ agentId })),
  })
  return calls
}

describe('/resume makes itself visible', () => {
  it('test_a_refused_resume_does_not_claim_a_resumed_session', async () => {
    // Anti-vacuity, and the direction that matters: a refusal must not leave the banner announcing a
    // continuation that never happened. Refused because a turn is streaming.
    const calls = resume('tui-other', true)
    await new Promise((r) => setTimeout(r, 20))

    expect(calls.resumed).toEqual([])
    expect(calls.epoch).toBe(0)
  })

  it('test_resuming_the_current_session_changes_nothing', async () => {
    // `planResume` refuses a no-op; the flag must not fire on it either.
    const calls = resume('tui-current')
    await new Promise((r) => setTimeout(r, 20))

    expect(calls.resumed).toEqual([])
  })

  it('test_a_real_resume_marks_the_session_as_continued', () => {
    // The finding. Before this the flag was bound to whether the PROCESS started on a session
    // pointer, so this path — the one an operator actually takes — never set it, and the screen said
    // nothing.
    const calls = resume('tui-other')

    return new Promise<void>((r) =>
      setTimeout(() => {
        expect(calls.session, 'the session was not repointed').toBe('tui-other')
        expect(calls.resumed, 'the resume happened and the screen was never told').toEqual([true])
        r()
      }, 20),
    )
  })
})
