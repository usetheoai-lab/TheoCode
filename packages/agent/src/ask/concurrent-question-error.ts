
import { TheokitAgentError } from '@theokit/agents'

export class ConcurrentQuestionError extends TheokitAgentError {
  override readonly name = 'ConcurrentQuestionError'
  readonly code = 'question_already_pending' as const

  constructor(readonly threadId: string) {
    super(
      `Uma question já aguarda resposta nesta sessão (${threadId}). ` +
        'Refaça esta question depois que a anterior for respondida.',
      { isRetryable: false },
    )
  }
}
