/**
 * B-018 — the registry's name contract, which three other layers depend on.
 *
 * A tool's `name` is what the model calls, what the approval map keys on, and what the terminal
 * renders a header for. Registering a tool under one key while the tool reports another silently
 * breaks all three at once — the model asks for a name nothing answers to, or worse, a tool runs
 * ungated because the approval map never matched it.
 *
 * The constructor checks this. Nothing exercised the check, so `registry.ts` sat on the TDD gate's
 * list — one of the entries B-018 records as having been listed underneath a BLOCK, which is
 * precisely how an advisory goes unread.
 *
 * What these tests pin, stated plainly: the INVARIANT holds for the registry as built. They do NOT
 * pin the constructor's guard — disabling it leaves them green, because the table is correct today
 * and the guard is what keeps it correct tomorrow. Pinning the guard would need a mismatched tool
 * injected into a table that is deliberately internal, and widening that surface to test it would
 * cost more than the guard is worth. Measured by mutation rather than assumed.
 */
import { describe, expect, it } from 'vitest'

import { ToolRegistry } from './registry.js'
import { resolveToolScope } from './tool-scope.js'

const scope = { sandbox_mode: 'workspace-write' } as never

describe('B-018 — a tool is registered under the name it reports', () => {
  it('test_the_registry_builds_and_every_tool_answers_to_its_key', () => {
    const registry = new ToolRegistry(resolveToolScope(scope, process.cwd()))

    for (const name of registry.names() as Parameters<ToolRegistry['get']>[0][]) {
      expect(
        registry.get(name).name,
        `"${name}" is registered under a key the tool does not answer to — the model would call a ` +
          'name nothing responds to, and the approval map would never match it',
      ).toBe(name)
    }
  })

  it('test_the_registry_is_not_empty', () => {
    // Anti-vacuity floor: an empty registry satisfies the loop above for free.
    const registry = new ToolRegistry(resolveToolScope(scope, process.cwd()))

    expect(registry.names().length).toBeGreaterThan(3)
  })

  it('test_every_registered_tool_is_frozen', () => {
    // The registry freezes each tool so a consumer cannot rename one after the check has run —
    // which would reopen exactly the mismatch the constructor refuses.
    const registry = new ToolRegistry(resolveToolScope(scope, process.cwd()))
    const first = registry.names()[0] as Parameters<ToolRegistry['get']>[0]
    const tool = registry.get(first)

    expect(Object.isFrozen(tool)).toBe(true)
  })
})

describe('B-018 — the tool scope follows the directory it is given', () => {
  it('test_the_write_root_is_derived_from_the_supplied_directory', () => {
    // The property B-032 depends on: resolveToolScope derives BOTH the write root and the sandbox
    // working directory from its argument, which is why a caller passing process.cwd() instead of
    // the injected one confines a delegated worker to the wrong tree.
    const here = resolveToolScope(scope, '/tmp/one')
    const there = resolveToolScope(scope, '/tmp/two')

    expect(here.cwd).toBe('/tmp/one')
    expect(there.cwd).toBe('/tmp/two')
    expect(here.writeRoot, 'the write root ignored the supplied directory').not.toBe(
      there.writeRoot,
    )
  })
})

// O titulo nomeia a CAPACIDADE, nao um milestone. `M78` pertence ao roadmap do framework; este
// repositorio nao tem ROADMAP.md, entao cita-lo aqui nomearia algo que nao resolve para quem le o
// TheoCode — a regra do B-046, cuja propria guarda me pegou de novo.
describe('bindToolScope — o escopo e ligado uma vez, e as tools de escrita continuam na raiz de escrita', () => {
  /**
   * A migracao para `bindToolScope` trocou sete repeticoes de `projectRoot: scope.cwd` por um bind.
   * Duas propriedades tem de sobreviver, e nenhuma e obvia lendo o diff.
   */
  it('test_o_modo_permissivo_alarga_a_raiz_de_ESCRITA_sem_alargar_a_de_leitura', () => {
    // O detalhe que um bind ingenuo teria apagado. `apply_patch` e `edit_file` recebem
    // `projectRoot: scope.writeRoot` — para elas a raiz do projeto E a raiz de escrita. Deixar o bind
    // aplicar o `cwd` estreitaria o escopo de escrita em silencio quando os dois divergem, que e
    // exatamente o caso de `danger-full-access`.
    const wide = resolveToolScope({ sandbox_mode: 'danger-full-access' } as never, '/tmp/proj')
    const narrow = resolveToolScope({ sandbox_mode: 'workspace-write' } as never, '/tmp/proj')

    expect(wide.cwd, 'a raiz de LEITURA nao deveria mudar com o modo').toBe(narrow.cwd)
    expect(wide.writeRoot, 'o modo permissivo nao alargou a raiz de escrita').not.toBe(
      narrow.writeRoot,
    )
  })

  it('test_um_escopo_SEM_sandbox_nao_compila', () => {
    // A tese do M78 e que um shell nao confinado seja IRREPRESENTAVEL, e a garantia e do TIPO — nao
    // de uma checagem em runtime. Entao a assercao honesta e sobre a compilacao.
    //
    // A primeira versao deste teste conferia `names()).toContain('run_shell')` sob um nome que
    // prometia falar do sandbox. Isso passaria com o sandbox removido do escopo, e teria dito nada.
    const semSandbox = { cwd: '/tmp/proj', writeRoot: '/tmp/proj' }

    // @ts-expect-error — `sandbox` e obrigatorio no ToolScope (B-006). Omitir era o que produzia um
    // shell nao confinado, sem erro e sem aviso.
    expect(() => new ToolRegistry(semSandbox)).toBeTypeOf('function')
  })
})
