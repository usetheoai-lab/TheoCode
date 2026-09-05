/**
 * The configured shell timeout reaches the subprocess that actually runs the operator's command.
 *
 * `shell_timeout_ms` existing in the schema proves nothing on its own — a key that resolves and is
 * then ignored at the call site is the same defect as no key, with more documentation. This is the
 * integration test at the boundary: a real `execFile`, a real child process, a real kill.
 *
 * It is deliberately NOT a unit test with a mocked `execFile`. Mocking the thing under test here
 * would assert that we pass a number to a function, which is not the claim; the claim is that a
 * command exceeding the bound is killed and one inside it is not.
 */
import { describe, expect, it } from 'vitest'

import { expansionDeps } from './config-commands.js'

const noop = (): void => {}

describe('shell_timeout_ms bounds the operator command', () => {
  it('test_a_command_that_outruns_the_configured_timeout_is_killed', async () => {
    const started = Date.now()
    const result = await expansionDeps(noop, 120).shell('sleep 5')

    expect(result.ok, 'a command past the bound reported success').toBe(false)
    // The bound is what killed it, not the test runner giving up: 5 s would have been the wait
    // without a timeout, and anything near it means the number never reached execFile.
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('test_a_command_inside_the_configured_timeout_survives', async () => {
    // Anti-vacuity floor: returning ok:false unconditionally would satisfy the test above.
    const result = await expansionDeps(noop, 10_000).shell('echo alive')

    expect(result.ok).toBe(true)
    expect(result.text.trim()).toBe('alive')
  })

  it('test_raising_the_bound_is_what_changes_the_outcome', async () => {
    // The finding, expressed as a test: the SAME command that dies under a short bound survives
    // under a longer one. Before this key the operator could not reach either side of this line.
    const short = await expansionDeps(noop, 120).shell('sleep 0.6')
    const long = await expansionDeps(noop, 5_000).shell('sleep 0.6')

    expect(short.ok).toBe(false)
    expect(long.ok).toBe(true)
  })
})
