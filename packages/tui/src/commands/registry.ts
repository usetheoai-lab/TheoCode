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
  | { kind: 'rename'; arg: string }
  | { kind: 'mode'; mode: DemoMode }
  | { kind: 'approvalMode'; arg: string }
  // M48 — user-defined command (loaded from .theokit/commands/); arg = raw argument string.
  | { kind: 'custom'; name: string; arg: string }
  // M49 — durable-memory status (enabled/trusted, store path, fact count).
  | { kind: 'memoryInfo' }
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

// B-011 — the SDK exports this shape as `SlashCommand` (re-exported as `ChatComposerCommand`, the
// name `ChatComposer` consumes). Declaring an identical anonymous type meant the composer's contract
// and this list could drift apart with nothing to catch it.
export const BUILTIN_COMMANDS: readonly ChatComposerCommand[] = [
  { name: 'clear', description: 'clear the conversation' },
  { name: 'new', description: 'start a fresh conversation (M21)' },
  { name: 'help', description: 'toggle the keyboard shortcuts panel' },
  { name: 'usage', description: 'toggle the token-usage panel' },
  { name: 'retry', description: 're-send the last message' },
  { name: 'fork', description: 'branch the current session into a new one (M39)' },
  { name: 'sessions', description: 'list your sessions (M39)' },
  { name: 'logout', description: 'remove the stored credential' },
  { name: 'plan', description: 'demo: plan approval card' },
  { name: 'ask', description: 'demo: question prompt' },
  { name: 'select', description: 'demo: multi-select list' },
  { name: 'progress', description: 'demo: multi-step progress' },
  { name: 'approval', description: 'approval mode: suggest | auto-edit | full-auto' },
  { name: 'effort', description: 'reasoning effort: minimal|low|medium|high|xhigh' },
  { name: 'login', description: 'authenticate a provider: /login <provider>' },
  { name: 'image', description: 'attach an image to the NEXT turn: /image <path> (M35)' },
  { name: 'archive', description: 'archive a session [id] (M39)' },
  { name: 'rename', description: 'rename the current session (M39)' },
  { name: 'memory', description: 'durable-memory status (M49)' },
  { name: 'compact', description: 'summarize the conversation to free context (M50)' },
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
  { name: 'review', description: 'review changes [base <ref> | commit <sha>] (M51)' },
  { name: 'goal', description: 'run an autonomous goal loop until done/budget (M55)' },
]

export const BUILTIN_COMMAND_NAMES: ReadonlySet<string> = new Set(
  BUILTIN_COMMANDS.map((c) => c.name),
)

const EXACT_COMMANDS: ReadonlyMap<string, CommandAction> = new Map([
  ['/clear', { kind: 'clear' }],
  ['/new', { kind: 'new' }],
  ['/help', { kind: 'toggleHelp' }],
  ['/usage', { kind: 'toggleUsage' }],
  ['/memory', { kind: 'memoryInfo' }],
  ['/status', { kind: 'showStatus' }],
  ['/init', { kind: 'initAgents' }],
  ['/quit', { kind: 'quit' }],
  ['/diff', { kind: 'showDiff' }],
  ['/ps', { kind: 'listPtys' }],
  ['/stop', { kind: 'stopPtys' }],
  ['/compact', { kind: 'compact' }],
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
  ['/effort', (arg) => ({ kind: 'effort', arg })],
  ['/review', (arg) => ({ kind: 'review', arg })],
  ['/goal', (arg) => ({ kind: 'goal', arg })],
  ['/login', (arg) => ({ kind: 'login', arg })],
  ['/archive', (arg) => ({ kind: 'archive', arg })],
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

export function routeCommand(input: string, customNames?: ReadonlySet<string>): CommandAction {
  const trimmed = input.trim()
  if (trimmed.length === 0) return { kind: 'noop' }
  if (customNames !== undefined && trimmed.startsWith('/')) {
    const body = trimmed.slice(1)
    for (const name of [...customNames].sort((a, b) => b.length - a.length)) {
      if (body === name || body.startsWith(`${name} `)) {
        return { kind: 'custom', name, arg: body.slice(name.length).trim() }
      }
    }
  }
  const comArgumento = routeWithArgument(trimmed)
  if (comArgumento !== undefined) return comArgumento
  return EXACT_COMMANDS.get(trimmed) ?? { kind: 'send', text: trimmed }
}
