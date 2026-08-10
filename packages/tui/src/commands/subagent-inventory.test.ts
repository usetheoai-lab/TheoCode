/**
 * B-072 — the subagent set is discoverable without guessing a name.
 *
 * The listing MUST resolve the way `config-commands.ts` resolves, or it becomes a second source of
 * truth that drifts from the router — a listing promising a subagent the router cannot find is
 * worse than no listing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listSubagents, subagentDir } from './subagent-inventory.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'theocode-subagents-'))
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

function writeAgent(name: string): void {
  mkdirSync(subagentDir(cwd), { recursive: true })
  writeFileSync(join(subagentDir(cwd), `${name}.md`), '# agent\n')
}

describe('B-072 — listSubagents', () => {
  it('test_lists_the_agents_on_disk_sorted', () => {
    writeAgent('reviewer')
    writeAgent('analyst')
    expect(listSubagents(cwd)).toEqual(['analyst', 'reviewer'])
  })

  it('test_resolves_where_the_router_resolves', () => {
    // The router checks `.theokit/agents/<name>.md` under the working directory. Pinning the path
    // here is what keeps the two from drifting.
    expect(subagentDir(cwd)).toBe(join(cwd, '.theokit', 'agents'))
  })

  it('test_ignores_files_that_are_not_agents', () => {
    writeAgent('reviewer')
    writeFileSync(join(subagentDir(cwd), 'README.txt'), 'x')
    writeFileSync(join(subagentDir(cwd), '.md'), 'x')
    expect(listSubagents(cwd)).toEqual(['reviewer'])
  })

  it('test_a_project_with_no_subagents_is_empty_not_an_error', () => {
    // The normal case. Throwing here would turn "this project defines none" into a failure at
    // someone who only opened a listing.
    expect(listSubagents(cwd)).toEqual([])
  })
})
