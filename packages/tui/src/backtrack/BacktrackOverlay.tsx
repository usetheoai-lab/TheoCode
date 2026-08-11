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

/**
 * B-011 — deliberately NOT the SDK's `windowFor`, and here is why, so the two do not drift silently.
 *
 * `windowFor` is a TRAILING window: it keeps the active row at the BOTTOM, which is the slash-menu
 * behaviour where new matches arrive below. This is a history scrubber: the selection belongs in the
 * MIDDLE, because moving through turns means wanting to see what sits on either side of you.
 *
 * `WindowView` also reports overflow as `overflowUp`/`overflowDown` booleans, and the overlay renders
 * "N hidden" — a boolean cannot be turned back into a count. That half is an SDK gap (U-10).
 *
 * `backtrack-window.test.ts` pins both properties, so migrating to `windowFor` would fail loudly
 * instead of quietly changing how the overlay reads.
 */
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

function overlayHeader(selected: number, count: number): string {
  return selected >= 0
    ? `↑ backtrack: message ${String(selected + 1)}/${String(count)} — Enter to edit · Esc for older`
    : `↑ backtrack: ${String(count)} message(s) — Esc selects (newest first)`
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
      {hiddenBefore > 0 ? <Text dimColor> … {hiddenBefore} older</Text> : null}
      {rows.map((r) => (
        <Text key={r.index} inverse={r.selected} dimColor={!r.selected}>
          {r.selected ? '❯ ' : '  '}
          {r.index + 1}. {oneLine(r.text)}
        </Text>
      ))}
      {hiddenAfter > 0 ? <Text dimColor> … {hiddenAfter} newer</Text> : null}
    </Box>
  )
}
