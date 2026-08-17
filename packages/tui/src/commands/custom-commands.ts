import { loadCustomCommands as loadInFramework, frontmatterValue } from '@theokit/agents/config'

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

/**
 * `.theokit/commands/*.md` — this product's commands, loaded by the framework.
 *
 * ## What moved
 *
 * The whole loader: which directories are read, that the project's are read ONLY when the directory
 * is trusted, that project beats user, that a name colliding with a builtin is reported, that a file
 * whose frontmatter never closes is skipped rather than half-parsed, and the walk under each
 * directory. None of it was about this product — all of it was written here because the framework's
 * result had nowhere to put the keys this product reads.
 *
 * ## What stays, and why
 *
 * The KEYS. `agent`, `model`, `subtask` are how this product decides who runs a command; `hints` is
 * derived from the template for its own composer. The framework carries the frontmatter LINES and
 * `frontmatterValue` reads them, so the vocabulary stays ours without the loader having to be.
 *
 * That split is deliberate on the framework's side too: Claude Code's custom commands declare `model`
 * and `argument-hint`, which is already a second vocabulary. A loader that adopted one product's
 * keys would have to refuse the other's.
 */
export function loadCustomCommands(options: LoadOptions): Map<string, CustomCommand> {
  const { commands, shadowedBuiltins } = loadInFramework({
    projectDir: options.projectDir,
    homeDir: options.homeDir,
    projectTrusted: options.projectTrusted,
    builtinNames: [...BUILTIN_COMMAND_NAMES],
    onWarn: (message) => {
      options.warn(`[custom-command] ${message}`)
    },
  })

  for (const name of shadowedBuiltins) {
    options.warn(`[custom-command] "/${name}" shadows builtin — the custom command wins`)
  }

  const loaded = new Map<string, CustomCommand>()
  for (const command of commands) {
    const template = command.body.trim()
    if (template.length === 0) {
      // An empty command is a no-op the user cannot see failing — the file exists, the name appears
      // in the composer, and invoking it sends nothing.
      options.warn(`[custom-command] ${command.path}: empty template — file skipped`)
      continue
    }
    loaded.set(command.name, {
      name: command.name,
      template,
      ...(command.description !== undefined ? { description: command.description } : {}),
      ...readOwnKeys(command.frontmatter),
      hints: hints(template),
    })
  }
  return loaded
}

/**
 * The keys the framework does not know about, read from the lines it hands over.
 *
 * `subtask` is compared against the literal `'true'` rather than coerced: a frontmatter reader
 * returns strings, and `Boolean('false')` is `true` — the one coercion in this file that would
 * silently invert a user's intent.
 */
function readOwnKeys(
  frontmatter: readonly string[],
): Pick<CustomCommand, 'agent' | 'model' | 'subtask'> {
  const agent = frontmatterValue(frontmatter, 'agent')
  const model = frontmatterValue(frontmatter, 'model')
  const subtask = frontmatterValue(frontmatter, 'subtask')
  return {
    ...(agent !== undefined ? { agent } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(subtask !== undefined ? { subtask: subtask.trim() === 'true' } : {}),
  }
}
