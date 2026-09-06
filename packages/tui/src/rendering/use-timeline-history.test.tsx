/**
 * #70 — a resumed session renders what it restored.
 *
 * The mitigation from the first pass told the user the session was resumed. This is the other half:
 * the turns themselves. `useTimeline` composes the array the timeline draws, so the history goes in
 * as a PREFIX — after the greeting, before whatever the live stream folds into `agent.thread`.
 *
 * A prefix rather than a seed into the thread, for the reason the toolkit records for its own
 * equivalent: the fold resets on a reconnect and history must survive that, because it was never
 * part of the fold.
 *
 * NOTE ON THE SEAM. `@theokit/tui@0.80.0` added `initialMessages` to `useAgentStream` for exactly
 * this, and this product does not use that hook — its agent comes from `@theokit/agents`'
 * `useAgent`, and `useTimeline` owns the composition. So the toolkit fix is not what unblocked this;
 * `readSessionMessages` in `@theokit/sdk@5.0.0-next.4` is. Written down because the two look
 * interchangeable from the issue thread and are not.
 */
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'

import { useTimeline } from './use-timeline.js'

type Events = ReturnType<typeof useTimeline>['events']

/**
 * Rendered TWICE and read after a tick, because `useCoalesced` bounds recomputation by TIME and lands
 * the last value on a trailing update. Reading the first render returns the window that has not
 * closed yet — which is an empty timeline, and looks exactly like the bug under test.
 */
async function eventsOf(thread: unknown[], history: unknown[], resumed = true): Promise<Events> {
  let seen: Events = []
  function Probe(): null {
    seen = useTimeline({ thread } as never, resumed, history as never).events
    return null
  }
  const instance = render(<Probe />)
  instance.rerender(<Probe />)
  await new Promise((resolve) => setTimeout(resolve, 60))
  instance.rerender(<Probe />)
  instance.unmount()
  return seen
}

const message = (id: string, text: string) => ({
  id,
  role: 'assistant' as const,
  parts: [{ type: 'text', text }],
})

describe('#70 — the resumed history in the timeline', () => {
  it('test_the_restored_turns_are_drawn', async () => {
    const texts = JSON.stringify(await eventsOf([], [message('h0', 'earlier turn')]))

    expect(texts, 'the session was resumed and its turns are not on screen').toContain('earlier turn')
  })

  it('test_history_precedes_the_live_thread', async () => {
    const out = await eventsOf([message('t0', 'live turn')], [message('h0', 'earlier turn')])
    const json = JSON.stringify(out)

    expect(json.indexOf('earlier turn')).toBeLessThan(json.indexOf('live turn'))
  })

  it('test_the_greeting_still_comes_first', async () => {
    // It is the frame's opening line; history appearing above it would read as a rendering fault.
    const out = await eventsOf([], [message('h0', 'earlier turn')])

    // `greeting::mN` is how the projection ids each part of a message; the prefix is the message.
    expect(out[0]?.id).toBe('greeting::m0')
  })

  it('test_no_history_renders_exactly_what_it_did_before', async () => {
    // The anti-regression floor: every session that is NOT a resume goes through this same path.
    const out = await eventsOf([message('t0', 'live turn')], [], false)

    expect(out.map((e) => e.id)).toEqual(['greeting::m0', 't0::m0'])
  })
})
