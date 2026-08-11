/**
 * B-088 (final layer) — what the TUI knows about MCP servers that did not answer.
 *
 * Separate from `wiring-record` on purpose: the two have different lifetimes. Wiring describes what
 * the last BUILD decided and is replaced wholesale each build. A failure describes what happened
 * during one RUN, and a server that failed last turn may answer on the next one — so the record has
 * to be cleared when a turn starts, or the panel reports a stale failure as a current one.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  currentMcpFailures,
  recordMcpFailure,
  resetMcpFailures,
  startMcpFailureTurn,
} from './mcp-failure-record.js'

describe('B-088 — the MCP failure record', () => {
  beforeEach(() => {
    resetMcpFailures()
  })

  it('is empty before anything failed', () => {
    expect(currentMcpFailures()).toEqual([])
  })

  it('keeps the server name and the reason, which is what the panel has to show', () => {
    recordMcpFailure({ serverName: 'theo-mcp', message: 'spawn theo-mcp ENOENT' })

    expect(currentMcpFailures()).toEqual([
      { serverName: 'theo-mcp', message: 'spawn theo-mcp ENOENT' },
    ])
  })

  it('clears on a new turn, so a server that recovers stops being reported as failed', () => {
    recordMcpFailure({ serverName: 'theo-mcp', message: 'spawn theo-mcp ENOENT' })
    startMcpFailureTurn()

    expect(currentMcpFailures()).toEqual([])
  })

  it('reports the last reason when the same server fails twice in one turn', () => {
    recordMcpFailure({ serverName: 'theo-mcp', message: 'first' })
    recordMcpFailure({ serverName: 'theo-mcp', message: 'second' })

    // One entry, not two: the panel lists SERVERS, and the same server appearing twice would read
    // as two broken servers.
    expect(currentMcpFailures()).toEqual([{ serverName: 'theo-mcp', message: 'second' }])
  })

  it('keeps distinct servers apart', () => {
    recordMcpFailure({ serverName: 'a', message: 'x' })
    recordMcpFailure({ serverName: 'b', message: 'y' })

    expect(currentMcpFailures()).toEqual([
      { serverName: 'a', message: 'x' },
      { serverName: 'b', message: 'y' },
    ])
  })
})
