import type { Dispatch, ReactElement, SetStateAction } from 'react'
import { homedir } from 'node:os'

import { type ChatComposerCommand, ChatComposer, FreeTextInput } from '@theokit/tui'

import { abandonQuestion, answerQuestion } from '@theocode/agent/ask'
import { login } from '@theocode/agent/auth'
import { BUILTIN_COMMANDS } from '../commands/index.js'
import { submittableSecret } from './secret-buffer.js'
import { PLACEHOLDER } from '../theme.js'
import { DemoSurface } from './Demos.js'
import type { Mode, ToastPayload } from '../screen-types.js'

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
    <FreeTextInput
      label={`API key for ${provider} — nothing is echoed`}
      // `mask` is the framework's since @theokit/tui@0.53.0 — it renders a placeholder and strips a
      // pasted newline, which is what the local `SecretInput` existed to do.
      mask
      onSubmit={(raw) => {
        // Trim and empty-cancel stay HERE: they are product policy, not rendering, and
        // `submittableSecret` carries both with the reason and the test they were written with.
        const key = submittableSecret(raw)
        if (key === undefined) {
          setLoginProvider(undefined)
          setToast({ message: 'Login cancelled — no key was saved', variant: 'info' })
          return
        }
        setLoginProvider(undefined)
        try {
          const r = login(key, homedir(), { provider: provider as never })
          setToast({
            message: `Key saved for ${r.provider} at ${r.path}`,
            variant: 'success',
          })
        } catch (e) {
          setToast({ message: `Login failed: ${(e as Error).message}`, variant: 'error' })
        }
      }}
      onCancel={() => {
        setLoginProvider(undefined)
        setToast({ message: 'Login cancelled — no key was saved', variant: 'info' })
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

/**
 * B-011 — every command the composer can route, builtins and user-defined alike.
 *
 * Custom commands were routable and listed in the `?` panel, but were never handed to the composer,
 * so the `/` menu did not offer them: discoverable only by reading the help. The SDK filters this
 * list by prefix — it simply was never given them.
 */
function composerCommands(
  custom: ReadonlyMap<string, { name: string; description?: string }>,
): readonly ChatComposerCommand[] {
  return [
    ...BUILTIN_COMMANDS,
    ...[...custom.values()].map((c) => ({
      name: c.name,
      description: c.description ?? 'custom command',
    })),
  ]
}

export interface ConversationSlotProps {
  readonly customCommands: ReadonlyMap<string, { name: string; description?: string }>
  readonly loginProvider: string | undefined
  readonly pendingQuestion: string | undefined
  readonly mode: Mode
  readonly elapsed: number
  readonly exitArmed: boolean
  readonly clearEpoch: number
  readonly lastUsage: { totalTokens?: number } | undefined
  readonly backtrack: { composerSeed: string }
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
  customCommands,
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
          initialValue={backtrack.composerSeed}
          onChange={setComposerText}
          placeholder={PLACEHOLDER}
          bordered
          hint={exitArmed ? 'Press Ctrl+C again to quit' : undefined}
          commands={composerCommands(customCommands)}
          onHelpToggle={() => setShowHelp((h) => !h)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  )
}
