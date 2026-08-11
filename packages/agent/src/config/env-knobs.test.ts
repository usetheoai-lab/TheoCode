/**
 * B-041 — the config drift-detectors are RUN, and every knob's reader path resolves.
 *
 * `keysWithoutEnvPath` and `optOutsThatExemptNothing` encode two invariants: every config key is
 * either reachable from the environment or explicitly exempt, and every exemption exempts something
 * real. Both were exported, re-exported from the barrel, and called by nobody — so the invariants
 * were documented and unenforced, which is the same as absent with more words.
 *
 * A detector nobody runs is not a detector. Running them here makes them a gate.
 *
 * Separately, `ENV_KNOBS` names the source that READS each variable, and three of those paths did
 * not resolve — a fabricated citation inside the config layer's own documentation of itself, in the
 * file whose stated purpose is to keep that documentation derivable.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ENV_OPT_OUTS,
  keysWithoutEnvPath,
  optOutsThatExemptNothing,
} from './config.js'
import { ENV_KNOBS } from './env-knobs.js'

const ROOT = join(import.meta.dirname, '../../../..')

/** The config keys the schema accepts. */
const SCHEMA_KEYS = [
  'model',
  'reasoning_effort',
  'sandbox_mode',
  'approval_policy',
  'goal_oracle',
  'context_window',
  'skills',
  'hooks',
  'profile',
  'profiles',
]

/** The keys ENV_KNOBS says are reachable from the environment. */
const WITH_ENV_PATH = new Set(
  ENV_KNOBS.map((k) => k.name.replace(/^THEOCODE_/, '').toLowerCase()),
)

describe('B-041 — the config invariants are enforced, not merely written', () => {
  it('test_every_config_key_is_reachable_from_the_environment_or_exempt', () => {
    expect(
      keysWithoutEnvPath(SCHEMA_KEYS, WITH_ENV_PATH, ENV_OPT_OUTS),
      'a config key can be set in a file and not in the environment, with no recorded reason',
    ).toEqual([])
  })

  it('test_every_opt_out_exempts_something_real', () => {
    expect(
      optOutsThatExemptNothing(SCHEMA_KEYS, WITH_ENV_PATH, ENV_OPT_OUTS),
      'an exemption names a key the schema does not have, or one that IS reachable — so it exempts nothing',
    ).toEqual([])
  })

  it('test_the_detectors_can_actually_fail', () => {
    // Anti-vacuity floor: both assertions above pass trivially if the detectors always return [].
    expect(keysWithoutEnvPath(['invented_key'], WITH_ENV_PATH, ENV_OPT_OUTS)).toEqual([
      'invented_key',
    ])
    expect(
      optOutsThatExemptNothing(SCHEMA_KEYS, WITH_ENV_PATH, [
        { key: 'not_in_schema', reason: 'x', exitCriterion: 'y' },
      ]),
    ).toEqual(['not_in_schema'])
  })

  it('test_every_knob_names_a_reader_that_exists', () => {
    const missing = ENV_KNOBS.map((k) => k.reader.split(':')[0] ?? '')
      .filter((f) => f.includes('/'))
      .filter((f) => !existsSync(join(ROOT, f)))

    expect(missing, 'a knob cites a reader file that does not exist').toEqual([])
  })
})
