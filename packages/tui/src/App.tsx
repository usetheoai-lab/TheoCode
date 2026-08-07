import type { ReactElement } from 'react'

import { InkInputProvider, Stack, TheoTUIProvider } from '@theokit/tui'

import { ConversationRegion } from './components/index.js'
import { SessionFooter } from './components/index.js'
import { InputSlot } from './components/index.js'
import { THEME } from './theme.js'
import { useTuiComposition } from './use-tui-composition.js'

export function App(): ReactElement {
  const tui = useTuiComposition()
  return (
    <TheoTUIProvider theme={THEME}>
      {/* `InkInputProvider` faz a ponte do stdin do Ink para as superfícies interativas; `Stack` dá
          a cadência do Claude Code. */}
      <InkInputProvider>
        <Stack gap={1}>
          <ConversationRegion {...tui.conversationProps} />
          <InputSlot {...tui.propsDoSlot} />
          <SessionFooter {...tui.footerProps} />
        </Stack>
      </InkInputProvider>
    </TheoTUIProvider>
  )
}
