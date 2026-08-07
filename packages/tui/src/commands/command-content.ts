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
  const { message, attached } = resolveMentions(text, process.cwd())
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
      message: `model: ${SESSION.sessionModel() ?? SESSION.cfg().modelLabel} (use /model <name> para trocar)`,
      variant: 'info',
    })
    return
  }
  SESSION.setSessionModel(target)
  setToast({ message: `this session's model: ${target}`, variant: 'success' })
}

export const PEDIDO_DE_AGENTS_MD =
  'Leia este repositório (estrutura, manifestos, scripts, testes) e escreva um AGENTS.md ' +
  'na raiz descrevendo: o que o projeto é, como rodar/testar/buildar, as convenções de ' +
  'código observadas no próprio código, e as fronteiras que não devem ser cruzadas. ' +
  'Baseie cada afirmação no que você leu — não invente convenção que o código não mostra.'

export function statusPanel(
  SESSION: SessionTheInterpreterUses,
  approvalMode: ApprovalMode,
  currentSessionId: () => string,
  ptyOwner: PtysTheInterpreterUses,
): ContentPanel {
  const c = SESSION.cfg()
  return {
    titulo: 'status da sessão',
    corpo: [
      `model:     ${SESSION.sessionModel() ?? c.modelLabel}`,
      `esforço:    ${SESSION.effort()}`,
      `aprovação:  ${approvalMode}`,
      `sandbox:    ${c.sandboxLabel}`,
      `cwd:        ${process.cwd()}`,
      `sessão:     ${currentSessionId()}`,
      `shells:     ${String(ptyOwner.backend().activeSessionCount())} em background`,
    ].join('\n'),
  }
}

export function diffPanel(): ContentPanel | undefined {
  const r = spawnSync('git', ['diff', '--stat', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' })
  if (r.status !== 0) return undefined
  const detalhe = spawnSync('git', ['diff', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' })
  const corpo = `${r.stdout.trim()}\n\n${detalhe.stdout}`.trim()
  return {
    titulo: 'diff da árvore',
    corpo: corpo.length === 0 ? 'árvore limpa — nenhuma mudança não-commitada' : corpo,
  }
}
