import { isTransientError, TheokitAgentError } from '@theokit/agents'

export interface TurnErrorView {
  kind: 'transient' | 'fatal'
  message: string
  hint?: string
}

const FORMA_TRANSITORIA =
  /\b(408|429|500|502|503|504|529|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|socket hang up)\b/i

function textWithCauses(err: Error): string {
  const partes: string[] = []
  let atual: unknown = err
  for (let i = 0; i < 8 && atual instanceof Error; i += 1) {
    partes.push(atual.message)
    atual = (atual as { cause?: unknown }).cause
  }
  if (typeof atual === 'string') partes.push(atual)
  return partes.join(' | ')
}

const RETRY_HINT = '/retry resends the last message'

export function classifyTurnError(err: Error): TurnErrorView {
  const message = err.message.trim() === '' ? 'Erro sem mensagem' : err.message.trim()
  if (isTransientError(err)) return { kind: 'transient', message, hint: RETRY_HINT }
  if (err instanceof TheokitAgentError) return { kind: 'fatal', message }
  if (FORMA_TRANSITORIA.test(textWithCauses(err)))
    return { kind: 'transient', message, hint: RETRY_HINT }
  return { kind: 'fatal', message }
}

export function formatTurnError(err: Error): string {
  const v = classifyTurnError(err)
  return v.hint === undefined ? v.message : `${v.message} — ${v.hint}`
}
