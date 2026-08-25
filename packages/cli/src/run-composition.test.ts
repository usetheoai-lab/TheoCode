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

/**
 * The headless surface has to build on the SAME model id it resolves a credential for.
 *
 * Measured 2026-08-25: it did not. A ChatGPT sign-in stores an OAuth token that `api.openai.com`
 * refuses outright (`401 Missing scopes: api.responses.write`), and the configured id is
 * `openai/…`, which selects exactly that API-key provider. The TUI re-points it at
 * `openai-chatgpt/…` before anything resolves; headless skipped that step, so one credential worked
 * on one surface and failed on the other — on a product whose README calls itself "one agent core,
 * two surfaces".
 */
describe('composeRun routes the model for the credential that will serve it', () => {
  beforeEach(() => {
    writeFileSync(store, JSON.stringify({ trusted: [dir] }), { mode: 0o600 })
  })

  it('test_the_routed_id_is_what_the_agent_is_built_on_and_what_the_caller_is_told', () => {
    // The two have to be the same value. A caller that re-derived the routed id could derive it
    // differently, which is the divergence this seam exists to close.
    const composed = composeRun(
      { overrides: [], model: 'openai/gpt-5.4', routeModel: () => 'openai-chatgpt/gpt-5.4' },
      { cwd: dir, store },
    )

    expect(composed.model).toBe('openai-chatgpt/gpt-5.4')
  })

  it('test_the_route_sees_the_CONFIGURED_id_when_no_model_flag_was_given', () => {
    // The case that actually shipped broken: no `--model`, so the id came from config and the
    // rewrite had nothing to look at. A router handed `undefined` cannot route.
    const seen: string[] = []
    composeRun(
      {
        overrides: [],
        routeModel: (id) => {
          seen.push(id)
          return id
        },
      },
      { cwd: dir, store },
    )

    expect(seen, 'the router was never called').toHaveLength(1)
    expect(seen[0], 'the router was handed nothing to route').toBeTruthy()
    expect(seen[0]).not.toBe('undefined')
  })

  it('test_without_a_router_the_configured_id_is_used_unchanged', () => {
    // Anti-vacuity: the seam is additive. A caller that supplies no router gets what it always got.
    const composed = composeRun({ overrides: [], model: 'anthropic/x' }, { cwd: dir, store })

    expect(composed.model).toBe('anthropic/x')
  })
})
