import { Box } from 'ink'
import { type ReactElement } from 'react'
import {
  ContextWindowBar,
  CostMeter,
  type TokenCategory,
  TokenUsageChart,
  type TurnUsage,
} from '@theokit/tui'

export function UsagePanel({
  usage,
  contextWindow,
}: {
  usage: TurnUsage
  contextWindow: number
}): ReactElement {
  const chart: Partial<Record<TokenCategory, number>> = {
    input: usage.inputTokens,
    output: usage.outputTokens,
    ...(usage.cacheReadTokens !== undefined ? { cached: usage.cacheReadTokens } : {}),
    ...(usage.reasoningTokens !== undefined ? { reasoning: usage.reasoningTokens } : {}),
  }
  return (
    <Box flexDirection="column">
      <ContextWindowBar usedTokens={usage.inputTokens} limitTokens={contextWindow} />
      <TokenUsageChart usage={chart} />
      {usage.cost !== undefined ? <CostMeter costUsd={usage.cost} /> : null}
    </Box>
  )
}
