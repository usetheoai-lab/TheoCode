/**
 * B-116 slice 2 — `interpretCommand` dispatch: which capability group claims which action.
 *
 * The router is a chain of responsibility over seven group functions, and the first that returns
 * true wins. The obvious thing to test is precedence — and MEASURED, precedence is not observable
 * here: the 38 actions partition cleanly across the seven switches, no action appears in two, so
 * reordering `GROUPS` changes nothing. Three mutations proved it (reordering the chain, removing
 * the early return, making `noop` stop claiming) and none turned a case red.
 *
 * That is worth knowing rather than working around, because the disjointness is WHY order does not
 * matter — and it is not enforced anywhere. A second `case 'quit'` added to another group would
 * make behaviour order-dependent silently, and the first symptom would be a command that stopped
 * working after an unrelated reorder.
 *
 * So the cases below pin two different things. The structural one asserts the partition itself,
 * which is the invariant the chain rests on. The behavioural ones assert that each group's actions
 * reach it — including that an unclaimed action is inert, since a registry entry added without a
 * handler lands there.
 *
 * The fake supplies every field of `CommandCapabilities` as a spy rather than a partial cast: a
 * missing field throws at destructuring time, and that failure reads as a dispatch bug.
 */
import { readFileSync } from 'node:fs'

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { CommandCapabilities } from './command-capabilities.js'
import { interpretCommand } from './interpret-command.js'
import type { CommandAction } from './registry.js'

function harness() {
  const agent = { send: vi.fn(), reset: vi.fn(), abort: vi.fn() }
  const SESSION = {
    attachImages: vi.fn(),
    effort: vi.fn(() => 'medium' as never),
    setEffort: vi.fn(),
    cfg: vi.fn(() => ({ modelLabel: 'm', sandboxLabel: 's' })),
    sessionModel: vi.fn(() => undefined),
    setSessionModel: vi.fn(),
    setModel: vi.fn(),
    session: vi.fn(() => 'sess-1'),
  }
  const ptyOwner = {
    backend: vi.fn(() => ({ activeSessionCount: () => 0, killAll: vi.fn() })),
  }
  const spies = {
    resetSession: vi.fn(),
    setSessionAndPersist: vi.fn(),
    startGoal: vi.fn(),
    exit: vi.fn(),
    setToast: vi.fn(),
    setPanel: vi.fn(),
    setMode: vi.fn(),
    setShowHelp: vi.fn(),
    setShowUsage: vi.fn(),
    setClearEpoch: vi.fn(),
    setEffort: vi.fn(),
    setApprovalMode: vi.fn(),
    setGoalRun: vi.fn(),
    setGoalFeed: vi.fn(),
    setLoginProvider: vi.fn(),
    setReviewResult: vi.fn(),
    currentSessionId: vi.fn(() => 'sess-1'),
    forkCurrentSession: vi.fn(() => ({ newId: 'sess-2', copied: true })),
    stdoutWrite: vi.fn(),
  }

  const cap = {
    agent,
    SESSION,
    ptyOwner,
    customCommands: new Map(),
    backtrack: { setSeed: vi.fn() as unknown as Dispatch<SetStateAction<string>> },
    goalAbort: { current: null } as MutableRefObject<AbortController | null>,
    lastSentMessage: { current: null } as MutableRefObject<string | null>,
    stdout: { write: spies.stdoutWrite },
    approvalMode: 'on-request',
    goalRun: null,
    goalActive: false,
    events: [],
    streaming: false,
    currentSessionId: spies.currentSessionId,
    forkCurrentSession: spies.forkCurrentSession,
    resetSession: spies.resetSession,
    setSessionAndPersist: spies.setSessionAndPersist,
    startGoal: spies.startGoal,
    exit: spies.exit,
    setToast: spies.setToast,
    setPanel: spies.setPanel,
    setMode: spies.setMode,
    setShowHelp: spies.setShowHelp,
    setShowUsage: spies.setShowUsage,
    setClearEpoch: spies.setClearEpoch,
    setEffort: spies.setEffort,
    setApprovalMode: spies.setApprovalMode,
    setGoalRun: spies.setGoalRun,
    setGoalFeed: spies.setGoalFeed,
    setLoginProvider: spies.setLoginProvider,
    setReviewResult: spies.setReviewResult,
  } as unknown as CommandCapabilities

  return { cap, agent, SESSION, ptyOwner, ...spies }
}

const run = (action: CommandAction, text = '', h = harness()) => {
  interpretCommand(action, text, h.cap)
  return h
}

