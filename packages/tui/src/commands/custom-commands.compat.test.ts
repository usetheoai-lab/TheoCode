/**
 * B-152 — a command in `.claude/commands/` appears, and the trust gate still holds.
 *
 * The defect had the exact shape #83 had one directory over: the framework reads the foreign
 * dialect when asked (`COMPAT_COMMANDS_DIR = .claude/commands`, gated on `compatSources`), and this
 * product never asked. So `/tk-probe` from `.theokit/commands/` reached the popup and the identical
 * file in `.claude/commands/` did not — one dialect, two answers.
 *
 * The positive control is what makes the miss interpretable: without a `.theokit/` command in the
 * same fixture, an empty result cannot distinguish "the compat dir is not read" from "this loader
 * found nothing at all".
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { loadCustomCommands } from './custom-commands.js'

let PROJ: string
let HOME: string

const command = (root: string, dialect: string, name: string): void => {
  const dir = join(root, dialect, 'commands')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${name}.md`), `---\ndescription: fixture for B-152\n---\n\nDo the thing.\n`)
}

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), 'cmd-compat-'))
  PROJ = join(base, 'proj')
  HOME = join(base, 'home')
  mkdirSync(HOME, { recursive: true })
  command(PROJ, '.theokit', 'tk-probe')
  command(PROJ, '.claude', 'cc-probe')
})

const load = (projectTrusted: boolean): Map<string, unknown> =>
  loadCustomCommands({ projectDir: PROJ, homeDir: HOME, projectTrusted, warn: () => {} })

describe('B-152 — the foreign command dialect', () => {
  it('test_positive_control_a_native_command_is_loaded', () => {
    expect([...load(true).keys()]).toContain('tk-probe')
  })

  it('test_a_command_in_dot_claude_commands_is_loaded', () => {
    expect([...load(true).keys()]).toContain('cc-probe')
  })

  it('test_negative_control_an_untrusted_project_loads_neither', () => {
    // `.claude/commands/` is repository-controlled and its body becomes a prompt, so it has to take
    // the evidence `.theokit/commands/` takes. The gate lives inside the framework loader; this arm
    // is what would notice if passing the dialect ever routed around it.
    const keys = [...load(false).keys()]
    expect(keys).not.toContain('cc-probe')
    expect(keys).not.toContain('tk-probe')
  })
})
