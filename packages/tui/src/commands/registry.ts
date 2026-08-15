import {
  defineCommand,
  routeCommand as classifyInput,
  type CommandDefinition,
} from '@theokit/agents/commands'
import type { ChatComposerCommand } from '@theokit/tui'

type DemoMode = 'plan' | 'ask' | 'select' | 'progress'

export type CommandAction =
  | { kind: 'noop' }
  | { kind: 'clear' }
  | { kind: 'new' }
  | { kind: 'effort'; arg: string }
  | { kind: 'toggleHelp' }
  | { kind: 'toggleUsage' }
  | { kind: 'retry' }
  | { kind: 'logout' }
  | { kind: 'login'; arg: string }
  | { kind: 'image'; arg: string }
  // M39 — session management. /fork + /sessions are bare; /archive + /rename carry an arg.
  | { kind: 'fork' }
  | { kind: 'listSessions' }
  | { kind: 'archive'; arg: string }
  // B-078 — permanent, and unlike /archive it never defaults to the current session.
  | { kind: 'delete'; arg: string }
  // B-075 — getting a reply out of the terminal without mouse-selecting a wrapped box.
  | { kind: 'copy' }
  | { kind: 'export'; arg: string }
  // B-072 — which subagents exist, answerable before naming one.
  | { kind: 'listSubagents' }
  // B-071 — what is allowed to block me here, before the first turn.
  | { kind: 'listHooks' }
  // B-070 — which skills the agent actually loaded, and which trust removed.
  | { kind: 'listSkills' }
  // B-069 — which MCP servers the agent started, and which trust refused to spawn.
  | { kind: 'listMcp' }
  // B-076 — the other half of the disk decision `/approval` already owned.
  | { kind: 'sandbox'; arg: string }
  // B-087 — open a session `/sessions` already lists.
  | { kind: 'resume'; arg: string }
  | { kind: 'rename'; arg: string }
  | { kind: 'mode'; mode: DemoMode }
  | { kind: 'approvalMode'; arg: string }
  // M48 — user-defined command (loaded from .theokit/commands/); arg = raw argument string.
  | { kind: 'custom'; name: string; arg: string }
  // M49 — durable-memory status (enabled/trusted, store path, fact count).
  | { kind: 'memoryInfo'; arg: string }
  // M50 — manual context compaction (Codex /compact parity).
  | { kind: 'compact' }
  // Codex parity (`/ps`, `/stop`): inventory and stop for background PTYs. We were creating
  // interactive shell sessions and giving the user no way to see or stop them — the gap the
  // side-by-side comparison named as the most consequential.
  | { kind: 'model'; arg: string }
  | { kind: 'showDiff' }
  | { kind: 'showStatus' }
  | { kind: 'initAgents' }
  | { kind: 'quit' }
  | { kind: 'listPtys' }
  | { kind: 'stopPtys' }
  // M51 — review mode (Codex /review parity): arg = target (empty=uncommitted | base <ref> | commit <sha> | custom).
  | { kind: 'review'; arg: string }
  // M55 — autonomous goal (Codex ext/goal parity): arg = objective in natural language.
  | { kind: 'goal'; arg: string }
  | { kind: 'send'; text: string }
  /**
   * A leading `/` that is not a command this build knows.
   *
   * It used to be `{ kind: 'send' }` — every mistyped slash went to the model as prose, and the
   * model answered. `/moddel gpt-5` produced a plausible reply to a command that never ran, which
   * is worse than an error because nothing looks wrong.
   */
  | { kind: 'commandError'; reason: string; input: string }

