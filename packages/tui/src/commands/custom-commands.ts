
import { readFileSync } from 'node:fs'

import { varrerMarkdownComGuardas } from '@theocode/agent/context'
import { join, relative } from 'node:path'
import yaml from 'js-yaml'
import { hints } from './command-template.js'
import { BUILTIN_COMMAND_NAMES } from './registry.js'

export interface CustomCommand {
  name: string
  template: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
  hints: string[]
}

export interface LoadOptions {
  projectDir: string
  homeDir: string
  projectTrusted: boolean
  warn: (message: string) => void
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function mdFilesUnder(dir: string, warn?: (m: string) => void): string[] {
  return varrerMarkdownComGuardas(dir, undefined, warn)
}

function separarFrontmatter(
  path: string,
  warn: LoadOptions['warn'],
): { readonly data: Record<string, unknown>; readonly body: string } | undefined {
  const raw = readFileSync(path, 'utf8')
  const fm = FRONTMATTER_REGEX.exec(raw)
  if (fm === null) return { data: {}, body: raw }
  try {
    const parsed = yaml.load(fm[1] ?? '')
    const data =
      parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    return { data, body: raw.slice(fm[0].length) }
  } catch (err) {
    warn(
      `[custom-command] ${path}: failed to parse YAML frontmatter (${err instanceof Error ? err.message.split('\n')[0] : String(err)}) — file skipped`,
    )
    return undefined
  }
}

function parseCommandFile(
  path: string,
  name: string,
  warn: LoadOptions['warn'],
): CustomCommand | undefined {
  const separado = separarFrontmatter(path, warn)
  if (separado === undefined) return undefined
  const { data, body } = separado
  const template = body.trim()
  return {
    name,
    template,
    ...(typeof data.description === 'string' ? { description: data.description } : {}),
    ...(typeof data.agent === 'string' ? { agent: data.agent } : {}),
    ...(typeof data.model === 'string' ? { model: data.model } : {}),
    ...(typeof data.subtask === 'boolean' ? { subtask: data.subtask } : {}),
    hints: hints(template),
  }
}

export function loadCustomCommands(options: LoadOptions): Map<string, CustomCommand> {
  const commands = new Map<string, CustomCommand>()
  const sourceRoot = new Map<string, string>()
  const roots = options.projectTrusted ? [options.homeDir, options.projectDir] : [options.homeDir]
  if (!options.projectTrusted && hasAnyCommandFile(options.projectDir)) {
    options.warn(
      '[custom-command] project .theokit/commands present but the directory is untrusted — project commands NOT loaded',
    )
  }
  for (const root of roots) {
    for (const sub of ['command', 'commands']) {
      loadFromFolder(join(root, '.theokit', sub), root, options, commands, sourceRoot)
    }
  }
  return commands
}

function loadFromFolder(
  base: string,
  root: string,
  options: LoadOptions,
  commands: Map<string, CustomCommand>,
  sourceRoot: Map<string, string>,
): void {
  for (const file of mdFilesUnder(base, options.warn)) {
    const name = relative(base, file).replace(/\.md$/, '')
    const parsed = parseCommandFile(file, name, options.warn)
    if (parsed === undefined) continue
    if (parsed.template.length === 0) {
      options.warn(`[custom-command] ${file}: empty template — file skipped`)
      continue
    }
    if (BUILTIN_COMMAND_NAMES.has(name)) {
      options.warn(`[custom-command] "/${name}" shadows builtin — the custom command wins`)
    }
    if (commands.has(name) && sourceRoot.get(name) === root) {
      options.warn(
        `[custom-command] duplicate command name "${name}" within ${root} — later file wins`,
      )
    }
    commands.set(name, parsed)
    sourceRoot.set(name, root)
  }
}

function hasAnyCommandFile(projectDir: string): boolean {
  return ['command', 'commands'].some(
    (sub) => mdFilesUnder(join(projectDir, '.theokit', sub)).length > 0,
  )
}
