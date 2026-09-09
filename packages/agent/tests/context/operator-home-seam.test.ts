/**
 * B-167 — the operator's root is reachable as a parameter, not only as a process-wide env var.
 *
 * `buildChatAgent` takes `cwd` and had no `home`, so `homedir()` was called at three independent
 * sites in one build (`chat.ts`, twice, and `composition-record.ts`). Every test that wanted a
 * controlled operator root had to reach for `process.env.HOME`, which is process-wide: it leaks
 * across whatever else shares the worker, and it cannot express "this build reads that root" while a
 * sibling build reads another.
 *
 * Measured before the seam existed: the same commit, in the same checkout, reported 2646/4488 with
 * an empty home and 2648/4488 with a home holding a 163,836-char `~/.theokit/rules` — so total
 * coverage was a property of the machine, on the axis B-161 did not close.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const realHome = process.env.HOME

afterEach(() => {
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
})

function operatorRootWithAgentsMd(marker: string): string {
  const home = mkdtempSync(join(tmpdir(), 'b167-agentsmd-'))
  // `.theokit/`, not the home root: #72 put the operator's instructions in the same directory as the
  // rest of their state. Writing it at the root made this test fail for a reason that had nothing to
  // do with the seam — worth the comment, because the wrong-fixture failure reads exactly like a
  // broken fix.
  mkdirSync(join(home, '.theokit'), { recursive: true })
  writeFileSync(join(home, '.theokit', 'AGENTS.md'), `# Operator\n\n${marker}\n`)
  return home
}

function operatorRoot(skill: string): string {
  const home = mkdtempSync(join(tmpdir(), 'b167-home-'))
  const dir = join(home, '.theokit', 'skills', skill)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${skill}\ndescription: operator skill\n---\n\nBody.\n`)
  return home
}

describe('the operator root is a parameter of the build', () => {
  it('test_an_injected_home_is_read_instead_of_the_process_environment', async () => {
    // The assertion that makes the seam real: HOME points at a root with NOTHING in it, the
    // parameter points at one with a skill, and the record must follow the parameter.
    const injected = operatorRoot('from-the-parameter')
    process.env.HOME = mkdtempSync(join(tmpdir(), 'b167-env-empty-'))

    const { buildChatAgent } = await import('../../src/chat.js')
    let wired: { skills: { active: readonly string[] } } | undefined
    await buildChatAgent({
      cwd: mkdtempSync(join(tmpdir(), 'b167-project-')),
      home: injected,
      onWired: (w: { skills: { active: readonly string[] } }) => {
        wired = w
      },
    } as never)

    expect(wired?.skills.active, 'the build read the environment instead of its argument').toContain(
      'from-the-parameter',
    )
  })

  it('test_the_operators_agents_md_follows_the_parameter_too', async () => {
    // The fourth site, and the one the first pass missed. `projectDocument` read `homedir()` itself,
    // so rules followed the parameter while the operator's AGENTS.md followed the machine — measured
    // by a reviewer with a marker in each root, not inferred.
    //
    // The site survived because the list of three came from B-161's review and was treated as a
    // census. This test is what makes a fifth site fail loudly instead of being counted again.
    const injected = operatorRootWithAgentsMd('MARKER-FROM-THE-PARAMETER')
    process.env.HOME = operatorRootWithAgentsMd('MARKER-FROM-THE-ENVIRONMENT')

    const { buildChatAgent } = await import('../../src/chat.js')
    const agent = await buildChatAgent({
      cwd: mkdtempSync(join(tmpdir(), 'b167-project-')),
      home: injected,
    } as never)
    // Serialised rather than reaching for a field: the composed persona lands in `system`, whose
    // SHAPE is the SDK's business and has changed before. What this test is about is which root the
    // text came from, and that survives any shape.
    const text = JSON.stringify(agent)

    expect(text, 'the operator AGENTS.md came from the machine, not the argument').toContain(
      'MARKER-FROM-THE-PARAMETER',
    )
    expect(text, 'the ambient root still reached the prompt').not.toContain('MARKER-FROM-THE-ENVIRONMENT')
  })

  it('test_without_the_parameter_the_environment_still_decides', async () => {
    // Anti-vacuity, and a compatibility guarantee: every existing caller passes no `home`, so the
    // default must remain the operator's actual root. A seam that changed the default would move
    // behaviour for every surface while claiming to be a test affordance.
    process.env.HOME = operatorRoot('from-the-environment')

    const { buildChatAgent } = await import('../../src/chat.js')
    let wired: { skills: { active: readonly string[] } } | undefined
    await buildChatAgent({
      cwd: mkdtempSync(join(tmpdir(), 'b167-project-')),
      onWired: (w: { skills: { active: readonly string[] } }) => {
        wired = w
      },
    } as never)

    expect(wired?.skills.active, 'the default stopped being the operator root').toContain(
      'from-the-environment',
    )
  })
})
