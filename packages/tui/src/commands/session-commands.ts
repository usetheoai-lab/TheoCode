import { countMemoryFacts } from '../formatting/index.js'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Dispatch, SetStateAction } from 'react'

import {
  archiveSession,
  compactSession,
  legacyRootHint,
  listSessions,
  renameSession,
} from '@theocode/agent/session'
import { resolveTrustPosture } from '@theocode/agent/config'
import {
  logout,
  methodsFor,
  oauthDeviceLogin,
  knownProviders,
} from '@theocode/agent/auth'
import type { AuthMethod } from '@theokit/agents/auth'
import type { ToastPayload } from '../screen-types.js'
import { workingDirectory } from '../working-directory.js'

type SetToast = Dispatch<SetStateAction<ToastPayload | null>>

const KNOWN_PROVIDERS = knownProviders()

function knownMethodsFor(name: string): readonly AuthMethod[] | undefined {
  const p = KNOWN_PROVIDERS.includes(name) ? name : undefined
  return p === undefined ? undefined : methodsFor(p)
}

function loginAnnouncement(arg: string): {
  provider: string
  message: string
  canDevice: boolean
} {
  const provider = arg.trim().length > 0 ? arg.trim() : 'openai'
  const methods = knownMethodsFor(provider)
  if (methods === undefined) {
    return {
      provider,
      message: `unknown provider "${provider}". Known: ${KNOWN_PROVIDERS.join(', ')}.`,
      canDevice: false,
    }
  }
  const labels = methods.map((m) => m.label).join(' · ')
  const canDevice = methods.some((m) => m.type === 'oauth')
  return {
    provider,
    message: canDevice
      ? `Login methods for ${provider}: ${labels}`
      : `${provider} offers no device login. Use: ${labels}.`,
    canDevice,
  }
}

export function handleLogout(setToast: SetToast): void {
  const removed = logout(homedir())
  setToast({
    message: removed ? 'Logged out — credential file removed' : 'Not logged in',
    variant: 'info',
  })
}

export const DEVICE_PROMPT_DURATION_MS = 10 * 60_000

export function handleLogin(
  arg: string,
  setToast: SetToast,
  askForKey?: (provider: string) => void,
  deps?: { oauth?: typeof oauthDeviceLogin },
): void {
  const parts = arg
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  const askedForKey = parts.at(-1)?.toLowerCase() === 'key'
  const withoutSelector = (askedForKey ? parts.slice(0, -1) : parts).join(' ')

  const announcement = loginAnnouncement(withoutSelector)
  setToast({ message: announcement.message, variant: 'info' })

  if (askedForKey || !announcement.canDevice) {
    if (askForKey !== undefined) askForKey(announcement.provider)
    return
  }

  const start = deps?.oauth ?? oauthDeviceLogin
  void start(announcement.provider as Parameters<typeof oauthDeviceLogin>[0], homedir(), {
    onPrompt: ({ userCode, verificationUri }) =>
      setToast({
        message: `Open ${verificationUri} and enter code: ${userCode}`,
        variant: 'info',
        durationMs: DEVICE_PROMPT_DURATION_MS,
      }),
  })
    .then((r) =>
      setToast({
        message: `Logged in via OAuth (${r.provider})${r.accountId !== undefined ? ` — account ${r.accountId}` : ''}. Restart to refresh the footer.`,
        variant: 'success',
      }),
    )
    .catch((e: unknown) =>
      setToast({ message: `Login failed: ${(e as Error).message}`, variant: 'error' }),
    )
}

export function handleFork(
  forkCurrentSession: () => { newId: string; copied: boolean },
  setToast: SetToast,
): void {
  let result: { newId: string; copied: boolean }
  try {
    result = forkCurrentSession()
  } catch (e) {
    setToast({ message: `Fork failed: ${(e as Error).message}`, variant: 'error' })
    return
  }
  const { newId, copied } = result
  setToast({
    message: copied
      ? `Forked → ${newId} — the context was copied; this session continues from it.`
      : `Forked → ${newId} — no prior transcript yet, so a fresh session.`,
    variant: 'success',
  })
}

export function handleListSessions(currentSessionId: () => string, setToast: SetToast): void {
  const cur = currentSessionId()
  void listSessions()
    .then((sessions) => {
      if (sessions.length === 0) {
        const hint = legacyRootHint(0, join(homedir(), '.theokit'))
        setToast({ message: hint ?? 'No sessions yet.', variant: 'info' })
        return
      }
      const lines = sessions
        .map(
          (s) =>
            `${s.agentId === cur ? '● ' : '  '}${s.name ?? s.agentId}${s.archived ? ' (archived)' : ''}`,
        )
        .join('\n')
      setToast({ message: `Sessions (${sessions.length}):\n${lines}`, variant: 'info' })
    })
    .catch((e: unknown) =>
      setToast({ message: `List failed: ${(e as Error).message}`, variant: 'error' }),
    )
}

export function handleArchive(
  arg: string,
  deps: { currentSessionId: () => string; resetSession: () => void; setToast: SetToast },
): void {
  const { currentSessionId, resetSession, setToast } = deps
  const target = arg.trim().length > 0 ? arg.trim() : currentSessionId()
  const isCurrent = target === currentSessionId()
  void archiveSession(target)
    .then(() => {
      if (isCurrent) resetSession()
      setToast({
        message: `Archived ${target}${isCurrent ? ' — started a fresh session.' : '.'}`,
        variant: 'success',
      })
    })
    .catch((e: unknown) =>
      setToast({ message: `Archive failed: ${(e as Error).message}`, variant: 'error' }),
    )
}

export function handleRename(
  arg: string,
  currentSessionId: () => string,
  setToast: SetToast,
): void {
  const name = arg.trim()
  if (name.length === 0) {
    setToast({ message: 'Usage: /rename <new name>', variant: 'info' })
    return
  }
  void renameSession(currentSessionId(), name)
    .then(() =>
      setToast({ message: `Renamed the current session to “${name}”.`, variant: 'success' }),
    )
    .catch((e: unknown) =>
      setToast({ message: `Rename failed: ${(e as Error).message}`, variant: 'error' }),
    )
}

export function handleMemoryInfo(setToast: SetToast): void {
  const memPath = join(workingDirectory(), '.theokit', 'memory', 'MEMORY.md')
  const memTrusted = resolveTrustPosture(workingDirectory()).allows.memory
  let factCount = 0
  try {
    factCount = countMemoryFacts(readFileSync(memPath, 'utf8'))
  } catch {
    // no store yet — factCount stays 0
  }
  process.stderr.write(`[memory] enabled=${memTrusted} facts=${factCount}\n`)
  setToast({
    message: memTrusted
      ? `Memory ON (trusted dir) — ${factCount} fact(s) at ${memPath}. Say "Remember: <fact>" to store one.`
      : 'Memory OFF — directory is untrusted (memory writes to the repo; trust the dir to enable).',
    variant: 'info',
  })
}

export function handleCompact(sessionId: string, setToast: SetToast): void {
  void (async () => {
    try {
      const { preTokens, postTokens } = await compactSession(sessionId)
      process.stderr.write(`[compact] pre=${preTokens} post=${postTokens}\n`)
      setToast({
        message: `Context compacted (~${preTokens}→~${postTokens} tokens) — next turn runs on the compacted history. Heads up: multiple compactions can reduce accuracy; consider /new for unrelated work.`,
        variant: 'success',
      })
    } catch (err) {
      setToast({
        message: `/compact failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'error',
      })
    }
  })()
}
