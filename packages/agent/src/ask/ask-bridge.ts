
interface PendingQuestion {
  question: string
  resolve: (answer: string) => void
  // B-004 — captured so a question can be WITHDRAWN as well as answered. Without it, `abandon()`
  // had no way to settle the promise it was discarding, and the turn stayed blocked until timeout.
  reject: (reason: Error) => void
}

const THREAD_PADRAO = '__default__'

import { ConcurrentQuestionError } from './concurrent-question-error.js'
import { QuestionAbandonedError } from './question-abandoned-error.js'
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
    return new Promise<string>((resolve, reject) => {
      this.pending.set(threadId, { question, resolve, reject })
      this.notificar?.()
    })
  }

  abandon(threadId = THREAD_PADRAO): void {
    const p = this.pending.get(threadId)
    this.pending.delete(threadId)
    // B-004 — settle before notifying. Dropping the entry without rejecting left the caller's
    // promise pending forever: the surface released the slot and the turn stayed blocked until the
    // built-in's 5-minute timeout, which reads to the user as the UI and the model disagreeing.
    p?.reject(new QuestionAbandonedError(threadId))
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
        `[ask-bridge] answer for "${threadId}" with no pending question` +
          (abertas.length > 0
            ? ` — pending em: ${abertas.join(', ')}`
            : ' — no open question') +
          ' (sob a TUI este aviso vai para .theokit/tui-stderr.log)',
      )
      return false
    }
    this.pending.delete(threadId)
    p.resolve(answer)
    this.notificar?.()
    return true
  }

  subscribe(listener: () => void): () => void {
    this.notificar = listener
    return () => {
      if (this.notificar === listener) this.notificar = undefined
    }
  }
}

export const surfaceBridge = new AskBridge()

export const ask = (question: string, threadId?: string): Promise<string> =>
  surfaceBridge.perguntar(question, threadId)

export const abandonQuestion = (threadId?: string): void => surfaceBridge.abandon(threadId)

export const currentQuestion = (threadId: string): string | undefined =>
  surfaceBridge.currentQuestion(threadId)
export const answerQuestion = (answer: string, threadId: string): boolean =>
  surfaceBridge.responder(answer, threadId)
export const subscribe = (listener: () => void): (() => void) => surfaceBridge.subscribe(listener)
