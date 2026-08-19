import type { ReactElement } from 'react'

import { Text } from 'ink'

import { StatusFooter, footerHintFor } from '@theokit/tui'

import { contextPressure, fmtK } from '../formatting/index.js'
import { AGENTS_PANEL_WIRED } from './composer-capabilities.js'
import { currentWiring } from '../agent-session/wiring-record.js'
import type { ApprovalMode } from '../consent/index.js'
import type { ReasoningEffort } from '@theocode/agent/config'

/**
 * B-076 — the sandbox the AGENT was built with, falling back to config before the first turn.
 *
 * It used to read `SESSION.cfg()` unconditionally, so after `/sandbox read-only` the footer kept
 * showing the mode the session started with while the agent had already been rebuilt with another.
 * Two sources, one label, and the label was the wrong one — the shape B-069/B-070/B-071 each had to
 * fix in their own listing.
 */
function sandboxLabel(SESSION: FooterProps['SESSION']): string {
  const wired = currentWiring()?.sandboxMode
  // The `sandbox:` prefix belongs to the LABEL, and the record carries the raw mode — re-added here
  // rather than stored twice, so the two cannot drift into different spellings.
  return wired === undefined ? SESSION.cfg().sandboxLabel : `sandbox:${wired}`
}

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
          {sandboxLabel(SESSION)}
          {goalBadge} · {credentialSource()}
        </Text>
      }
      right={
        lastUsage ? (
          <Text>
            {fmtK(lastUsage.inputTokens)}/{fmtK(SESSION.cfg().contextWindow.window)} context
            {/* B-080 — the number alone is data, not a signal: a figure climbing slowly is what
                people stop reading. The mark is the thing the eye catches. */}
            {contextPressure(lastUsage.inputTokens, SESSION.cfg().contextWindow.window) === 'ok'
              ? ''
              : contextPressure(lastUsage.inputTokens, SESSION.cfg().contextWindow.window) ===
                  'critical'
                ? ' !!'
                : ' !'}
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
      hint={footerHintFor({ shortcuts: props.shortcutsAvailable, agents: AGENTS_PANEL_WIRED })}
    />
  )
}
