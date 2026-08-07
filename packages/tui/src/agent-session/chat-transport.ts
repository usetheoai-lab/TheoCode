import { homedir } from 'node:os'

import { InProcessTransport } from '@theokit/agents/client'
import { streamAgentTurnInProcess } from '@theokit/agents'

import { buildChatAgent } from '@theocode/agent'
import { resolveEffectiveConfig, type ReasoningEffort } from '@theocode/agent/config'
import {
  resolveCredentialForModel,
  routeToCredential,
  type ResolvedCredential,
} from '@theocode/agent/auth'
import type { AttachedImage } from '@theocode/agent/context'
import type { SessionPtyOwner } from '@theocode/agent/pty'
export interface ChatTransportDeps {
  getEffort: () => ReasoningEffort
  getSessionId: () => string
  takePendingImages: () => AttachedImage[] | undefined
  takePendingModel: () => string | undefined
  apiKey: () => string
  credential: () => ResolvedCredential | { error: Error }
  getSessionPty: () => SessionPtyOwner
}

export function createChatTransport(deps: ChatTransportDeps): InProcessTransport {
  return new InProcessTransport({
    run: (input) =>
      (async function* () {
        const images = deps.takePendingImages()
        const c = deps.credential()
        const commandModel = deps.takePendingModel()
        const model =
          commandModel ??
          routeToCredential(c, resolveEffectiveConfig({ cwd: process.cwd() }).model)
        const key = (await resolveCredentialForModel(model, { env: process.env, home: homedir() }))
          .apiKey
        yield* streamAgentTurnInProcess(
          {
            default: buildChatAgent({
              reasoning_effort: deps.getEffort(),
              ...(model !== undefined ? { model } : {}),
              sessionPty: deps.getSessionPty(),
            }),
          },
          key,
          {
            ...input,
            sessionId: deps.getSessionId(),
            ...(images !== undefined ? { images } : {}),
          },
        )
      })(),
  })
}
