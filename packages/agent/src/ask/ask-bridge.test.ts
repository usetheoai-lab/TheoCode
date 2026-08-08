/**
 * B-004 — a question that is abandoned must settle.
 *
 * `ask()` built its promise capturing only `resolve`, so `reject` was not merely unused — it
 * was unreachable. `abandon()` then deleted the pending entry and returned, dropping the captured
 * `resolve` on the floor. The promise it had handed the SDK never settled.
 *
 * What the user sees: pressing ESC frees the UI (the slot is released) but the turn stays blocked
 * until the built-in's 5-minute timeout expires. The UI says the question is gone; the model is
 * still waiting for it.
 */
import { describe, expect, it, vi } from 'vitest'

import { AskBridge } from './ask-bridge.js'
import { ConcurrentQuestionError } from './concurrent-question-error.js'

describe('B-004 — abandoning a question settles its promise', () => {
  it('test_abandon_rejects_the_pending_question', async () => {
    const bridge = new AskBridge(() => {})
    const answer = bridge.ask('which file?')

    bridge.abandon()

    await expect(
      answer,
      'the promise handed to the SDK never settled: `abandon()` dropped the pending entry without ' +
        'resolving or rejecting it, so the turn stays blocked until the 5-minute timeout even though ' +
        'the UI already released the slot.',
    ).rejects.toBeInstanceOf(Error)
  })

  it('test_abandon_does_not_disturb_another_thread', async () => {
    // Anti-vacuity floor: rejecting everything would satisfy the test above.
    const bridge = new AskBridge(() => {})
    const kept = bridge.ask('kept?', 'thread-a')
    // Captured deliberately: `abandon` now rejects, and an uncaught rejection here would be the
    // very defect B-013 is about — a promise nobody settles quietly taking the process down.
    const dropped = bridge.ask('dropped?', 'thread-b')
    const droppedSettled = expect(dropped).rejects.toBeInstanceOf(Error)

    bridge.abandon('thread-b')
    await droppedSettled
    bridge.answer('still here', 'thread-a')

    await expect(kept).resolves.toBe('still here')
  })

  it('test_answering_still_resolves', async () => {
    const bridge = new AskBridge(() => {})
    const answer = bridge.ask('which file?')

    expect(bridge.answer('src/index.ts')).toBe(true)

    await expect(answer).resolves.toBe('src/index.ts')
  })

  it('test_a_second_question_on_the_same_thread_still_rejects_as_concurrent', async () => {
    const bridge = new AskBridge(() => {})
    const first = bridge.ask('first?')

    await expect(bridge.ask('second?')).rejects.toBeInstanceOf(ConcurrentQuestionError)

    // Settle the first one too, so the test leaves no pending promise behind.
    bridge.answer('answered')
    await expect(first).resolves.toBe('answered')
  })
})

describe('B-004 — the concurrent-question error is reachable and readable', () => {
  it('test_the_error_message_is_in_english', () => {
    // The SDK's built-in question tool only catches `err.message === "timeout"` and rethrows the
    // rest, so this error escapes the handler either way -- that half is an upstream gap. What is
    // ours is the message the user and the model actually read.
    const err = new ConcurrentQuestionError('thread-a')

    expect(err.message).not.toMatch(/[áâãçéêíóôõú]/i)
    expect(err.message).toMatch(/already/i)
  })

  it('test_the_error_is_exported_from_the_package_entrypoint', async () => {
    // Surfaces import from `@theocode/agent/ask`, never from the module directly. While the class
    // was absent from the entrypoint, no consumer could write `instanceof` against it -- a typed
    // error nobody can catch by type is an untyped error with extra steps.
    const entry = (await import('./index.js')) as Record<string, unknown>

    expect(entry.ConcurrentQuestionError).toBe(ConcurrentQuestionError)
  })

  it('test_the_error_keeps_its_typed_code', () => {
    expect(new ConcurrentQuestionError('t').code).toBe('question_already_pending')
  })
})

describe('B-035 — the single slot is named for what it is, and a second set fails loudly', () => {
  /**
   * B-035 — the test that used to live here was VACUOUS, and it carried the name of the guarantee it
   * failed to encode. It asserted `first.calls + second.calls > 0` and that `second` was called.
   * Both hold PRECISELY when the first listener is silently replaced; `first` was never asserted on.
   * The comment above it said "losing a subscriber without a trace is not one of them" and the
   * assertions permitted exactly that.
   *
   * The B-004 bullet offered two exits: support multiple subscribers, or rename to what it is. Only
   * the TUI ever subscribes, so building a multicast nobody asked for is the YAGNI failure. It is
   * `setListener` now, and setting a second one over a live one throws rather than winning silently.
   */
  it('test_setting_a_second_listener_over_a_live_one_throws', () => {
    const bridge = new AskBridge(() => {})
    const first = vi.fn()

    bridge.setListener(first)

    expect(
      () => bridge.setListener(vi.fn()),
      'a second setListener() replaced a live one, so a surface stopped being notified with no ' +
        'error and no warning',
    ).toThrow(/listener/i)
  })

  it('test_the_first_listener_keeps_receiving_after_a_rejected_second', async () => {
    // The assertion the old test should have made: `first` is still the one notified.
    const bridge = new AskBridge(() => {})
    const first = vi.fn()
    bridge.setListener(first)
    try {
      bridge.setListener(vi.fn())
    } catch {
      // expected — asserted above
    }

    const pending = bridge.ask('anything?')
    bridge.answer('done')

    expect(first, 'the surviving listener was not the first one').toHaveBeenCalled()
    await expect(pending).resolves.toBe('done')
  })

  it('test_disposing_frees_the_slot_for_a_new_listener', () => {
    // Anti-vacuity floor: throwing on every second call would make the bridge unusable across a
    // surface restart, which is a real flow (the TUI unmounts and remounts).
    const bridge = new AskBridge(() => {})
    const dispose = bridge.setListener(vi.fn())
    dispose()

    expect(() => bridge.setListener(vi.fn())).not.toThrow()
  })
})
