import { spawnSync } from 'node:child_process'

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import type { ApprovalMode } from '../consent/index.js'
import type { ContentPanel, ToastPayload } from '../screen-types.js'
import { resolveMentions } from './mentions.js'
import type {
  AgentTheInterpreterUses,
  PtysTheInterpreterUses,
  SessionTheInterpreterUses,
} from './command-capabilities.js'
import { workingDirectory } from '../working-directory.js'

export function sendMessage(
  text: string,
  goalActive: boolean,
  agent: AgentTheInterpreterUses,
  lastSentMessage: MutableRefObject<string | null>,
  setToast: Dispatch<SetStateAction<ToastPayload | null>>,
): void {
  if (goalActive) {
    setToast({
      message: 'A goal is running — wait for it, or press Esc to abort, before sending',
      variant: 'info',
    })
    return
  }
  const { message, attached } = resolveMentions(text, workingDirectory())
  if (attached.length > 0) {
    setToast({ message: `Attached: ${attached.join(', ')}`, variant: 'info' })
  }
  lastSentMessage.current = message
  agent.send({ message })
}

export function switchModel(
  arg: string,
  SESSION: SessionTheInterpreterUses,
  setToast: Dispatch<SetStateAction<ToastPayload | null>>,
): void {
  const target = arg.trim()
  if (target.length === 0) {
    setToast({
      message: `model: ${SESSION.sessionModel() ?? SESSION.cfg().modelLabel} (use /model <name> to switch)`,
      variant: 'info',
    })
    return
  }
  SESSION.setSessionModel(target)
  setToast({ message: `this session's model: ${target}`, variant: 'success' })
}

export const AGENTS_MD_REQUEST =
  'Read this repository (structure, manifests, scripts, tests) and write an AGENTS.md at the ' +
  'root describing: what the project is, how to run/test/build it, the code conventions observed ' +
  'in the code itself, and the boundaries that must not be crossed. ' +
  'Base every statement on what you read — do not invent a convention the code does not show.'

export function statusPanel(
  SESSION: SessionTheInterpreterUses,
  approvalMode: ApprovalMode,
  currentSessionId: () => string,
  ptyOwner: PtysTheInterpreterUses,
): ContentPanel {
  const c = SESSION.cfg()
  return {
    title: 'session status',
    body: [
      `model:     ${SESSION.sessionModel() ?? c.modelLabel}`,
      `effort:     ${SESSION.effort()}`,
      `approval:   ${approvalMode}`,
      `sandbox:    ${c.sandboxLabel}`,
      `cwd:        ${workingDirectory()}`,
      `session:    ${currentSessionId()}`,
      `shells:     ${String(ptyOwner.backend().activeSessionCount())} in background`,
    ].join('\n'),
  }
}

export function diffPanel(): ContentPanel | undefined {
  const r = spawnSync('git', ['diff', '--stat', 'HEAD'], { cwd: workingDirectory(), encoding: 'utf8' })
  if (r.status !== 0) return undefined
  const detail = spawnSync('git', ['diff', 'HEAD'], { cwd: workingDirectory(), encoding: 'utf8' })
  const stat = r.stdout.trim()
  const patch = detail.stdout
  if (stat.length === 0 && patch.trim().length === 0) {
    return { title: 'working tree diff', body: 'clean working tree — no uncommitted changes' }
  }
  return {
    title: 'working tree diff',
    body: stat,
    ...(patch.trim().length > 0 ? { patch } : {}),
  }
}