// B-011 — the SDK exports this shape as `SlashCommand` (re-exported as `ChatComposerCommand`, the
// name `ChatComposer` consumes). Declaring an identical anonymous type meant the composer's contract
// and this list could drift apart with nothing to catch it.
export const BUILTIN_COMMANDS: readonly ChatComposerCommand[] = [
  { name: 'clear', description: 'clear the conversation' },
  { name: 'new', description: 'start a fresh conversation' },
  { name: 'help', description: 'toggle the keyboard shortcuts panel' },
  { name: 'usage', description: 'toggle the token-usage panel' },
  { name: 'retry', description: 're-send the last message' },
  { name: 'fork', description: 'branch the current session into a new one' },
  { name: 'sessions', description: 'list your sessions' },
  { name: 'resume', description: 'open a session: /resume <id>' },
  { name: 'logout', description: 'remove the stored credential' },
  { name: 'plan', description: 'demo: plan approval card' },
  { name: 'ask', description: 'demo: question prompt' },
  { name: 'select', description: 'demo: multi-select list' },
  { name: 'progress', description: 'demo: multi-step progress' },
  { name: 'approval', description: 'approval mode: suggest | auto-edit | full-auto' },
  { name: 'effort', description: 'reasoning effort: minimal|low|medium|high|xhigh' },
  { name: 'login', description: 'authenticate a provider: /login <provider>' },
  { name: 'image', description: 'attach an image to the NEXT turn: /image <path>' },
  { name: 'archive', description: 'archive a session [id]' },
  { name: 'delete', description: 'permanently delete a session: /delete <id>' },
  { name: 'copy', description: 'copy the last reply to the clipboard as markdown' },
  { name: 'export', description: 'write the conversation to a file: /export [path]' },
  { name: 'subagents', description: 'list the subagents this project defines' },
  { name: 'hooks', description: 'list the lifecycle hooks registered for this directory' },
  { name: 'skills', description: 'list the skills this agent actually loaded' },
  { name: 'mcp', description: 'list the MCP servers this agent started' },
  { name: 'sandbox', description: 'show or change the sandbox mode for this session' },
  { name: 'rename', description: 'rename the current session' },
  { name: 'memory', description: 'memory: list facts, /memory off|on, /memory forget <n>' },
  { name: 'compact', description: 'summarize the conversation to free context' },
  { name: 'init', description: 'bootstrap an AGENTS.md for this repository' },
  { name: 'quit', description: 'exit the TUI' },
  {
    name: 'status',
    description: 'show the session state: model, effort, approval, sandbox, cwd',
  },
  { name: 'diff', description: 'show the uncommitted changes in the working tree' },
  { name: 'model', description: 'switch the model for this session (no argument reports it)' },
  { name: 'ps', description: 'list the background shell sessions this conversation owns' },
  {
    name: 'stop',
    description: 'terminate every background shell session this conversation owns',
  },
  { name: 'review', description: 'review changes [base <ref> | commit <sha>]' },
  { name: 'goal', description: 'run an autonomous goal loop until done/budget' },
]

export const BUILTIN_COMMAND_NAMES: ReadonlySet<string> = new Set(
  BUILTIN_COMMANDS.map((c) => c.name),
)

const EXACT_COMMANDS: ReadonlyMap<string, CommandAction> = new Map([
  ['/clear', { kind: 'clear' }],
  ['/new', { kind: 'new' }],
  ['/help', { kind: 'toggleHelp' }],
  ['/usage', { kind: 'toggleUsage' }],

  ['/status', { kind: 'showStatus' }],
  ['/init', { kind: 'initAgents' }],
  ['/quit', { kind: 'quit' }],
  ['/diff', { kind: 'showDiff' }],
  ['/ps', { kind: 'listPtys' }],
  ['/stop', { kind: 'stopPtys' }],
  ['/compact', { kind: 'compact' }],
  ['/copy', { kind: 'copy' }],
  ['/subagents', { kind: 'listSubagents' }],
  ['/hooks', { kind: 'listHooks' }],
  ['/skills', { kind: 'listSkills' }],
  ['/mcp', { kind: 'listMcp' }],
  ['/retry', { kind: 'retry' }],
  ['/fork', { kind: 'fork' }],
  ['/sessions', { kind: 'listSessions' }],
  ['/logout', { kind: 'logout' }],
  ['/plan', { kind: 'mode', mode: 'plan' }],
  ['/ask', { kind: 'mode', mode: 'ask' }],
  ['/select', { kind: 'mode', mode: 'select' }],
  ['/progress', { kind: 'mode', mode: 'progress' }],
])