describe('interpretCommand — the session-and-screen group claims its actions', () => {
  it('test_new_resets_the_session_and_clears_the_screen', () => {
    // First group in the chain; if a later one ever claimed `new`, the session would not reset.
    const h = run({ kind: 'new' } as CommandAction)

    expect(h.resetSession).toHaveBeenCalled()
    expect(h.agent.reset).toHaveBeenCalled()
    expect(h.stdoutWrite).toHaveBeenCalled()
  })

  it('test_noop_is_claimed_and_does_nothing', () => {
    // `noop` returning true is what stops the chain. If it fell through, a later group's default
    // could act on it — the quietest possible bug.
    const h = run({ kind: 'noop' } as CommandAction)

    expect(h.resetSession).not.toHaveBeenCalled()
    expect(h.setToast).not.toHaveBeenCalled()
    expect(h.agent.send).not.toHaveBeenCalled()
  })

  it('test_toggleHelp_reaches_the_help_setter_and_not_the_panel', () => {
    const h = run({ kind: 'toggleHelp' } as CommandAction)

    expect(h.setShowHelp).toHaveBeenCalled()
    expect(h.setPanel).not.toHaveBeenCalled()
  })
})

describe('interpretCommand — later groups claim their own', () => {
  it('test_mode_reaches_the_turn_group', () => {
    const h = run({ kind: 'mode', mode: 'plan' } as unknown as CommandAction)
    expect(h.setMode).toHaveBeenCalled()
  })

  it('test_showStatus_reaches_the_inspection_group', () => {
    const h = run({ kind: 'showStatus' } as CommandAction)
    expect(h.setPanel).toHaveBeenCalled()
  })

  it('test_send_reaches_the_conduct_group_and_the_agent', () => {
    // Last group in the chain. Reaching it proves nothing earlier swallowed the action.
    const h = run({ kind: 'send', text: 'hello' } as unknown as CommandAction, 'hello')
    expect(h.agent.send).toHaveBeenCalled()
  })
})

describe('interpretCommand — an unclaimed action falls through without effect', () => {
  it('test_an_unknown_action_touches_nothing', () => {
    // The chain returning nothing must be inert, not a crash and not a silent partial effect. A
    // registry entry added without a handler lands here.
    const h = harness()

    expect(() => interpretCommand({ kind: '__not_a_command__' } as unknown as CommandAction, '', h.cap)).not.toThrow()
    expect(h.resetSession).not.toHaveBeenCalled()
    expect(h.setToast).not.toHaveBeenCalled()
    expect(h.agent.send).not.toHaveBeenCalled()
    expect(h.setPanel).not.toHaveBeenCalled()
  })
})

describe('interpretCommand — the partition the chain rests on', () => {
  // Read from the source rather than from a hand-kept list: a list would have to be updated by the
  // same person who broke the invariant, at the same moment, which is when they are least likely to.
  const source = readFileSync(new URL('./interpret-command.ts', import.meta.url), 'utf8')

  const GROUPS = [
    'sessionAndScreen',
    'identity',
    'turn',
    'inspection',
    'transcriptOut',
    'shells',
    'conduct',
  ] as const

  function claimsByGroup(): Map<string, string[]> {
    const bounds = GROUPS.map((n) => [n, source.indexOf(`function ${n}(`)] as const)
      .filter(([, i]) => i >= 0)
      .sort((a, b) => a[1] - b[1])
    const claims = new Map<string, string[]>()
    bounds.forEach(([name, start], i) => {
      const end = i + 1 < bounds.length ? bounds[i + 1]![1] : source.length
      for (const m of source.slice(start, end).matchAll(/case '([a-zA-Z]+)'/g)) {
        const action = m[1] as string
        claims.set(action, [...(claims.get(action) ?? []), name])
      }
    })
    return claims
  }

  it('test_no_action_is_claimed_by_two_groups', () => {
    // The invariant. While it holds, the order of `GROUPS` is free; the moment it breaks, order
    // becomes behaviour and nothing else in the suite would notice.
    const duplicated = [...claimsByGroup().entries()]
      .filter(([, groups]) => new Set(groups).size > 1)
      .map(([action, groups]) => `${action} -> ${[...new Set(groups)].join(', ')}`)

    expect(duplicated).toEqual([])
  })

  it('test_every_group_claims_something', () => {
    // Anti-vacuity for the case above: an empty parse would make it pass while asserting nothing,
    // and a group that claims nothing is dead code in the chain.
    const claimed = new Set([...claimsByGroup().values()].flat())
    expect([...claimed].sort()).toEqual([...GROUPS].sort())
  })
})
