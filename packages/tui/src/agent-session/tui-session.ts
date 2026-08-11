import { randomUUID } from 'node:crypto'

import { resolveEffectiveConfig, type ReasoningEffort } from '@theocode/agent/config'
import type { AttachedImage } from '@theocode/agent/context'

import { loadOrCreateSessionId } from '../persistence/index.js'
import { workingDirectory } from '../working-directory.js'

export interface TuiSession {
  cfg: () => ReturnType<typeof resolveEffectiveConfig>
  reloadConfig: () => void

  effort: () => ReasoningEffort
  setEffort: (e: ReasoningEffort) => void

  session: () => string
  setSession: (id: string) => void

  takeImages: () => AttachedImage[] | undefined
  attachImages: (imgs: AttachedImage[] | undefined) => void

  takeModel: () => string | undefined
  setModel: (m: string | undefined) => void

  sessionModel: () => string | undefined
  setSessionModel: (m: string | undefined) => void
}

export interface SessionOptions {
  readonly cwd?: string
  readonly sessionPointer: string
  readonly loadSession?: (pointer: string, fresh: () => string) => string
  readonly loadConfig?: typeof resolveEffectiveConfig
}

export function createTuiSession(opts: SessionOptions): TuiSession {
  const loadConfig = opts.loadConfig ?? resolveEffectiveConfig
  const loadSession = opts.loadSession ?? loadOrCreateSessionId
  const cwd = opts.cwd ?? workingDirectory()

  let cfg = loadConfig({ cwd })
  let effort: ReasoningEffort = cfg.reasoning_effort
  let session = loadSession(opts.sessionPointer, () => `tui-${randomUUID()}`)
  let images: AttachedImage[] | undefined
  let model: string | undefined
  let fixedModel: string | undefined

  return {
    cfg: () => cfg,
    reloadConfig: () => {
      cfg = loadConfig({ cwd })
      effort = cfg.reasoning_effort
    },
    effort: () => effort,
    setEffort: (e) => {
      effort = e
    },
    session: () => session,
    setSession: (id) => {
      session = id
    },
    takeImages: () => {
      const current = images
      images = undefined
      return current
    },
    attachImages: (imgs) => {
      images = imgs
    },
    takeModel: () => {
      const current = model
      model = undefined
      return current ?? fixedModel
    },
    sessionModel: () => fixedModel,
    setSessionModel: (m) => {
      fixedModel = m
    },
    setModel: (m) => {
      model = m
    },
  }
}
