import type { ReactElement } from 'react'

import { Text } from 'ink'

import { StatusFooter } from '@theokit/tui'

import { fmtK } from '../formatting/index.js'
import { footerHint } from './composer-shortcuts.js'
import type { ApprovalMode } from '../consent/index.js'
import type { ReasoningEffort } from '@theocode/agent/config'

/**
 * B-067 — this build has no agents panel behind `←`. Flips to `true` in the same commit that wires
 * one (B-072), never before: the footer is not the place to announce intent.
 */
const AGENTS_PANEL_WIRED = false

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
  /** B-046 — whether pressing `?` actually does anything right now. */
  readonly shortcutsAvailable: boolean
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
      // B-067 — never `undefined`: that reaches `StatusFooter`'s default parameter, which
      // advertises every affordance the toolkit can do rather than the ones this build wires.
      hint={footerHint({ shortcuts: props.shortcutsAvailable, agents: AGENTS_PANEL_WIRED })}
    />
  )
}
