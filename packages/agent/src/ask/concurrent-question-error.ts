
import { TheokitAgentError } from '@theokit/agents'

export class ConcurrentQuestionError extends TheokitAgentError {
  override readonly name = 'ConcurrentQuestionError'
  readonly code = 'question_already_pending' as const

  constructor(readonly threadId: string) {
    super(
      `A question is already awaiting an answer in this session (${threadId}). ` +
        'Ask again once the previous one has been answered.',
      { isRetryable: false },
    )
  }
}