const COMMANDS_WITH_ARGUMENT: readonly (readonly [
  command: string,
  action: (arg: string) => CommandAction,
])[] = [
  ['/approval', (arg) => ({ kind: 'approvalMode', arg })],
  ['/image', (arg) => ({ kind: 'image', arg })],
  ['/model', (arg) => ({ kind: 'model', arg })],
  ['/sandbox', (arg) => ({ kind: 'sandbox', arg })],
  ['/resume', (arg) => ({ kind: 'resume', arg })],
  ['/memory', (arg) => ({ kind: 'memoryInfo', arg })],
  ['/effort', (arg) => ({ kind: 'effort', arg })],
  ['/review', (arg) => ({ kind: 'review', arg })],
  ['/goal', (arg) => ({ kind: 'goal', arg })],
  ['/login', (arg) => ({ kind: 'login', arg })],
  ['/archive', (arg) => ({ kind: 'archive', arg })],
  ['/delete', (arg) => ({ kind: 'delete', arg })],
  ['/export', (arg) => ({ kind: 'export', arg })],
  ['/rename', (arg) => ({ kind: 'rename', arg })],
]

function routeWithArgument(trimmed: string): CommandAction | undefined {
  for (const [command, action] of COMMANDS_WITH_ARGUMENT) {
    if (trimmed === command || trimmed.startsWith(`${command} `)) {
      return action(trimmed.slice(command.length).trim())
    }
  }
  return undefined
}

/**
 * Every name this build answers to, in the shape the framework routes over.
 *
 * Built per call because `customNames` is loaded from `.theokit/commands/` and changes at runtime.
 * `arg` is `'optional'` throughout: this product has never refused a bare `/model`, and tightening
 * that here would turn a working invocation into an error on the strength of a refactor.
 */
function definitions(customNames?: ReadonlySet<string>): CommandDefinition[] {
  const builtins = [...EXACT_COMMANDS.keys(), ...COMMANDS_WITH_ARGUMENT.map(([name]) => name)]
  const names = new Set([...builtins.map((n) => n.slice(1)), ...(customNames ?? [])])
  return [...names].map((name) =>
    defineCommand({ name, description: '', arg: 'optional' }),
  )
}

/**
 * What the user typed, as this product's verb.
 *
 * The CLASSIFICATION — command, prose, or a slash that names nothing — is the framework's now. It
 * was the defective half: this function ended `EXACT_COMMANDS.get(trimmed) ?? { kind: 'send' }`, so
 * an unrecognised `/moddel` was handed to the model as text and answered plausibly. The framework
 * already distinguishes `unknown-command`, `missing-argument`, `unexpected-argument` and
 * `ambiguous-command`, and states why: a typo hidden behind a helpful answer is worse than an error.
 *
 * The VERB MAPPING stays here, because which slash means which action is this product's vocabulary.
 */
export function routeCommand(input: string, customNames?: ReadonlySet<string>): CommandAction {
  const trimmed = input.trim()
  if (trimmed.length === 0) return { kind: 'noop' }

  const routed = classifyInput(trimmed, definitions(customNames))
  if (routed.kind === 'message') return { kind: 'send', text: routed.text }
  if (routed.kind === 'error') {
    return { kind: 'commandError', reason: routed.reason, input: trimmed }
  }

  // Recognised. A custom command wins over a builtin of the same name only if it IS one — the
  // framework already resolved ambiguity, so this is a lookup, not a second routing pass.
  if (customNames?.has(routed.command.name) === true) {
    return { kind: 'custom', name: routed.command.name, arg: routed.arg }
  }
  const slash = `/${routed.command.name}`
  const withArgument = routeWithArgument(routed.arg.length > 0 ? `${slash} ${routed.arg}` : slash)
  if (withArgument !== undefined) return withArgument
  return EXACT_COMMANDS.get(slash) ?? { kind: 'send', text: trimmed }
}
