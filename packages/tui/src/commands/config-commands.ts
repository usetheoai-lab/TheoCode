import { expandTemplate } from './command-template.js'
import { subagentDir } from './subagent-inventory.js'
import type { CustomCommand } from './custom-commands.js'
import { nextApprovalMode, parseApprovalMode, type ApprovalMode } from '../consent/index.js'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type { Dispatch, SetStateAction } from 'react'

import { EFFORT_LEVELS, parseEffort, type ReasoningEffort } from '@theocode/agent/config'
import { type AttachedImage, ImageAttachError, readImageAttachment } from '@theocode/agent/context'
import type { ToastPayload } from '../screen-types.js'
import { workingDirectory } from '../working-directory.js'
type SetToast = Dispatch<SetStateAction<ToastPayload | null>>

export interface EffortDeps {
  getEffort: () => ReasoningEffort
  setModuleEffort: (level: ReasoningEffort) => void
  setEffort: Dispatch<SetStateAction<ReasoningEffort>>
  setToast: SetToast
}

export function handleEffort(arg: string, deps: EffortDeps): void {
  const { getEffort, setModuleEffort, setEffort, setToast } = deps
  if (arg === '') {
    setToast({ message: `Reasoning effort: ${getEffort()}`, variant: 'info' })
    return
  }
  const level = parseEffort(arg)
  if (level === null) {
    setToast({
      message: `Unknown effort "${arg}" — valid: ${EFFORT_LEVELS.join(' | ')}`,
      variant: 'error',
    })
    return
  }
  setModuleEffort(level)
  setEffort(level)
  setToast({ message: `Reasoning effort: ${level}`, variant: 'success' })
}

export interface ImageDeps {
  setPendingImages: (images: AttachedImage[]) => void
  setToast: SetToast
}

export function handleImage(arg: string, deps: ImageDeps): void {
  const { setPendingImages, setToast } = deps
  if (arg.length === 0) {
    setToast({ message: 'Usage: /image <path to .png/.jpg/.gif/.webp>', variant: 'info' })
    return
  }
  try {
    setPendingImages([readImageAttachment(arg)])
    setToast({ message: `Image attached (${arg}) — it rides your next message`, variant: 'info' })
  } catch (e) {
    const msg = e instanceof ImageAttachError ? e.message : `could not attach image: ${String(e)}`
    setToast({ message: msg, variant: 'error' })
  }
}

export function handleRetry(deps: {
  lastSent: string | null
  send: (message: string) => void
  setToast: SetToast
}): void {
  const { lastSent, send, setToast } = deps
  if (lastSent === null) {
    setToast({ message: 'Nothing to retry yet', variant: 'info' })
  } else {
    send(lastSent)
  }
}

export interface ApprovalDeps {
  setApprovalMode: Dispatch<SetStateAction<ApprovalMode>>
  setToast: SetToast
}

export function handleApprovalMode(arg: string, deps: ApprovalDeps): void {
  const { setApprovalMode, setToast } = deps
  if (arg === '') {
    setApprovalMode((m) => {
      const next = nextApprovalMode(m)
      setToast({ message: `Approval mode: ${next}`, variant: 'success' })
      return next
    })
    return
  }
  const parsed = parseApprovalMode(arg)
  if (parsed) {
    setApprovalMode(parsed)
    setToast({ message: `Approval mode: ${parsed}`, variant: 'success' })
  } else {
    setToast({
      message: `Unknown approval mode "${arg}" — use suggest | auto-edit | full-auto`,
      variant: 'error',
    })
  }
}

export interface CustomCommandDeps {
  send: (message: string) => void
  setLastSent: (message: string) => void
  setPendingModel: (model: string | undefined) => void
  setToast: SetToast
}

function expansionDeps(warn: (m: string) => void): Parameters<typeof expandTemplate>[2] {
  return {
    shell: (cmd) =>
      new Promise((resolveShell) => {
        execFile(
          process.env.SHELL ?? '/bin/sh',
          ['-c', cmd],
          { timeout: 10_000, maxBuffer: 1024 * 1024 },
          (err, stdout, stderr) =>
            resolveShell({ text: `${stdout ?? ''}${stderr ?? ''}`, ok: err === null }),
        )
      }),
    readFile: (fileName) => {
      const path = fileName.startsWith('~/')
        ? join(homedir(), fileName.slice(2))
        : resolve(workingDirectory(), fileName)
      try {
        return statSync(path).isFile() ? readFileSync(path, 'utf8') : undefined
      } catch {
        return undefined
      }
    },
    warn,
  }
}

function withDelegationInstruction(
  name: string,
  command: CustomCommand,
  expanded: string,
  setToast: CustomCommandDeps['setToast'],
): string {
  // B-072 — the directory comes from `subagentDir`, the same function `/subagents` lists from.
  // It was an inline `join(...)` here and a second literal in the listing, so the two could drift
  // into a listing that promises an agent this router then fails to find. One definition, one
  // possible answer.
  const agentExists =
    command.agent !== undefined &&
    existsSync(join(subagentDir(workingDirectory()), `${command.agent}.md`))
  if (command.agent !== undefined && !agentExists) {
    setToast({
      message: `/${name}: subagent "${command.agent}" not found in .theokit/agents/ — running in main context`,
      variant: 'info',
    })
  }
  const delegate = (agentExists && command.subtask !== false) || command.subtask === true
  if (!delegate) return expanded
  const target = command.agent !== undefined ? `the "${command.agent}" subagent` : 'a subagent'
  return `Delegate the following task to ${target} and report its result:\n\n${expanded}`
}

export function handleCustomCommand(
  name: string,
  arg: string,
  rawText: string,
  command: CustomCommand | undefined,
  deps: CustomCommandDeps,
): void {
  const { send, setLastSent, setPendingModel, setToast } = deps
  if (command === undefined) {
    setLastSent(rawText.trim())
    send(rawText.trim())
    return
  }
  void (async () => {
    try {
      const expanded = await expandTemplate(
        command.template,
        arg,
        expansionDeps((m) => {
          setToast({ message: m, variant: 'info' })
        }),
      )
      const message = withDelegationInstruction(name, command, expanded, setToast)
      if (command.model !== undefined) setPendingModel(command.model)
      process.stderr.write(`[custom-command] executed ${name}\n`)
      setLastSent(message)
      send(message)
    } catch (err) {
      setPendingModel(undefined)
      setToast({
        message: `/${name} failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'error',
      })
    }
  })()
}
