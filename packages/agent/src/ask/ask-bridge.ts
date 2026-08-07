
interface PendingQuestion {
  question: string
  resolve: (answer: string) => void
}

const THREAD_PADRAO = '__default__'

import { ConcurrentQuestionError } from './concurrent-question-error.js'
export { ConcurrentQuestionError } from './concurrent-question-error.js'

export class AskBridge {
  private readonly pending = new Map<string, PendingQuestion>()
  private notificar: (() => void) | undefined

  readonly #aoDivergir: (msg: string) => void

  constructor(aoDivergir: (msg: string) => void = (msg) => process.stderr.write(`${msg}\n`)) {
    this.#aoDivergir = aoDivergir
  }

  perguntar(question: string, threadId = THREAD_PADRAO): Promise<string> {
    if (this.pending.has(threadId)) {
      return Promise.reject(new ConcurrentQuestionError(threadId))
    }
    return new Promise<string>((resolve) => {
      this.pending.set(threadId, { question, resolve })
      this.notificar?.()
    })
  }

  abandonar(threadId = THREAD_PADRAO): void {
    this.pending.delete(threadId)
    this.notificar?.()
  }

  currentQuestion(threadId = THREAD_PADRAO): string | undefined {
    return this.pending.get(threadId)?.question
  }

  responder(answer: string, threadId = THREAD_PADRAO): boolean {
    const p = this.pending.get(threadId)
    if (p === undefined) {
      const abertas = [...this.pending.keys()]
      this.#aoDivergir(
        `[ask-bridge] resposta para "${threadId}" sem question pendente` +
          (abertas.length > 0
            ? ` — pending em: ${abertas.join(', ')}`
            : ' — nenhuma question aberta') +
          ' (sob a TUI este aviso vai para .theokit/tui-stderr.log)',
      )
      return false
    }
    this.pending.delete(threadId)
    p.resolve(answer)
    this.notificar?.()
    return true
  }

  assinar(listener: () => void): () => void {
    this.notificar = listener
    return () => {
      if (this.notificar === listener) this.notificar = undefined
    }
  }
}

export const surfaceBridge = new AskBridge()

export const ask = (question: string, threadId?: string): Promise<string> =>
  surfaceBridge.perguntar(question, threadId)

export const abandonQuestion = (threadId?: string): void => surfaceBridge.abandonar(threadId)

export const currentQuestion = (threadId: string): string | undefined =>
  surfaceBridge.currentQuestion(threadId)
export const answerQuestion = (answer: string, threadId: string): boolean =>
  surfaceBridge.responder(answer, threadId)
export const subscribe = (listener: () => void): (() => void) => surfaceBridge.assinar(listener)
