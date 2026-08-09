
interface PendingQuestion {
  question: string
  resolve: (answer: string) => void
  // B-004 — captured so a question can be WITHDRAWN as well as answered. Without it, `abandon()`
  // had no way to settle the promise it was discarding, and the turn stayed blocked until timeout.
  reject: (reason: Error) => void
}

const THREAD_PADRAO = '__default__'

import { ConcurrentListenerError } from './concurrent-listener-error.js'
import { ConcurrentQuestionError } from './concurrent-question-error.js'
import { QuestionAbandonedError } from './question-abandoned-error.js'
export { ConcurrentQuestionError } from './concurrent-question-error.js'

export class AskBridge {
  private readonly pending = new Map<string, PendingQuestion>()
  private notify: (() => void) | undefined

  readonly #onDivergence: (msg: string) => void

  constructor(onDivergence: (msg: string) => void = (msg) => process.stderr.write(`${msg}\n`)) {
    this.#onDivergence = onDivergence
  }

  ask(question: string, threadId = THREAD_PADRAO): Promise<string> {
    if (this.pending.has(threadId)) {
      return Promise.reject(new ConcurrentQuestionError(threadId))
    }
    return new Promise<string>((resolve, reject) => {
      this.pending.set(threadId, { question, resolve, reject })
      this.notify?.()
    })
  }

  abandon(threadId = THREAD_PADRAO): void {
    const p = this.pending.get(threadId)
    this.pending.delete(threadId)
    // B-004 — settle before notifying. Dropping the entry without rejecting left the caller's
    // promise pending forever: the surface released the slot and the turn stayed blocked until the
    // built-in's 5-minute timeout, which reads to the user as the UI and the model disagreeing.
    p?.reject(new QuestionAbandonedError(threadId))
    this.notify?.()
  }

  currentQuestion(threadId = THREAD_PADRAO): string | undefined {
    return this.pending.get(threadId)?.question
  }

  answer(answer: string, threadId = THREAD_PADRAO): boolean {
    const p = this.pending.get(threadId)
    if (p === undefined) {
      const openThreads = [...this.pending.keys()]
      this.#onDivergence(
        `[ask-bridge] answer for "${threadId}" with no pending question` +
          (openThreads.length > 0
            ? ` — pending em: ${openThreads.join(', ')}`
            : ' — no open question') +
          ' (sob a TUI este aviso vai para .theokit/tui-stderr.log)',
      )
      return false
    }
    this.pending.delete(threadId)
    p.resolve(answer)
    this.notify?.()
    return true
  }

  /**
   * B-035 — one slot, named for it, and a second set over a live one FAILS.
   *
   * This was `setListener`, which promises a multicast it never provided: it assigned the slot and the
   * previous listener stopped being notified with no error and no warning. Only the TUI ever
   * subscribes, so a multicast nobody asked for is the wrong fix; the right one is a name that does
   * not lie and a refusal instead of a silent winner.
   *
   * The disposer frees the slot, which is what makes a surface restart (the TUI unmounting and
   * remounting) work without a process restart.
   */
  setListener(listener: () => void): () => void {
    if (this.notify !== undefined) {
      throw new ConcurrentListenerError()
    }
    this.notify = listener
    return () => {
      if (this.notify === listener) this.notify = undefined
    }
  }
}

export const surfaceBridge = new AskBridge()

export const ask = (question: string, threadId?: string): Promise<string> =>
  surfaceBridge.ask(question, threadId)

export const abandonQuestion = (threadId?: string): void => surfaceBridge.abandon(threadId)

export const currentQuestion = (threadId: string): string | undefined =>
  surfaceBridge.currentQuestion(threadId)
export const answerQuestion = (answer: string, threadId: string): boolean =>
  surfaceBridge.answer(answer, threadId)
export const setListener = (listener: () => void): (() => void) => surfaceBridge.setListener(listener)
