import { homedir } from 'node:os'

import { Box, Text } from 'ink'
import { type ReactElement } from 'react'

import { AGENT } from '@theocode/shared/agent'
import { ACCENT, BANNER_TIPS, BANNER_WHATS_NEW, LOGO, WIDE_COLS } from '../theme.js'

const APP_NAME = 'Theokit Builder'
const MODEL = AGENT.model
const CWD = process.cwd().replace(homedir(), '~')

export function Banner(): ReactElement {
  const cols = process.stdout.columns ?? 80
  const wide = cols >= WIDE_COLS
  return (
    <Box
      width={cols - 2}
      marginX={1}
      marginY={1}
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor={ACCENT}
      flexDirection="row"
    >
      {/* Fixed-width left column (fits the 34-wide wordmark) so a long cwd truncates instead of pushing
          the right column off-screen — the box stays full width, the content stays grouped on the left. */}
      <Box flexDirection="column" width={38} flexShrink={0}>
        <Text color={ACCENT}>{LOGO}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color={ACCENT} bold wrap="truncate-end">
            ✻ Welcome to {APP_NAME}
          </Text>
          <Text dimColor wrap="truncate-end">
            {MODEL}
          </Text>
          <Text dimColor wrap="truncate-start">
            cwd: {CWD}
          </Text>
        </Box>
      </Box>
      {wide ? (
        <Box flexDirection="column" flexShrink={0} marginLeft={4}>
          <Text color={ACCENT} bold>
            Tips for getting started
          </Text>
          <Box marginTop={1} flexDirection="column">
            {BANNER_TIPS.map((tip) => (
              <Text key={tip} dimColor>
                {tip}
              </Text>
            ))}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={ACCENT} bold>
              What&apos;s new
            </Text>
            <Box marginTop={1} flexDirection="column">
              {BANNER_WHATS_NEW.map((line) => (
                <Text key={line} dimColor>
                  {line}
                </Text>
              ))}
            </Box>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
