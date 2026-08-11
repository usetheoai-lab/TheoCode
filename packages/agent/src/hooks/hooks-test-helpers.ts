import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * B-038 — fixtures for the hooks suite, kept because the suite now exists.
 *
 * This file was written for a suite that was never created, so it sat here as dead weight that read
 * as coverage — the B-016 bullet it was closed on. `ctxPre` and `ctxVoid` went with that: nothing
 * exercises the PreToolUse or lifecycle contexts yet, and a fixture for a test nobody wrote is the
 * same defect one file smaller. They come back with the test that needs them.
 */

/** A tool-result turn context, the shape `transform_tool_result` receives. */
export const ctxTurn = (over: Record<string, unknown> = {}): never =>
  ({ agentId: 'a', runId: 'r', toolCalls: [], ...over }) as never

/** A throwaway directory for a hook that writes something observable. */
export const tmp = (): string => mkdtempSync(join(tmpdir(), 'hooks-'))
