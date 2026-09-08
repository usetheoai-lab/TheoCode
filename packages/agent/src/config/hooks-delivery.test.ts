/**
 * #151 — who runs the hooks in each `settings.json`, and what this product may do about it.
 *
 * Measured with a real credential, a real tool call, and arms that differ in ONE variable:
 *
 * | file                            | approved | fires |
 * |---------------------------------|----------|-------|
 * | `<proj>/.theokit/settings.json` | no       | **1** |
 * | `<proj>/.theokit/settings.json` | yes      | **2** |
 * | `<proj>/.claude/settings.json`  | no       | 1     |
 *
 * `.theokit/` is the SDK's own filebase: `hookConfigCandidates` reads `hooks.json`,
 * `settings.json` and `settings.local.json` from every config root, and `theokitConfigRoot(cwd)`
 * is unconditionally one of them. So the SDK runs the `hooks` in our own configuration file — with
 * no knowledge of our approval store. Unapproved shell ran, and our
 * `hook not approved and will not run` never appeared: the gate was not overruled, it was never
 * consulted. Approved, the hook ran twice — once through each loader.
 *
 * Two further facts narrow the blast radius, both read from the SDK:
 *
 *   - `loadHookConfig(this.cwd, …)` is CWD-ONLY. A user-level `~/<home>/settings.json` is never in
 *     its candidates, so hooks there are this product's alone and stay gated.
 *   - the same means `~/.claude/settings.json` hooks are run by NOBODY — which is not what this
 *     product was telling operators.
 *
 * Upstream asked for the capability that removes the guesswork (theokit-sdk#631): a config root
 * that declares which surfaces the SDK may import from it. Until that exists, a `hooks` key in a
 * file the SDK reads cannot be gated by us and cannot be run by us without doubling — so it is
 * refused, which is the only outcome that is neither ungated nor double.
 */
import { describe, expect, it } from 'vitest'

import { CONFIG_SCHEMA_KEYS } from './config-contract.js'
import { translateSettings } from './settings-json.js'

const FLAT_HOOK = { Stop: [{ hooks: [{ type: 'command', command: 'x.sh' }] }] }
const opts = (delivery: string) =>
  ({
    ownKeys: CONFIG_SCHEMA_KEYS,
    foreignRoot: delivery === 'sdk' || delivery === 'inert',
    hooksDelivery: delivery,
  }) as never

describe('a file the SDK also reads', () => {
  it('test_hooks_are_refused_by_name', () => {
    expect(() => translateSettings({ hooks: FLAT_HOOK }, opts('refuse'))).toThrow(/hooks/)
  })

  it('test_the_refusal_says_why_and_where_they_do_work', () => {
    // A refusal that only forbids leaves the operator with a feature and nowhere to put it.
    let said = ''
    try {
      translateSettings({ hooks: FLAT_HOOK }, opts('refuse'))
    } catch (err) {
      said = (err as Error).message
    }
    expect(said).toContain('.theocode/settings.json')
    expect(said).toContain('twice')
  })

  it('test_everything_else_in_the_file_still_loads', () => {
    // Anti-vacuity, and the scope of the refusal: it is about one key, not about the file.
    expect(translateSettings({ model: 'openai/x' }, opts('refuse')).values).toEqual({
      model: 'openai/x',
    })
  })
})

describe('a file only this product reads', () => {
  it('test_hooks_are_translated_and_kept', () => {
    // The positive control for the refusal above: without it, a loader that refused everywhere
    // would satisfy every assertion in the block before this one.
    const read = translateSettings({ hooks: FLAT_HOOK }, opts('ours'))
    expect(read.values['hooks']).toEqual([{ event: 'Stop', command: 'x.sh' }])
  })
})

describe('a project file the SDK owns', () => {
  it('test_hooks_are_left_to_the_loader_that_already_runs_them', () => {
    const read = translateSettings({ hooks: FLAT_HOOK }, opts('sdk'))
    expect(read.values['hooks']).toBeUndefined()
    expect(read.droppedHooks.join(' ')).toContain('compatibility loader')
  })
})

describe('a user-level foreign file', () => {
  it('test_it_says_nobody_runs_them_rather_than_naming_a_loader_that_does_not', () => {
    // The second false statement this measurement found. `loadHookConfig` is cwd-only, so a
    // `~/.claude/settings.json` hook is run by no one — and this product was telling operators the
    // compatibility loader had it.
    const read = translateSettings({ hooks: FLAT_HOOK }, opts('inert'))
    expect(read.values['hooks']).toBeUndefined()
    expect(read.droppedHooks.join(' ')).toContain('nothing runs')
    expect(read.droppedHooks.join(' ')).not.toContain('compatibility loader')
  })
})
