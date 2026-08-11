/**
 * B-088 — the sink that turns the SDK's run events into what `/mcp` reports.
 *
 * Deliberately a standalone function rather than an inline closure at the transport: an inline sink
 * could only be tested by driving a whole turn, and the behaviour worth pinning here — which events
 * are ours, and that an unknown event is ignored rather than mishandled — has nothing to do with
 * running an agent.
 *
 * It takes the event STRUCTURALLY rather than importing the SDK's union, so this file and its tests
 * do not depend on which version of `@theokit/sdk` is installed. The type discipline lives at the
 * transport, where the sink is handed to a typed parameter.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { currentMcpFailures, resetMcpFailures } from './mcp-failure-record.js'
import { mcpFailureSink } from './mcp-failure-sink.js'

describe('B-088 — mcpFailureSink', () => {
  beforeEach(() => {
    resetMcpFailures()
  })

  it('records an mcp_server_failed event with its server and reason', () => {
    mcpFailureSink({
      type: 'mcp_server_failed',
      serverName: 'theo-mcp',
      message: 'spawn theo-mcp ENOENT',
    })

    expect(currentMcpFailures()).toEqual([
      { serverName: 'theo-mcp', message: 'spawn theo-mcp ENOENT' },
    ])
  })

  it('ignores every other run event', () => {
    // The sink is handed the WHOLE RunEvent stream — tool_progress, rate_limit, permission_denied,
    // task_*, compact_boundary. Reacting to any of them would put unrelated noise in an MCP panel.
    mcpFailureSink({ type: 'tool_progress', toolName: 'shell', toolCallId: 'c1' })
    mcpFailureSink({ type: 'rate_limit', attempt: 1 })

    expect(currentMcpFailures()).toEqual([])
  })

  it('ignores a malformed event instead of recording a blank server', () => {
    // A panel row reading "undefined — undefined" is worse than a missing row: it looks like a
    // broken server that does not exist.
    mcpFailureSink({ type: 'mcp_server_failed' })
    mcpFailureSink({ type: 'mcp_server_failed', serverName: 'x' })

    expect(currentMcpFailures()).toEqual([])
  })

  it('survives a non-object payload without throwing', () => {
    // An observability sink must never be the reason a turn dies (the SDK's own emitRunEvent wraps
    // the call for exactly this reason; we do not rely on that being there).
    expect(() => {
      mcpFailureSink(undefined)
      mcpFailureSink('nonsense')
    }).not.toThrow()
    expect(currentMcpFailures()).toEqual([])
  })
})
