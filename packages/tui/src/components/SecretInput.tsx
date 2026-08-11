import { Box, Text, useInput } from 'ink'

import { appendKeystroke, submittableSecret } from './secret-buffer.js'
import { type ReactElement, useState } from 'react'

export interface SecretInputProps {
  readonly label: string
  readonly onSubmit: (secret: string) => void
  readonly onCancel: () => void
  readonly isActive?: boolean
}

function isNotTyping(key: {
  ctrl: boolean
  meta: boolean
  tab: boolean
  upArrow: boolean
  downArrow: boolean
}): boolean {
  return key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow
}

export function SecretInput({
  label,
  onSubmit,
  onCancel,
  isActive = true,
}: SecretInputProps): ReactElement {
  const [buffer, setBuffer] = useState('')

  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel()
        return
      }
      if (key.return) {
        const secret = submittableSecret(buffer)
        if (secret === undefined) onCancel()
        else onSubmit(secret)
        return
      }
      if (key.delete || key.backspace) {
        setBuffer((b) => b.slice(0, -1))
        return
      }
      if (isNotTyping(key)) return
      if (input.length > 0) setBuffer((b) => appendKeystroke(b, input))
    },
    { isActive },
  )

  return (
    <Box flexDirection="column">
      <Text dimColor>{label}</Text>
      <Text>
        {'> '}
        {'•'.repeat(buffer.length)}
      </Text>
      <Text dimColor>enter confirms · esc cancels · the key is not echoed</Text>
    </Box>
  )
}
