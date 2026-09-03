/**
 * Both members of the stream must reach their record, and nothing proved it.
 *
 * `chat-transport.ts` subscribes once and fans the event out to two holders: `mcp_server_failed` so
 * `/mcp` can report a server that failed THIS turn, and `rate_limit` so a failed turn can say how
 * many attempts it cost (B-088 and B-130). Both records are tested. The fan-out was two statements
 * inside a generator inside a class, at 0% coverage, and dropping either one leaves every test green
 * while its panel silently reports nothing forever.
 *
 * This is the CLI finding on the other surface. `commands/run.ts` had the same linkage untested and
 * was fixed one commit earlier; the product has two surfaces and a guarantee that holds on one of
 * them is not a guarantee.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { currentAttempts, resetRetryRecord, startRetryTurn } from './retry-record.js'
import { runEventSink } from './run-event-sink.js'

beforeEach(() => {
  resetRetryRecord()
  startRetryTurn()
})

describe('runEventSink', () => {
  it('test_a_rate_limit_event_reaches_the_retry_record', () => {
    runEventSink({ type: 'rate_limit', attempt: 3 } as never)

    expect(currentAttempts(), 'the retry half of the fan-out was not wired').toBe(3)
  })

  it('test_an_unrelated_event_changes_nothing', () => {
    // Anti-vacuity: a sink that counted everything would satisfy the assertion above.
    runEventSink({ type: 'something_else' } as never)

    expect(currentAttempts()).toBe(0)
  })

  it('test_an_mcp_failure_event_does_not_disturb_the_retry_count', () => {
    // The two records read different members of one stream; feeding one must not move the other.
    runEventSink({ type: 'mcp_server_failed', server: 'x', error: 'y' } as never)

    expect(currentAttempts()).toBe(0)
  })

  it('test_the_highest_attempt_survives_a_later_lower_one', () => {
    // Delegated to the record, asserted here because the fan-out is what the transport installs.
    runEventSink({ type: 'rate_limit', attempt: 3 } as never)
    runEventSink({ type: 'rate_limit', attempt: 1 } as never)

    expect(currentAttempts()).toBe(3)
  })
})
