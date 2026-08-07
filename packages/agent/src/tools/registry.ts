import { ConfigurationError, Toolset, ToolsetError } from '@theokit/agents'
import type { CustomTool } from '@theokit/agents'
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
  sandbox?: SandboxBackend
  defaultTimeoutMs?: number
}

export const REGISTRY_TOOL_NAMES = [
  'read_file',
  'list_dir',
  'grep',
  'repo_status',
  'git_diff',
  'current_time',
  'apply_patch',
  'edit_file',
  'run_shell',
] as const

export type RegistryToolName = (typeof REGISTRY_TOOL_NAMES)[number]

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
    const entries = new Map<string, CustomTool>([
      [
        'read_file',
        createReadFileTool({ projectRoot: scope.cwd, lineNumbers: true, allowAbsolute: true }),
      ],
      ['list_dir', createListDirTool({ projectRoot: scope.cwd, allowAbsolute: true })],
      [
        'grep',
        withName(
          createSearchTextTool({ projectRoot: scope.cwd, regex: true, allowAbsolute: true }),
          'grep',
        ),
      ],
      ['repo_status', createGitStatusTool({ projectRoot: scope.cwd, name: 'repo_status' })],
      ['git_diff', createGitDiffTool({ projectRoot: scope.cwd })],
      ['current_time', createCurrentTimeTool()],
      ['apply_patch', createApplyPatchTool({ projectRoot: scope.writeRoot })],
      ['edit_file', withName(createEditFileTool({ projectRoot: scope.writeRoot }), 'edit_file')],
      [
        'run_shell',
        withName(
          createShellTool({
            projectRoot: scope.cwd,
            ...(scope.sandbox ? { sandbox: scope.sandbox } : {}),
            ...(scope.defaultTimeoutMs !== undefined
              ? { defaultTimeoutMs: scope.defaultTimeoutMs }
              : {}),
          }),
          'run_shell',
        ),
      ],
    ])
    for (const tool of entries.values()) Object.freeze(tool)
    for (const [name, tool] of entries) {
      if (tool.name !== name) {
        throw new ConfigurationError(
          `tool registrada como "${name}" mas nomeada "${tool.name}" — o name é contrato com o model`,
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
