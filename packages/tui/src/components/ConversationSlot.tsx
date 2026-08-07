import type { Dispatch, ReactElement, SetStateAction } from 'react'
import { homedir } from 'node:os'

import { ChatComposer, FreeTextInput } from '@theokit/tui'

import { abandonQuestion, answerQuestion } from '@theocode/agent/ask'
import { login } from '@theocode/agent/auth'
import { BUILTIN_COMMANDS } from '../commands/index.js'
import { PLACEHOLDER } from '../theme.js'
import { DemoSurface } from './Demos.js'
import type { Mode, ToastPayload } from '../screen-types.js'
import { SecretInput } from './SecretInput.js'

function CredentialField({
  provider,
  setToast,
  setLoginProvider,
}: {
  provider: string
  setToast: Dispatch<SetStateAction<ToastPayload | null>>
  setLoginProvider: Dispatch<SetStateAction<string | undefined>>
}): ReactElement {
  return (
    <SecretInput
      label={`API key for ${provider} — nada é ecoado`}
      onSubmit={(key) => {
        setLoginProvider(undefined)
        try {
          const r = login(key, homedir(), { provider: provider as never })
          setToast({
            message: `Chave salva para ${r.provider} em ${r.path}`,
            variant: 'success',
          })
        } catch (e) {
          setToast({ message: `Login failed: ${(e as Error).message}`, variant: 'error' })
        }
      }}
      onCancel={() => {
        setLoginProvider(undefined)
        setToast({ message: 'Login cancelado — nenhuma key foi salva', variant: 'info' })
      }}
    />
  )
}

function AgentQuestion({
  question,
  currentSessionId,
  setPendingQuestion,
}: {
  question: string
  currentSessionId: () => string
  setPendingQuestion: Dispatch<SetStateAction<string | undefined>>
}): ReactElement {
  return (
    <FreeTextInput
      label={question}
      onSubmit={(text) => {
        if (answerQuestion(text, currentSessionId())) setPendingQuestion(undefined)
      }}
      onCancel={() => {
        abandonQuestion(currentSessionId())
        setPendingQuestion(undefined)
      }}
    />
  )
}

export interface ConversationSlotProps {
  readonly loginProvider: string | undefined
  readonly pendingQuestion: string | undefined
  readonly mode: Mode
  readonly elapsed: number
  readonly exitArmed: boolean
  readonly clearEpoch: number
  readonly lastUsage: { totalTokens?: number } | undefined
  readonly backtrack: { sementeDoComposer: string }
  readonly currentSessionId: () => string
  readonly handleSubmit: (text: string) => void
  readonly backToChat: () => void
  readonly setToast: Dispatch<SetStateAction<ToastPayload | null>>
  readonly setComposerText: Dispatch<SetStateAction<string>>
  readonly setPendingQuestion: Dispatch<SetStateAction<string | undefined>>
  readonly setLoginProvider: Dispatch<SetStateAction<string | undefined>>
  readonly setShowHelp: Dispatch<SetStateAction<boolean>>
}

export function ConversationSlot({
  loginProvider,
  pendingQuestion,
  mode,
  elapsed,
  exitArmed,
  clearEpoch,
  lastUsage,
  backtrack,
  currentSessionId,
  handleSubmit,
  backToChat,
  setToast,
  setComposerText,
  setPendingQuestion,
  setLoginProvider,
  setShowHelp,
}: ConversationSlotProps): ReactElement {
  return (
    <>
      {loginProvider !== undefined ? (
        <CredentialField
          provider={loginProvider}
          setToast={setToast}
          setLoginProvider={setLoginProvider}
        />
      ) : pendingQuestion !== undefined ? (
        <AgentQuestion
          question={pendingQuestion}
          currentSessionId={currentSessionId}
          setPendingQuestion={setPendingQuestion}
        />
      ) : mode !== 'chat' ? (
        <DemoSurface
          mode={mode}
          elapsed={elapsed}
          tokens={lastUsage?.totalTokens}
          onComplete={backToChat}
          onToast={setToast}
        />
      ) : (
        <ChatComposer
          key={clearEpoch}
          initialValue={backtrack.sementeDoComposer}
          onChange={setComposerText}
          placeholder={PLACEHOLDER}
          bordered
          hint={exitArmed ? 'Press Ctrl+C again to quit' : undefined}
          commands={BUILTIN_COMMANDS}
          onHelpToggle={() => setShowHelp((h) => !h)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  )
}
