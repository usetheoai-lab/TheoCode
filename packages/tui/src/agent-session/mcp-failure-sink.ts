/**
 * B-088 — turns the SDK's run-event stream into what `/mcp` reports.
 *
 * The sink receives EVERY `RunEvent` (`tool_progress`, `rate_limit`, `permission_denied`, `task_*`,
 * `compact_boundary`, `tripwire`, `completion_check`, `mcp_server_failed`). Only the last one is
 * ours; reacting to any other would put unrelated noise in an MCP panel.
 *
 * The payload is read STRUCTURALLY rather than through the SDK's union, so this module does not
 * pin a `@theokit/sdk` version. The type discipline lives at the transport, where this function is
 * handed to a typed parameter — that call is what fails to compile if the contract moves.
 *
 * Nothing here throws. An observability sink must never be the reason a turn dies; the SDK wraps
 * the call for that reason already, and this does not depend on that still being true.
 */
import { recordMcpFailure } from './mcp-failure-record.js'

export function mcpFailureSink(event: unknown): void {
  if (typeof event !== 'object' || event === null) return
  const e = event as Record<string, unknown>
  if (e.type !== 'mcp_server_failed') return
  // Both fields are required to say anything useful. A row reading "undefined — undefined" looks
  // like a broken server that does not exist, which is worse than no row.
  if (typeof e.serverName !== 'string' || typeof e.message !== 'string') return
  recordMcpFailure({ serverName: e.serverName, message: e.message })
}
