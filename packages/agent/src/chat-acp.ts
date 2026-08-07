import { homedir } from 'node:os'

import { resolveFreshCredential } from './auth/index.js'
import { toAgentFactory } from '@theokit/agents'

import { buildChatAgent } from './chat.js'

import { setDiagnosticsSink } from '@theokit/agents'

import { installDiagnosticSink } from '@theocode/shared/diagnostic-sink'

installDiagnosticSink(setDiagnosticsSink)

const resolveCredential = async (): Promise<string> => {
  try {
    return (await resolveFreshCredential({ env: process.env, home: homedir() })).apiKey
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    return ''
  }
}

export default toAgentFactory(
  async () => {
    return buildChatAgent()
  },
  {
    apiKey: resolveCredential,
    approvals: { kind: 'owned-by-surface', reason: 'ACP client owns the prompt' },
  },
)
