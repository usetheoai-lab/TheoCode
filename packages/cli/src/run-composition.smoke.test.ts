/**
 * #96 — the composition produces something the agent-module loader ACCEPTS.
 *
 * Every other test here asserts what `composeRun` computes: the policy, the model, the posture.
 * None asserted that `mod` is loadable, and that is the gap this file closes.
 *
 * The cost of the gap, measured: `buildChatAgent` became async in 0.7.0 (#65), `mod.default` held
 * a Promise, and BOTH surfaces stopped being able to start a turn. `theocode exec` answered
 *
 *   ERROR: [@theokit/agents] agent module: an agents/ file must default-export a defineAgent(...)
 *
 * on every invocation. It shipped in v0.7.0 and v0.7.1 behind typecheck, 1211 tests, lint,
 * depcruise, crossval and twelve green CI checks. Nothing executed a turn, so nothing knew.
 *
 * ## Why the type system cannot do this
 *
 * The obvious fix — name the consumer's contract instead of the producer's return type — is not
 * available: `streamAgentTurnInProcess(mod: unknown, …)` declares no contract, and the real one is
 * enforced at runtime by `compileAgentModule`. So the annotation on `RunComposition.mod` tracks
 * `buildChatAgent` no matter how it is written, and an executed check is the only gate left.
 *
 * ## Why this calls the framework's own loader
 *
 * Asserting `typeof mod.default === 'object'` would have passed for the Promise too. The assertion
 * has to be the same function the runtime calls, or it is a different question with a similar shape
 * — the failure this repository keeps paying for.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compileAgentModule } from '@theokit/agents'
import { describe, expect, it } from 'vitest'

import { composeRun } from './run-composition.js'

describe('#96 — the composed module loads', () => {
  it('test_the_agent_module_compiles_the_way_the_runtime_compiles_it', async () => {
    // The injected trust store, same seam the sibling test uses: reading the real `~/.theokit`
    // one would make this depend on whichever machine runs it.
    const cwd = mkdtempSync(join(tmpdir(), 'compose-smoke-'))
    const store = join(cwd, 'trusted-dirs.json')
    writeFileSync(store, JSON.stringify({ trusted: [cwd] }), { mode: 0o600 })

    const composed = await composeRun({ overrides: [] }, { cwd, store })

    // The framework's own entry point, not a shape check. This throws AgentDefinitionError on a
    // Promise, on a thunk, and on anything else the loader will not take.
    expect(() => compileAgentModule(composed.mod, 'smoke')).not.toThrow()
  })

  it('test_a_promise_in_default_is_refused_so_this_arm_is_not_vacuous', () => {
    // Anti-vacuity, and it reproduces the exact 0.7.0 defect. Without this, an arm asserting
    // `not.toThrow()` would pass against a loader that accepted everything.
    expect(() => compileAgentModule({ default: Promise.resolve({}) }, 'smoke')).toThrow(
      /must default-export a defineAgent/,
    )
  })
})
