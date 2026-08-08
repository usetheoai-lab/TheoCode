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
            {/* M94 — um orçamento de FALLBACK é palpite, e passa a se apresentar como tal.
                  Sem entry de catálogo a resolução cai no floor conservador, e mostrá-lo com a
                  mesma confiança de uma medição fazia o usuário trust num número que o SDK
                  já rotula como incerto — `source` vem justamente para isso. */}
            {SESSION.cfg().contextWindow.source === 'fallback' ? ' (estimado)' : ''}
          </Text>
        ) : undefined
      }
      hint="? for shortcuts"
    />
  )
}
