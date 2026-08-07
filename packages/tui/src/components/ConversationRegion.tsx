import type { ReactElement } from 'react'

import { Box, Text } from 'ink'

import { AgentStreaming, AgentTimeline, DiffViewer, Notice, Toast } from '@theokit/tui'
import { UsagePanel } from './UsagePanel.js'
import { BacktrackOverlay } from '../backtrack/index.js'
import { KeyboardHelp, DEFAULT_COMPOSER_SHORTCUTS } from '@theokit/tui'

import { formatTurnError } from '../formatting/index.js'
import { THINKING_PHRASES } from '../theme.js'
import { Banner } from './Banner.js'
import type { ContentPanel } from '../rendering/index.js'
import type { ToastPayload } from '../screen-types.js'

export interface ConversationRegionProps {
  readonly clearEpoch: number
  readonly events: Parameters<typeof AgentTimeline>[0]['events']
  readonly streaming: boolean
  readonly elapsed: number
  readonly lastUsage: Parameters<typeof UsagePanel>[0]['usage'] | undefined
  readonly agentError: Error | undefined
  readonly credentialError: () => string | undefined
  readonly panel: ContentPanel | undefined
  readonly showUsage: boolean
  readonly reviewResult: string | null
  readonly goalFeed: string | null
  readonly toast: ToastPayload | null
  readonly contextWindow: number
  readonly backtrack: { armed: boolean; previews: readonly string[]; nth: number; total: number }
  readonly showHelp: boolean
  readonly customCommands: ReadonlyMap<
    string,
    { name: string; hints: string[]; description?: string }
  >
  readonly setToast: (t: ToastPayload | null) => void
}

function ConversationOverlays(props: ConversationRegionProps): ReactElement {
  return (
    <>
      {props.reviewResult !== null ? <Notice>{props.reviewResult}</Notice> : null}
      {/* #63 — o feed do goal é renderizado LINHA A LINHA, com key própria por line.
        Uma string multi-line como filho único faz o React reconciliar o bloco inteiro por
        índice, e o log da arena mostrava um flood de `Encountered two children with the same
        key, '0'` durante o run. Quando a reconciliação corrompe, os `props.setGoalFeed` seguintes
        são engolidos: o loop completa (`[goal] status=completed turns=3`) com a UI MUDA, que é
        o pior desfecho para um feed de progresso — o usuário não sabe se o loop está vivo.

        A key é `índice + conteúdo`, não só o índice: o feed é append-only, então o índice
        sozinho já seria estável, mas duas lines idênticas em posições diferentes (dois
        `● status` iguais) colidiriam num diff por conteúdo. */}
      {props.goalFeed !== null ? (
        <Notice>
          {props.goalFeed.split('\n').map((line, i) => (
            <Text key={`${String(i)}:${line}`}>
              {line}
              {'\n'}
            </Text>
          ))}
        </Notice>
      ) : null}
      {/* M65 — durante o props.backtrack (Esc-ladder), destaca o turno selecionado numa superfície NOVA do
        live region (não a timeline <Static>, que congela células antigas). Reativo ao rewindNth. */}
      {props.backtrack.armed ? (
        <BacktrackOverlay
          previews={[...props.backtrack.previews]}
          selected={props.backtrack.nth}
          count={props.backtrack.total}
        />
      ) : null}
      {props.showHelp ? (
        <KeyboardHelp
          shortcuts={[
            ...DEFAULT_COMPOSER_SHORTCUTS,
            ...[...props.customCommands.values()].map((c) => ({
              keys: `/${c.name}${c.hints.length > 0 ? ` ${c.hints.join(' ')}` : ''}`,
              description: c.description ?? 'custom command',
            })),
          ]}
        />
      ) : null}
    </>
  )
}

/**
 * B-011 — the `/diff` and `/status` panel.
 *
 * `DiffViewer` takes unified-diff text, which is exactly what `git diff` emits and what its own
 * docstring names as the shape agent tools produce. The panel used to print that text as one plain
 * blob: no gutter, no colour, no folding, and cut off by the terminal because nothing scrolled.
 */
function ContentPanelView({ panel }: { panel: ContentPanel }): ReactElement {
  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1}>
      <Text bold>{panel.titulo} (Esc to close)</Text>
      {panel.corpo.length > 0 ? <Text>{panel.corpo}</Text> : null}
      {panel.patch !== undefined ? (
        <DiffViewer patch={panel.patch} maxLines={400} contextLines={3} />
      ) : null}
    </Box>
  )
}

export function ConversationRegion(props: ConversationRegionProps): ReactElement {
  return (
    <>
      <AgentTimeline key={props.clearEpoch} events={props.events} header={<Banner />} />

      {props.streaming ? (
        <AgentStreaming
          phrases={THINKING_PHRASES}
          shimmer
          elapsedSeconds={props.elapsed}
          tokens={props.lastUsage?.totalTokens}
          tokenDirection="down"
          showCancelHint
        />
      ) : null}
      {/* M30 — a credential problem is surfaced AT STARTUP with its actionable message, not
          swallowed until a turn fails. The DoD is explicit that validation happens at startup:
          a key declared for one provider that carries another's prefix, a world-readable file,
          or nothing configured at all must all say so here, with the fix. */}
      {props.credentialError() !== undefined ? (
        <Notice variant="error">{props.credentialError()}</Notice>
      ) : null}
      {/* M85 — bifurca: transitório aponta /retry, fatal não (retentar não ajudaria). */}
      {props.agentError ? (
        <Notice variant="error">{formatTurnError(props.agentError)}</Notice>
      ) : null}
      {/* `/usage` — the observability panel, from the last turn's real usage. */}
      {props.panel !== undefined ? <ContentPanelView panel={props.panel} /> : null}
      {props.showUsage && props.lastUsage ? (
        <UsagePanel usage={props.lastUsage} contextWindow={props.contextWindow} />
      ) : null}
      {/* A transient outcome banner (a demo answered, a task finished). Auto-dismisses after 5s. */}
      {props.toast ? (
        <Toast
          message={props.toast.message}
          variant={props.toast.variant}
          durationMs={props.toast.durationMs}
          onDismiss={() => props.setToast(null)}
        />
      ) : null}

      <ConversationOverlays {...props} />
    </>
  )
}
