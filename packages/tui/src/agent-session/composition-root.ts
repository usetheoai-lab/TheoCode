import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { resolveTrustPosture } from '@theocode/agent/config'
import { createSessionPtyOwner, MAX_PTY_SESSIONS } from '@theocode/agent/pty'
import { forkSession } from '@theocode/agent/session'

import { createChatTransport } from './chat-transport.js'
import { apiKey, credential } from './credential-helpers.js'
import { loadCustomCommands } from '../commands/index.js'
import { forkCurrentSessionWith } from '../persistence/index.js'
import { createTuiSession, type TuiSession } from './tui-session.js'
import { persistSessionId } from '../persistence/index.js'

export interface TuiRoot {
  readonly session: TuiSession
  readonly ptyOwner: ReturnType<typeof createSessionPtyOwner>
  readonly transport: ReturnType<typeof createChatTransport>
  readonly initialPosture: ReturnType<typeof resolveTrustPosture>
  readonly sessionPointer: string
  readonly goalPointer: string
  readonly resumeOnStartup: boolean
  readonly customCommands: ReturnType<typeof loadCustomCommands>
  readonly customCommandNames: ReadonlySet<string>
  readonly resetSession: () => void
  readonly sessionFork: () => { newId: string; copied: boolean }
  readonly pointToSession: (id: string) => void
}

function build(): TuiRoot {
  const cwd = process.cwd()
  const sessionPointer = join(cwd, '.theokit', 'tui-session')
  const resumeOnStartup = existsSync(sessionPointer)

  const session = createTuiSession({ cwd, sessionPointer })

  const initialPosture = resolveTrustPosture(cwd)

  const ptyOwner = createSessionPtyOwner({
    modoInicial: session.cfg().sandbox_mode,
    maxSessions: MAX_PTY_SESSIONS,
  })

  const customCommands = loadCustomCommands({
    projectDir: cwd,
    homeDir: homedir(),
    projectTrusted: initialPosture.allows.customCommands,
    warn: (m) => process.stderr.write(`${m}\n`),
  })

  const transport = createChatTransport({
    getEffort: () => session.effort(),
    getSessionId: () => session.session(),
    getSessionPty: () => ptyOwner,
    takePendingImages: () => session.tomarImagens(),
    takePendingModel: () => session.takeModel(),
    apiKey,
    credential,
  })

  return {
    session,
    ptyOwner,
    transport,
    initialPosture,
    sessionPointer,
    goalPointer: join(cwd, '.theokit', 'tui-goal.json'),
    resumeOnStartup,
    customCommands,
    customCommandNames: new Set(customCommands.keys()),
    resetSession: () => {
      session.setSession(`tui-${randomUUID()}`)
      ptyOwner.rotate()
      void persistSessionId(sessionPointer, session.session())
    },
    sessionFork: () =>
      forkCurrentSessionWith({
        newId: () => `tui-${randomUUID()}`,
        fork: (de, para) => forkSession(de, para),
        current: () => session.session(),
        commit: (id) => {
          session.setSession(id)
          void persistSessionId(sessionPointer, id)
        },
      }),
    pointToSession: (id) => {
      session.setSession(id)
      void persistSessionId(sessionPointer, id)
    },
  }
}

let root: TuiRoot | undefined

export function getTuiRoot(): TuiRoot {
  root ??= build()
  return root
}

