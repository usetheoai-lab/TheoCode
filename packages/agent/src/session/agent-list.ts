import { Agent, TheokitAgentError } from '@theokit/agents'

interface ListedAgent {
  agentId: string
  name?: string
  archived?: boolean
  lastModified?: number
  cwd?: string
}

type RawListing = (cwd: string) => Promise<{ items: ListedAgent[]; nextCursor?: string }>

export class CursorNotDrainedError extends TheokitAgentError {
  readonly name = 'CursorNotDrainedError'
  readonly cursor: string

  constructor(cursor: string) {
    super(
      `the agent listing returned a cursor (${cursor}) this version cannot drain — ` +
        `refusing to return a partial page, because the caller would use it as the complete population`,
    )
    this.cursor = cursor
  }
}

const defaultListing: RawListing = async (cwd) => {
  const r = await Agent.list({ runtime: 'local', cwd })
  return { items: r.items }
}

export async function listAgents(
  cwd: string,
  list: RawListing = defaultListing,
): Promise<ListedAgent[]> {
  const r = await list(cwd)
  if (r.nextCursor !== undefined) throw new CursorNotDrainedError(r.nextCursor)
  return r.items
}
