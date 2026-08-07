import { homedir } from 'node:os'

import { resolveFreshCredential } from './auth/index.js'
import { toAgentFactory } from '@theokit/agents'

import { buildChatAgent } from './chat.js'

import { setDiagnosticsSink } from '@theokit/agents'

import { installDiagnosticSink } from '@theocode/shared/diagnostic-sink'

installDiagnosticSink(setDiagnosticsSink)

// B-007 — the error propagates on purpose. Returning `''` here handed the SDK a value it cannot tell
// apart from a real key, so an authentication failure resurfaced later at the provider with a
// message describing neither the cause nor the fix (Unbreakable Rule 8). On a headless surface there
// is no operator watching stderr, which is what made the swallow invisible.
const resolveCredential = async (): Promise<string> =>
  (await resolveFreshCredential({ env: process.env, home: homedir() })).apiKey

export default toAgentFactory(
  async () => {
    // B-001 — the ACP client owns the prompt, so there is no TUI subscribed to the `AskBridge`.
    // Without an explicit surface, `profileTools` falls through to the `'interactive'` default and
    // registers `request_user_input` against that bridge: `ask()` never resolves and every call
    // stalls on the built-in's 5-minute timeout. `chat.ts` documents this hazard for the headless
    // profile; this entry is the same condition. Same value `run-composition.ts` passes.
    return buildChatAgent({ surface: 'headless' })
  },
  {
    apiKey: resolveCredential,
    approvals: { kind: 'owned-by-surface', reason: 'ACP client owns the prompt' },
  },
)
