import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const ctxPre = (over: Record<string, unknown> = {}) =>
  ({ agentId: 'a', runId: 'r', name: '', args: {}, ...over }) as never
export const ctxTurn = (over: Record<string, unknown> = {}) =>
  ({ agentId: 'a', runId: 'r', toolCalls: [], ...over }) as never
export const ctxVoid = () => ({ agentId: 'a', runId: 'r' }) as never

export const tmp = (): string => mkdtempSync(join(tmpdir(), 'hooks-'))
