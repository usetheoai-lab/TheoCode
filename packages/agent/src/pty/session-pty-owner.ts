import { ConfigurationError } from '@theokit/agents'
import type { InteractiveBackend } from '@theokit/agents/interactive'
import { PtyInteractiveBackend } from '@theokit/agents/pty'
import type { PtyInteractiveBackendOptions } from '@theokit/agents/pty'
import { interactiveWrapCommand } from '@theokit/agents/sandbox'
import type { InteractiveWrapOptions, SandboxMode } from '@theokit/agents/sandbox'

export interface BackendComPosse extends InteractiveBackend {
  killAll(): void
  activeSessionCount(): number
}

export interface SessionPtyOwner {
  backend(): BackendComPosse
  setMode(mode: SandboxMode): void
  rotate(): void
  shutdown(): void
}

export const MAX_PTY_SESSIONS = 16

export interface SessionPtyOwnerOptions {
  modoInicial: SandboxMode
  maxSessions: number
  createWrap?: (opts: InteractiveWrapOptions) => (command: string, cwd: string) => string | null
  createBackend?: (opts: PtyInteractiveBackendOptions) => BackendComPosse
}

export function createSessionPtyOwner(opts: SessionPtyOwnerOptions): SessionPtyOwner {
  const { modoInicial, maxSessions } = opts
  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new ConfigurationError(
      `maxSessions deve ser inteiro >= 1 (recebido: ${String(maxSessions)})`,
      { code: 'max_sessions_invalido' },
    )
  }

  const createWrap = opts.createWrap ?? interactiveWrapCommand
  const createBackend =
    opts.createBackend ?? ((o: PtyInteractiveBackendOptions) => new PtyInteractiveBackend(o))

  let modoAtual: SandboxMode = modoInicial

  const novoBackend = (): BackendComPosse =>
    createBackend({
      wrapCommand: (command, cwd) => createWrap({ mode: modoAtual })(command, cwd),
      maxSessions,
    })

  let atual = novoBackend()

  return {
    backend: () => atual,
    setMode: (mode) => {
      modoAtual = mode
    },
    rotate: () => {
      atual.killAll()
      atual = novoBackend()
    },
    shutdown: () => {
      atual.killAll()
    },
  }
}
