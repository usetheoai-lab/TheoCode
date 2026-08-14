export {
  abandonQuestion,
  answerQuestion,
  ask,
  currentQuestion,
  setListener,
} from './ask-bridge.js'
// B-004 — surfaces import from `@theocode/agent/ask`, never from a module directly. While these
// classes were absent from the entrypoint, no consumer could write `instanceof` against them: a
// typed error nobody can catch by type is an untyped error with extra steps.
//
// They are re-exported from `@theokit/agents/ask` now rather than declared here. The framework is
// what raises them, so a local class of the same name would be a second type under one name — the
// same defect from the other side.
export {
  ConcurrentListenerError,
  ConcurrentQuestionError,
  QuestionAbandonedError,
} from './ask-bridge.js'
export { createInteractiveShellTool } from './interactive-shell-tool.js'
