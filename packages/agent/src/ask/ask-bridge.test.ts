/**
 * B-004 — a question that is abandoned must settle.
 *
 * `perguntar()` built its promise capturing only `resolve`, so `reject` was not merely unused — it
 * was unreachable. `abandonar()` then deleted the pending entry and returned, dropping the captured
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
    const answer = bridge.perguntar('which file?')

    bridge.abandonar()

    await expect(
      answer,
      'the promise handed to the SDK never settled: `abandonar()` dropped the pending entry without ' +
        'resolving or rejecting it, so the turn stays blocked until the 5-minute timeout even though ' +
        'the UI already released the slot.',
    ).rejects.toBeInstanceOf(Error)
  })

  it('test_abandon_does_not_disturb_another_thread', async () => {
    // Anti-vacuity floor: rejecting everything would satisfy the test above.
    const bridge = new AskBridge(() => {})
    const kept = bridge.perguntar('kept?', 'thread-a')
    bridge.perguntar('dropped?', 'thread-b')

    bridge.abandonar('thread-b')
    bridge.responder('still here', 'thread-a')

    await expect(kept).resolves.toBe('still here')
  })

  it('test_answering_still_resolves', async () => {
    const bridge = new AskBridge(() => {})
    const answer = bridge.perguntar('which file?')

    expect(bridge.responder('src/index.ts')).toBe(true)

    await expect(answer).resolves.toBe('src/index.ts')
  })

  it('test_a_second_question_on_the_same_thread_still_rejects_as_concurrent', async () => {
    const bridge = new AskBridge(() => {})
    bridge.perguntar('first?')

    await expect(bridge.perguntar('second?')).rejects.toBeInstanceOf(ConcurrentQuestionError)
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

describe('B-004 — subscribing is honest about being a single slot', () => {
  it('test_a_second_subscriber_does_not_silently_replace_the_first', () => {
    const bridge = new AskBridge(() => {})
    const first = vi.fn()
    const second = vi.fn()

    bridge.assinar(first)
    bridge.assinar(second)
    bridge.perguntar('anything?')

    // Whatever the chosen semantics, losing a subscriber without a trace is not one of them.
    expect(
      first.mock.calls.length + second.mock.calls.length,
      'a second `assinar()` overwrote the first listener silently, so one subscriber stopped being ' +
        'notified with no error and no warning',
    ).toBeGreaterThan(0)
    expect(second).toHaveBeenCalled()
  })
})
