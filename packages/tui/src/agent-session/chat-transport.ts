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
import { workingDirectory } from '../working-directory.js'
export interface ChatTransportDeps {
  getEffort: () => ReasoningEffort
  getSessionId: () => string
  takePendingImages: () => AttachedImage[] | undefined
  takePendingModel: () => string | undefined
  credential: () => ResolvedCredential | { error: Error }
  getSessionPty: () => SessionPtyOwner
  /**
   * B-055 — told when a PreToolUse hook blocks a tool call.
   *
   * A veto reaches the wire as a tool_result with `isError: false` and the message as content, by
   * the SDK's design, so the terminal cannot tell a blocked call from a completed one by looking at
   * it. That is why B-027 deleted the renderer that tried, and why this signal comes from the veto
   * site instead.
   */
  onHookVeto?: (veto: { tool: string; reason: string }) => void
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
          routeToCredential(c, resolveEffectiveConfig({ cwd: workingDirectory() }).model)
        const key = (await resolveCredentialForModel(model, { env: process.env, home: homedir() }))
          .apiKey
        yield* streamAgentTurnInProcess(
          {
            default: buildChatAgent({
              reasoning_effort: deps.getEffort(),
              ...(model !== undefined ? { model } : {}),
              sessionPty: deps.getSessionPty(),
              ...(deps.onHookVeto === undefined ? {} : { onHookVeto: deps.onHookVeto }),
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
