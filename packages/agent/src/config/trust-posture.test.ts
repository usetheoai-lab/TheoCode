/**
 * B-033 — the injected-environment seam reaches the exported entry point.
 *
 * B-006 added an `env` parameter so a caller that resolves configuration from an explicit
 * environment gets a trust decision from THAT environment. It was added to the PRIVATE
 * `trustOrigin`; the only exported entry, `resolveTrustPosture`, called it with two arguments and
 * never forwarded one. So all nine production call sites read the ambient environment, and the seam
 * the item was closed on could not be reached from outside the module.
 *
 * The disagreement was reachable: `cli/run-composition.ts` took the posture from the ambient
 * environment on one line and passed `seams.env` into config resolution on the next — one run, two
 * sources, for the decision that governs whether a repository's hooks and AGENTS.md are honoured.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveTrustPosture } from './trust-posture.js'

let dir: string
let store: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'theocode-posture-'))
  store = join(dir, 'trusted-dirs.json')
  writeFileSync(store, JSON.stringify({ trusted: [] }), { mode: 0o600 })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('B-033 — the trust posture comes from the environment it was given', () => {
  it('test_an_untrusted_directory_is_untrusted_with_an_empty_environment', () => {
    // Anti-vacuity floor: answering "trusted" always would satisfy the assertion below.
    expect(resolveTrustPosture(dir, store, {}).level).toBe('untrusted')
  })

  it('test_the_injected_environment_decides_the_posture', () => {
    const posture = resolveTrustPosture(dir, store, { THEOCODE_TRUST_ALL_DIRS: '1' })

    expect(
      posture.source,
      'the injected environment did not reach the exported entry, so the posture came from the ' +
        'ambient one — the B-006 bullet this item reopened',
    ).toBe('env')
    expect(posture.level).toBe('trusted')
  })

  it('test_two_different_injected_environments_give_two_different_answers', () => {
    // The property that makes the seam worth having: the injected environment is the WHOLE answer,
    // for the same directory and the same store.
    //
    // A first version proved this by SETTING `process.env.THEOCODE_TRUST_ALL_DIRS` and asserting it
    // was ignored. That made the suite flaky: vitest runs files concurrently in one process, and
    // `chat-cwd.test.ts` reads the ambient environment through this same function. It passed alone
    // and failed in the full run. A test that can only be right when it runs alone is a bug
    // (`rules/testing.md` — no shared mutable state), so it was rewritten rather than retried.
    const off = resolveTrustPosture(dir, store, {})
    const on = resolveTrustPosture(dir, store, { THEOCODE_TRUST_ALL_DIRS: '1' })

    expect(off.level).toBe('untrusted')
    expect(on.level).toBe('trusted')
  })
})
