import { homedir } from 'node:os'

import { Box, Text } from 'ink'
import { type ReactElement } from 'react'

import { AGENT } from '@theocode/shared/agent'
import { WelcomeBanner } from '@theokit/tui'
import { ACCENT, BANNER_TIPS, BANNER_WHATS_NEW, LOGO, WIDE_COLS } from '../theme.js'
import { workingDirectory } from '../working-directory.js'

const MODEL = AGENT.model
/**
 * B-057 — read at RENDER, not at import. A module constant is evaluated when the module is first
 * imported, and ESM hoists every import before the first statement runs — so it would capture the
 * directory before `setWorkingDirectory` had a chance to choose one. That is the same shape B-026
 * fixed in the CLI's bootstrap.
 */
const shortCwd = (): string => workingDirectory().replace(homedir(), '~')

/** One heading plus its dim rows — the shape both aside sections share. */
function AsideSection({ title, rows }: { title: string; rows: readonly string[] }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text color={ACCENT} bold>
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {rows.map((row) => (
          <Text key={row} dimColor>
            {row}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

/**
 * B-011 — the SDK's `WelcomeBanner`, not a hand-rolled copy of it.
 *
 * This used to rebuild the whole two-column welcome box: the bordered frame, the fixed-width left
 * column, the gutter and the right-hand panel. The SDK component does all of that, and the docstring
 * of its `aside` prop names the two headings below — the prop was built for this layout.
 *
 * Adopting it took three upstream fixes, every one found by rendering rather than by reading:
 * U-7 added `art` (this had `aside` and no art, `Banner` had art and no `aside`, so neither could
 * draw both), U-7b sized the art column so an aside cannot compress it, and U-7c stopped the box
 * capping itself at a width sized for the single-column layout, which let content run past the
 * border. Released as `@theokit/tui@0.50.2`.
 *
 * `art` replaces the bold `name` header — the `Banner` idiom U-7 followed — so the welcome line goes
 * in `tagline`, rendered under the art where it sat before.
 *
 * Known limitation, deliberately unchanged: the width gate below reads `process.stdout.columns`
 * globally rather than Ink's `useStdout`, so this component cannot be sized by its renderer.
 * Changing it is a behaviour change to the responsive gate, not part of adopting a component —
 * `Banner.test.tsx` has to set the global to reach the wide path, which keeps the smell visible.
 */
export function Banner(): ReactElement {
  const wide = (process.stdout.columns ?? 80) >= WIDE_COLS
  return (
    <WelcomeBanner
      name={AGENT.name}
      art={LOGO}
      tagline={`✻ Welcome to ${AGENT.name}`}
      hints={[MODEL, `cwd: ${shortCwd()}`]}
      {...(wide
        ? {
            aside: (
              <Box flexDirection="column">
                <AsideSection title="Tips for getting started" rows={BANNER_TIPS} />
                <Box marginTop={1}>
                  <AsideSection title="What's new" rows={BANNER_WHATS_NEW} />
                </Box>
              </Box>
            ),
          }
        : {})}
    />
  )
}
