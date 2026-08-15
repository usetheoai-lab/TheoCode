import { describe, expect, it } from 'vitest'

import { routeCommand } from './registry.js'

describe('routeCommand — a mistyped command is not prose', () => {
  it('test_an_unknown_slash_command_is_an_error_not_a_message', () => {
    // The defect this migration closes, and the framework's own docblock states it: "sending
    // `/moddel gpt-5` to the model as text hides a typo behind a plausible answer".
    //
    // The local router ended `EXACT_COMMANDS.get(trimmed) ?? { kind: 'send', text: trimmed }`, so
    // every unrecognised slash went to the model as prose. The model, being helpful, answers — and
    // the user reads a plausible reply to a command that never ran.
    //
    // Plain text stays a MESSAGE: a terminal that answered "unknown command" to ordinary prose
    // would be unusable. A leading `/` is an explicit claim to be a command.
    const routed = routeCommand('/moddel gpt-5')

    expect(routed.kind).not.toBe('send')
    expect(routed).toMatchObject({ kind: 'commandError', reason: 'unknown-command' })
  })

  it('test_prose_is_still_a_message', () => {
    expect(routeCommand('what does /moddel do?')).toEqual({
      kind: 'send',
      text: 'what does /moddel do?',
    })
  })

  it('test_a_known_command_still_routes_to_its_verb', () => {
    // Anti-regression: the failure classes are additive, not a rewrite of what already worked.
    expect(routeCommand('/model gpt-5')).toEqual({ kind: 'model', arg: 'gpt-5' })
    expect(routeCommand('/clear')).toEqual({ kind: 'clear' })
  })
})
