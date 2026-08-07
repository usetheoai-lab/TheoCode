import { Agent, TheokitAgentError } from '@theokit/agents'

interface ListedAgent {
  agentId: string
  name?: string
  archived?: boolean
  lastModified?: number
  cwd?: string
}

type ListagemBruta = (cwd: string) => Promise<{ items: ListedAgent[]; nextCursor?: string }>

export class CursorNotDrainedError extends TheokitAgentError {
  readonly name = 'CursorNotDrainedError'
  readonly cursor: string

  constructor(cursor: string) {
    super(
      `a listagem de agentes devolveu um cursor (${cursor}) que esta versão não sabe drain — ` +
        `recusando devolver uma página parcial, porque o chamador a usaria como população completa`,
    )
    this.cursor = cursor
  }
}

const listagemPadrao: ListagemBruta = async (cwd) => {
  const r = await Agent.list({ runtime: 'local', cwd })
  return { items: r.items }
}

export async function listAgents(
  cwd: string,
  list: ListagemBruta = listagemPadrao,
): Promise<ListedAgent[]> {
  const r = await list(cwd)
  if (r.nextCursor !== undefined) throw new CursorNotDrainedError(r.nextCursor)
  return r.items
}
