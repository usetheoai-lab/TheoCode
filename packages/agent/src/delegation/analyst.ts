import { SubAgent } from '@theokit/agents'

import type { ToolRegistry } from '../tools/index.js'

const TOOLS_DO_ANALYST = ['read_file', 'list_dir', 'grep'] as const

export function createAnalystSubagent(parentModel: string, registry: ToolRegistry) {
  return SubAgent.create({
    name: 'analyst',
    description:
      'Delegate a focused code/repo analysis question to a child agent. It reads files (read-only) and ' +
      'returns a concise, grounded summary. Use for "summarize how X works" / "what tools does Y expose" ' +
      'style sub-questions so the main thread stays focused.',
    instructions:
      'You are a focused code analyst. Answer the delegated question by READING the relevant files with ' +
      'your tools (read_file / list_dir / grep) — never guess. Return a concise, grounded summary with ' +
      'concrete evidence (file paths, names, counts). You cannot edit files or run commands.',
    model: parentModel,
    tools: registry.resolve([...TOOLS_DO_ANALYST]),
    maxDelegationDepth: 2,
  })
}
