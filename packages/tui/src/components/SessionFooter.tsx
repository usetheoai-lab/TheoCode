import type { ReactElement } from 'react'

import { Text } from 'ink'

import { StatusFooter } from '@theokit/tui'

import { fmtK } from '../formatting/index.js'
import type { ApprovalMode } from '../consent/index.js'
import type { ReasoningEffort } from '@theocode/agent/config'

export interface FooterProps {
  readonly SESSION: {
    sessionModel: () => string | undefined
    cfg: () => {
      modelLabel: string
      sandboxLabel: string
      contextWindow: { window: number; source: string }
    }
  }
  readonly effort: ReasoningEffort
  readonly approvalMode: ApprovalMode
  readonly goalBadge: string
  readonly credentialSource: () => string
  readonly lastUsage: { inputTokens: number } | undefined
}

export function SessionFooter(props: FooterProps): ReactElement {
  const { SESSION, effort, approvalMode, goalBadge, credentialSource, lastUsage } = props
  return (
    <StatusFooter
      left={
        <Text>
          {SESSION.sessionModel() ?? SESSION.cfg().modelLabel} {effort} · {approvalMode} ·{' '}
          {SESSION.cfg().sandboxLabel}
          {goalBadge} · {credentialSource()}
        </Text>
      }
      right={
        lastUsage ? (
          <Text>
            {fmtK(lastUsage.inputTokens)}/{fmtK(SESSION.cfg().contextWindow.window)} context
            {/* M94 — a FALLBACK budget is a guess, and now presents itself as one. With no
                  catalogue entry the resolution falls to the conservative floor, and showing it with
                  the same confidence as a measurement made the user trust a number the SDK itself
                  labels uncertain — which is precisely what `source` is for. */}
            {SESSION.cfg().contextWindow.source === 'fallback' ? ' (estimated)' : ''}
          </Text>
        ) : undefined
      }
      hint="? for shortcuts"
    />
  )
}
