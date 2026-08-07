import { note } from './note.js'

export const MAX_HOOK_CONTINUATIONS = 3

export class ContinuationBudget {
  #used = 0

  get used(): number {
    return this.#used
  }

  request(hookName: string): boolean {
    if (this.#used >= MAX_HOOK_CONTINUATIONS) {
      note(`continuation refused: ${hookName} exhausted the budget of ${MAX_HOOK_CONTINUATIONS}`)
      return false
    }
    this.#used += 1
    return true
  }
}
