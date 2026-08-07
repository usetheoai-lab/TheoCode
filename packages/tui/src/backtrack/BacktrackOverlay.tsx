import { Box, Text } from 'ink'
import { type ReactElement } from 'react'

interface OverlayRow {
  text: string
  index: number
  selected: boolean
}

export interface OverlayWindow {
  rows: OverlayRow[]
  hiddenBefore: number
  hiddenAfter: number
}

export function windowAroundSelection(
  previews: string[],
  selected: number,
  maxRows: number,
): OverlayWindow {
  if (previews.length === 0) return { rows: [], hiddenBefore: 0, hiddenAfter: 0 }
  const total = previews.length
  if (total <= maxRows) {
    return {
      rows: previews.map((text, index) => ({ text, index, selected: index === selected })),
      hiddenBefore: 0,
      hiddenAfter: 0,
    }
  }
  const half = Math.floor(maxRows / 2)
  const anchor = selected >= 0 ? selected : total - 1
  const start = Math.min(Math.max(anchor - half, 0), total - maxRows)
  const rows = previews
    .slice(start, start + maxRows)
    .map((text, i) => ({ text, index: start + i, selected: start + i === selected }))
  return { rows, hiddenBefore: start, hiddenAfter: total - (start + maxRows) }
}

export function overlayHeader(selected: number, count: number): string {
  return selected >= 0
    ? `↑ backtrack: mensagem ${selected + 1}/${count} — Enter edita · Esc mais antiga`
    : `↑ backtrack: ${count} mensagem(ns) — Esc seleciona (mais recente primeiro)`
}

function oneLine(text: string, max = 88): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export interface BacktrackOverlayProps {
  previews: string[]
  selected: number
  count: number
  maxRows?: number
}

export function BacktrackOverlay({
  previews,
  selected,
  count,
  maxRows = 7,
}: BacktrackOverlayProps): ReactElement | null {
  if (previews.length === 0) return null
  const { rows, hiddenBefore, hiddenAfter } = windowAroundSelection(previews, selected, maxRows)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">{overlayHeader(selected, count)}</Text>
      {hiddenBefore > 0 ? <Text dimColor> … {hiddenBefore} mais antiga(s)</Text> : null}
      {rows.map((r) => (
        <Text key={r.index} inverse={r.selected} dimColor={!r.selected}>
          {r.selected ? '❯ ' : '  '}
          {r.index + 1}. {oneLine(r.text)}
        </Text>
      ))}
      {hiddenAfter > 0 ? <Text dimColor> … {hiddenAfter} mais recente(s)</Text> : null}
    </Box>
  )
}
