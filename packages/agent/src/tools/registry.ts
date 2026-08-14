import { ConfigurationError, Toolset, ToolsetError } from '@theokit/agents'
import { createViewImageTool } from './view-image.js'
import type { CustomTool } from '@theokit/agents'
import { bindToolScope } from '@theokit/agents/tool-scope'
import type { SandboxBackend } from '@theokit/agents/sandbox'
import {
  createApplyPatchTool,
  createCurrentTimeTool,
  createEditFileTool,
  createGitDiffTool,
  createGitStatusTool,
  createListDirTool,
  createReadFileTool,
  createSearchTextTool,
  createShellTool,
  withName,
} from '@theokit/agents/tools'

export interface ToolScope {
  cwd: string
  writeRoot: string
  /**
   * B-006 — required. It used to be optional, and its absence was handled by omitting the `sandbox`
   * option from `createShellTool` — so a scope built without one produced an UNCONFINED shell with
   * no error and no warning. Every construction path already goes through `resolveToolScope`, which
   * always supplies a backend, so requiring it makes the unconfined scope unrepresentable rather
   * than merely detectable.
   */
  sandbox: SandboxBackend
  defaultTimeoutMs?: number
}

export const REGISTRY_TOOL_NAMES = [
  'read_file',
  'list_dir',
  'grep',
  'repo_status',
  'git_diff',
  'current_time',
  'view_image',
  'apply_patch',
  'edit_file',
  'run_shell',
] as const

export type RegistryToolName = (typeof REGISTRY_TOOL_NAMES)[number]

/**
 * Bridges `ToolsetError` into the SDK's error hierarchy, and has an end date.
 *
 * `ToolsetError` extended `Error` directly, so a caller catching `TheokitAgentError` missed it and
 * had to match on name or message. Rather than do that here, this translates it once at the
 * boundary (upstream gap U-3, finding TIP-15).
 *
 * Fixed upstream — `ToolsetError` now extends `TheokitAgentError` (`theokit` commit `92b962ad`) —
 * but NOT released: this package resolves `@theokit/agents@7.4.0`, which predates it. Delete this on
 * the next bump, not before: removing it now changes which error type callers actually receive.
 */
function translateError<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof ToolsetError) {
      throw new ConfigurationError(err.message, { code: err.code, cause: err })
    }
    throw err
  }
}

export class ToolRegistry {
  readonly #toolset: Toolset<CustomTool>

  constructor(scope: ToolScope) {
    /**
     * M78 — o escopo e LIGADO uma vez, e as fabricas o herdam.
     *
     * Antes, `projectRoot: scope.cwd` era repetido em sete entradas e `sandbox` em uma. Cada
     * repeticao e um lugar onde se pode esquecer — e esquecer o `sandbox` no `createShellTool`
     * produz um shell NAO CONFINADO sem erro e sem aviso, que e o defeito que o B-006 documentou
     * aqui e que o M78 fechou no framework.
     *
     * As duas tools de ESCRITA passam `projectRoot: scope.writeRoot` explicitamente. Nao e detalhe:
     * para elas a raiz do projeto E a raiz de escrita, e deixar o bind aplicar o `cwd` mudaria o
     * escopo de escrita em silencio — na direcao errada quando os dois divergem.
     */
    const bound = bindToolScope({
      projectRoot: scope.cwd,
      writeRoot: scope.writeRoot,
      sandbox: scope.sandbox,
    })

    const entries = new Map<string, CustomTool>([
      [
        'read_file',
        bound.bind(createReadFileTool)({ lineNumbers: true, allowAbsolute: true }),
      ],
      ['list_dir', bound.bind(createListDirTool)({ allowAbsolute: true })],
      [
        'grep',
        withName(
          bound.bind(createSearchTextTool)({ regex: true, allowAbsolute: true }),
          'grep',
        ),
      ],
      ['repo_status', bound.bind(createGitStatusTool)({ name: 'repo_status' })],
      ['git_diff', bound.bind(createGitDiffTool)()],
      ['current_time', createCurrentTimeTool()],
      // B-082 — the model can look at a diagram or screenshot itself, under the same read root.
      ['view_image', bound.bind(createViewImageTool)()],
      // Override explicito: para uma tool de escrita a raiz do projeto E a raiz de escrita.
      ['apply_patch', bound.bind(createApplyPatchTool)({ projectRoot: scope.writeRoot })],
      [
        'edit_file',
        withName(bound.bind(createEditFileTool)({ projectRoot: scope.writeRoot }), 'edit_file'),
      ],
      [
        'run_shell',
        withName(
          // `sandbox` vem do escopo ligado — nao ha caminho aqui que o esqueca.
          bound.bind(createShellTool)(
            scope.defaultTimeoutMs !== undefined
              ? { defaultTimeoutMs: scope.defaultTimeoutMs }
              : {},
          ),
          'run_shell',
        ),
      ],
    ])
    for (const tool of entries.values()) Object.freeze(tool)
    for (const [name, tool] of entries) {
      if (tool.name !== name) {
        throw new ConfigurationError(
          `tool registered as "${name}" but named "${tool.name}" — the name is a contract with the model`,
          { code: 'tool_name_mismatch' },
        )
      }
    }
    this.#toolset = Toolset.from([...entries.values()])
  }

  names(): string[] {
    return [...this.#toolset.names()]
  }

  get(name: RegistryToolName): CustomTool {
    return translateError(() => this.#toolset.get(name))
  }

  resolve(names: readonly string[]): CustomTool[] {
    return translateError(() => [...this.#toolset.resolve(names)])
  }
}
