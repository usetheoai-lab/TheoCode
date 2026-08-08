export {
  abandonQuestion,
  answerQuestion,
  ask,
  currentQuestion,
  subscribe,
} from './ask-bridge.js'
// B-004 — surfaces import from `@theocode/agent/ask`, never from the module directly. While this
// class was absent here, no consumer could write `instanceof` against it: a typed error nobody can
// catch by type is an untyped error with extra steps.
export { ConcurrentQuestionError } from './concurrent-question-error.js'
export { QuestionAbandonedError } from './question-abandoned-error.js'
export { createInteractiveShellTool } from './interactive-shell-tool.js'

