/**
 * B-075 — the two commands that move a conversation OUT of the terminal.
 *
 * Their own module: `command-content.ts` is the panels-and-toasts file and these two do I/O
 * (clipboard, filesystem). Both read the TIMELINE, never the rendered frame — the frame is
 * hard-wrapped to a bordered box, which re-flows the code an answer usually contains.
 */
import type { Dispatch, SetStateAction } from 'react'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { ContentPanel, ToastPayload } from '../screen-types.js'
import { workingDirectory } from '../working-directory.js'
import { copyToClipboard } from '../clipboard.js'
import { conversationToMarkdown, lastAssistantText } from '../transcript-export.js'
import { listSubagents, subagentDir } from './subagent-inventory.js'
import { hookInventory, renderHookInventory } from './hook-inventory.js'
import { mcpPanelBody, skillsPanelBody } from './wiring-panels.js'
import { currentWiring } from '../agent-session/wiring-record.js'
import { classifyHooks, loadApprovedHooks, parseHooks } from '@theocode/agent/hooks'
import { resolveEffectiveConfig, resolveTrustPosture } from '@theocode/agent/config'

type SetToast = Dispatch<SetStateAction<ToastPayload | null>>

export function handleCopy(events: readonly unknown[], setToast: SetToast): void {
  const text = lastAssistantText(events)
  if (text === undefined) {
    setToast({ message: 'nothing to copy — the agent has not replied yet', variant: 'info' })
    return
  }
  try {
    const { bin } = copyToClipboard(text)
    setToast({ message: `copied the last reply (${bin})`, variant: 'success' })
  } catch (e: unknown) {
    // Reported, never swallowed: a copy that silently did nothing is discovered when the user
    // pastes. The typed error already names /export as the way out.
    setToast({ message: (e as Error).message, variant: 'error' })
  }
}

export function handleExport(
  arg: string,
  events: readonly unknown[],
  currentSessionId: () => string,
  setToast: SetToast,
): void {
  const markdown = conversationToMarkdown(events)
  if (markdown.length === 0) {
    setToast({ message: 'nothing to export — this conversation is empty', variant: 'info' })
    return
  }
  const name = arg.trim()
  const target =
    name.length > 0
      ? resolve(workingDirectory(), name)
      : join(workingDirectory(), `${currentSessionId()}.md`)
  try {
    // `wx` so an export never overwrites: the path may be a file the user cares about, and this
    // command is not the place to discover that.
    writeFileSync(target, `${markdown}\n`, { encoding: 'utf8', flag: 'wx' })
    setToast({ message: `wrote ${target}`, variant: 'success' })
  } catch (e: unknown) {
    const detail =
      (e as NodeJS.ErrnoException).code === 'EEXIST'
        ? `${target} already exists — pass another path`
        : (e as Error).message
    setToast({ message: `export failed: ${detail}`, variant: 'error' })
  }
}

/**
 * B-072 — the subagent inventory, rendered.
 *
 * Lives beside the transcript commands because both answer "what is here?" without starting a turn.
 * The empty case names the directory: a user who defined agents somewhere else needs the path, not
 * the word "none".
 */
export function handleListSubagents(setPanel: (p: ContentPanel) => void): void {
  const cwd = workingDirectory()
  const names = listSubagents(cwd)
  setPanel({
    title: 'subagents',
    body:
      names.length === 0
        ? `no subagents in ${subagentDir(cwd)} — a custom command naming one will run in the main context instead`
        : names.map((n) => `  ${n}`).join('\n'),
  })
}

/**
 * B-071 — the hook inventory, rendered.
 *
 * The three inputs are the consent gate's own: effective config, the approved store, and
 * `classifyHooks`. Reading the config a second way here would make this a rival source of truth
 * about what runs.
 */
export function handleListHooks(setPanel: (p: ContentPanel) => void): void {
  const cwd = workingDirectory()
  // Trust is resolved from `resolveTrustPosture`, the same source `use-consent.ts` reads, rather
  // than threaded down from React state. One less wire, and it cannot go stale against the posture
  // that actually decided whether the hooks were wired.
  const inventory = hookInventory({
    directoryTrusted: resolveTrustPosture(cwd).level === 'trusted',
    classified: () =>
      classifyHooks(parseHooks(resolveEffectiveConfig({ cwd }).hooks), loadApprovedHooks(cwd), {
        previousByEvent: true,
      }),
  })
  setPanel({ title: 'hooks', body: renderHookInventory(inventory) })
}

/** B-070 — the skills the LAST BUILD loaded, never a re-read of config. */
export function handleListSkills(setPanel: (p: ContentPanel) => void): void {
  setPanel({ title: 'skills', body: skillsPanelBody(currentWiring()) })
}

/** B-069 — the MCP servers the LAST BUILD started, never a re-read of `.mcp.json`. */
export function handleListMcp(setPanel: (p: ContentPanel) => void): void {
  setPanel({ title: 'mcp servers', body: mcpPanelBody(currentWiring()) })
}
