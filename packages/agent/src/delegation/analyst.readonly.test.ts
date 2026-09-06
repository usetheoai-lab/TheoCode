/**
 * #80 — the analyst's declared boundary and its effective one are the same boundary.
 *
 * The defect: the analyst is declared read-only in TWO places — a three-tool list and instructions
 * that say in words *"You cannot edit files or run commands"* — and it advertised `shell`. Measured
 * on the built binary, asked to enumerate its own catalog, `shell` came FIRST. The unit test
 * asserting its declared list passed throughout: the list was right, the catalog was not.
 *
 * That is why this file asserts the WITHHOLDING and not the tool list. A test over
 * `ANALYST_TOOLS` is the test that already existed and already passed while the bug was live —
 * re-asserting it here would reproduce the blind spot rather than close it.
 */
import { describe, expect, it } from 'vitest'

import { ToolRegistry, resolveToolScope } from '../tools/index.js'
import { analystSpec } from './analyst.js'

const registry = (): ToolRegistry =>
  new ToolRegistry(resolveToolScope({ sandbox_mode: 'read-only' }, '/p'))

describe('#80 — the analyst does not carry a builtin it was never granted', () => {
  it('test_the_spec_withholds_the_builtin_shell', () => {
    const spec = analystSpec('gpt-5.4', registry())
    expect(
      spec.withheldBuiltinTools,
      'the analyst says it cannot run commands; without this it can',
    ).toContain('shell')
  })

  it('test_no_shell_of_any_kind_is_in_its_declared_list', () => {
    // The other half of the claim, and the reason withholding is SAFE here rather than merely
    // desirable: nothing this agent was granted travels under the withheld name. The sibling
    // `roles.ts` withholds the same builtin and keeps `run_shell`, which is this product's own tool.
    // If someone ever adds an execution tool to `ANALYST_TOOLS`, this arm is what says so.
    const names = (analystSpec('gpt-5.4', registry()).tools ?? []).map((t) => t.name)
    expect(names.sort()).toEqual(['grep', 'list_dir', 'read_file'])
  })
})
