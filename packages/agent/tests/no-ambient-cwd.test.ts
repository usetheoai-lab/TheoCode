/**
 * B-168 — the guard B-161's plan declared and nobody wrote.
 *
 * B-161 spent four channels and three false claims of closure establishing one invariant: no test
 * hands `buildChatAgent` the repository as its project directory. When a test does, the context it
 * assembles depends on what that tree holds — the rule corpus, a project document, the session store
 * keyed by the path — and the suite's coverage total quietly becomes a property of the machine.
 *
 * The invariant holds on HEAD by nobody having broken it since. This is what keeps it: a future edit
 * that reintroduces the ambient read turns THIS test red instead of turning a coverage number into a
 * mystery three weeks later.
 *
 * It guards against ACCIDENT, not evasion. `cwd: process . cwd()` would pass, and that is fine — the
 * failure this exists to catch is someone reaching for the obvious idiom, which is exactly how all
 * three original sites were written.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const PACKAGES = fileURLToPath(new URL('../../', import.meta.url))

function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) testFiles(full, out)
    else if (/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('no test hands the build the real working directory', () => {
  it('test_no_test_file_passes_the_ambient_cwd_as_a_project_directory', () => {
    const offenders: string[] = []
    for (const pkg of readdirSync(PACKAGES)) {
      const tests = join(PACKAGES, pkg, 'tests')
      let stat
      try {
        stat = statSync(tests)
      } catch {
        continue
      }
      if (!stat.isDirectory()) continue
      for (const file of testFiles(tests)) {
        if (/\bcwd:\s*process\.cwd\(\)/.test(readFileSync(file, 'utf8'))) {
          offenders.push(file.slice(PACKAGES.length))
        }
      }
    }

    expect(
      offenders,
      `these tests hand the build the repository, so what they cover depends on what this checkout ` +
        `holds (B-161). Pass a directory of their own — mkdtempSync(join(tmpdir(), '...')) — and, if ` +
        `the test is about operator state, a 'home' of its own too:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
