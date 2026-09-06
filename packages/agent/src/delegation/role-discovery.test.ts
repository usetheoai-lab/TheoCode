/**
 * #65 — a role in the operator's own root was reachable by nothing.
 *
 * Measured 2026-09-05 on the built binary, with the same file copied into the project as a positive
 * control: `.theokit/agents/<name>.md` under the project delegates and answers, and the identical
 * file under `~/.theokit/agents/` leaves the model reporting *"no such subagent/delegation tool is
 * available"*.
 *
 * The cause was ours, not upstream. `@theokit/sdk` has no user-configuration layer for ANY surface —
 * its only user-root accessor appears in credential, transcript and token storage, never in config —
 * so the user-level rules and `AGENTS.md` that DO load are read by this product's own
 * `context/rules.ts` and `context/user-agents-md.ts`. Two surfaces got a user layer and two fell
 * through to nothing, because there was nothing underneath to fall through to.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { discoverRoles } from './role-discovery.js'

let cwd: string
let home: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'theocode-roles-cwd-'))
  home = mkdtempSync(join(tmpdir(), 'theocode-roles-home-'))
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  rmSync(home, { recursive: true, force: true })
})

function writeRole(root: string, name: string, description = 'a role'): void {
  mkdirSync(join(root, '.theokit', 'agents'), { recursive: true })
  writeFileSync(
    join(root, '.theokit', 'agents', `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`,
  )
}

describe('#65 — roles are discovered in the operator root as well as the project', () => {
  it('test_a_role_in_the_operator_root_is_found', async () => {
    writeRole(home, 'mine')

    const found = await discoverRoles({ cwd, home, projectAllowed: true })

    expect(Object.keys(found)).toEqual(['mine'])
  })

  it('test_a_role_in_the_project_is_still_found', async () => {
    // Anti-regression: the root that already worked must keep working.
    writeRole(cwd, 'theirs')

    expect(Object.keys(await discoverRoles({ cwd, home, projectAllowed: true }))).toEqual(['theirs'])
  })

  it('test_the_project_wins_when_both_declare_the_same_name', async () => {
    // The repository is the more specific context, and it is the one a reader is looking at.
    writeRole(home, 'both', 'from the operator root')
    writeRole(cwd, 'both', 'from the project')

    const found = await discoverRoles({ cwd, home, projectAllowed: true })

    expect(found.both?.description).toBe('from the project')
  })

  it('test_the_operator_root_is_read_even_when_the_directory_is_untrusted', async () => {
    // Deliberate, and the same rule `context/user-agents-md.ts` already states for instructions: the
    // trust gate asks "do I trust the code in THIS directory?", and nobody's home is the repository.
    // Gating the operator's own roles behind a stranger's repository would refuse someone their own
    // configuration because of where they happened to run.
    writeRole(home, 'mine')

    expect(Object.keys(await discoverRoles({ cwd, home, projectAllowed: false }))).toEqual(['mine'])
  })

  it('test_the_project_root_stays_shut_when_the_directory_is_untrusted', async () => {
    // The other half of the same rule, and the one that must not regress: an untrusted repository
    // must not steer a child's model, sandbox or tools.
    writeRole(cwd, 'theirs')

    expect(await discoverRoles({ cwd, home, projectAllowed: false })).toEqual({})
  })

  it('test_neither_root_declaring_anything_is_not_an_error', async () => {
    expect(await discoverRoles({ cwd, home, projectAllowed: true })).toEqual({})
  })
})
