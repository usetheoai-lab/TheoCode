/**
 * B-024 — the composition seam had no caller and no test, so nothing proved it worked.
 *
 * `composeRun(args, seams)` accepts a `CompositionSeams` object precisely so composition can be
 * exercised without touching the real trust store or the real working directory. Its single
 * production caller passes no seams, so the injection point was scaffolding for a use that never
 * arrived — and an untested seam is not a seam, it is a parameter that happens to typecheck.
 *
 * These tests use it, which is the resolution the item's DoD asked for: exercised by a test that
 * would fail without it, or deleted. It also lays the ground for B-033: the `env` seam is how an
 * injected environment is meant to reach config resolution, and the finding there is that it does
 * not arrive.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { composeRun } from './run-composition.js'

let dir: string
let store: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'theocode-compose-'))
  store = join(dir, 'trusted-dirs.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('B-024 — the composition seam is real', () => {
  it('test_the_cwd_seam_decides_which_directory_is_composed_against', () => {
    // The directory is trusted in the injected store, so composition must see a trusted posture.
    // Reading the real ~/.theokit store instead would make this assertion depend on the machine.
    writeFileSync(store, JSON.stringify({ trusted: [dir] }), { mode: 0o600 })

    const composed = composeRun({ overrides: [] }, { cwd: dir, store })

    expect(composed.mod.default, 'composition produced no agent module').not.toBe(undefined)
    expect(
      composed.policy.reason.length,
      'the approval decision carried no reason',
    ).toBeGreaterThan(0)
  })

  it('test_the_store_seam_decides_whether_the_project_config_is_read', () => {
    // Anti-vacuity floor with teeth. A project `.theokit/config.toml` is read ONLY for a trusted
    // directory — that is the anti-prompt-injection gate. So the same directory composed against a
    // trusting store and an empty one must produce DIFFERENT config. If the seam were ignored and
    // the real ~/.theokit store consulted, both cases would answer identically and this could not
    // fail.
    mkdirSync(join(dir, '.theocode'), { recursive: true })
    writeFileSync(join(dir, '.theocode', 'config.toml'), 'reasoning_effort = "high"\n')

    writeFileSync(store, JSON.stringify({ trusted: [] }), { mode: 0o600 })
    const untrusted = composeRun({ overrides: [] }, { cwd: dir, store })

    writeFileSync(store, JSON.stringify({ trusted: [dir] }), { mode: 0o600 })
    const trusted = composeRun({ overrides: [] }, { cwd: dir, store })

    expect(
      trusted.cfg.reasoning_effort,
      "the trusted directory's project config was not read",
    ).toBe('high')
    expect(
      untrusted.cfg.reasoning_effort,
      'an UNTRUSTED project config was read — the injected store was ignored',
    ).not.toBe('high')
  })

  it('test_a_cli_override_reaches_the_effective_config', () => {
    writeFileSync(store, JSON.stringify({ trusted: [dir] }), { mode: 0o600 })

    const composed = composeRun({ overrides: ['reasoning_effort=high'] }, { cwd: dir, store })

    expect(composed.cfg.reasoning_effort, 'a -c override did not reach the effective config').toBe(
      'high',
    )
  })
})
