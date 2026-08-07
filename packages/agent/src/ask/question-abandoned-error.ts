import { TheokitAgentError } from '@theokit/agents'

/**
 * Raised on the caller's promise when the surface withdraws a question before it is answered.
 *
 * B-004 — `abandonar()` used to delete the pending entry and return, dropping the `resolve` it had
 * captured. The promise handed to the SDK never settled, so pressing ESC released the UI slot while
 * the turn stayed blocked until the built-in's 5-minute timeout.
 *
 * It extends `TheokitAgentError` for the same reason its sibling `ConcurrentQuestionError` does:
 * consumers discriminate on the SDK's error hierarchy, and an error outside it has to be recognised
 * by message matching (Unbreakable Rule 8).
 */
export class QuestionAbandonedError extends TheokitAgentError {
  override readonly name = 'QuestionAbandonedError'
  readonly code = 'question_abandoned' as const

  constructor(readonly threadId: string) {
    super(`The pending question was withdrawn before it was answered (${threadId}).`, {
      isRetryable: false,
    })
  }
}
