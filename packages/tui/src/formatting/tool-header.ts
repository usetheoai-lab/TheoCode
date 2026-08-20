import type { AgentToolEvent } from '@theokit/tui'

function oneLine(value: string, max = 120): string {
  const flat = value.replace(/\r?\n/g, '⏎')
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/**
 * B-027 — the `Blocked <cmd>` rendering was DELETED, not repaired.
 *
 * `vetoReason` detected `{ exitCode: 126, stderr }` and could never fire, on three independent
 * counts: it bailed on `'ok' in p` and every SDK tool result carries `ok`; it read `p.exitCode`
 * where results use `exit_code` (the sibling below gets it right); and nothing in this repository or
 * the SDK produces exit code 126, which is a shell convention this product never emits. Its only
 * consumer populated the WeakMap that the header branch read, so the whole chain was unreachable —
 * a feature that read as protection and provided none.
 *
 * It was not rewired because the correct shape is not known here without guessing. A hook veto is
 * `{ block: true, message }` (`@theokit/sdk` `PreToolCallDecision`), which the SDK "surfaces to the
 * model" — what that becomes on the wire the renderer sees was not measured, and inventing a shape
 * is how the original was written. B-055 carries the wiring with that contract as its evidence.
 */

export function formatToolHeader(
  event: AgentToolEvent,
): { name?: string; summary?: string } | undefined {
  const active = event.status === 'running' || event.status === 'pending'
  const input = (event.input ?? {}) as Record<string, unknown>
  return HEADERS_BY_TOOL.get(String(event.name))?.(input, active)
}

type Header = { name?: string; summary?: string }

const HEADERS_BY_TOOL: ReadonlyMap<
  string,
  (input: Record<string, unknown>, active: boolean) => Header
> = new Map([
  [
    'run_shell',
    (input, active) => {
      const cmd = typeof input.command === 'string' ? oneLine(input.command) : ''
      return { name: `${active ? 'Running' : 'Ran'} ${cmd}`.trim() }
    },
  ],
  [
    'interactive_shell',
    (input, active) => {
      const cmd = typeof input.command === 'string' ? oneLine(input.command) : ''
      return { name: active ? 'Starting shell session' : 'Started shell session', summary: cmd }
    },
  ],
  [
    'write_stdin',
    (_input, active) => ({ name: active ? 'Writing to session' : 'Wrote to session' }),
  ],
  [
    'current_time',
    (_input, active) => ({ name: active ? 'Checking the time' : 'Checked the time' }),
  ],
  ['update_plan', (_input, active) => ({ name: active ? 'Updating plan' : 'Updated plan' })],
  [
    'edit_file',
    (input, active) => {
      const path = typeof input.path === 'string' ? input.path : 'file'
      return { name: `${active ? 'Editing' : 'Edited'} ${path}`.trim() }
    },
  ],
  [
    'apply_patch',
    (input, active) => {
      const patch = typeof input.patch === 'string' ? input.patch : ''
      return {
        name: `${active ? 'Editing' : 'Edited'} ${filesFromV4APatch(patch)}${diffCounts(patch)}`.trim(),
      }
    },
  ],
])

export function formatToolResult(
  event: AgentToolEvent,
  rawResult: unknown,
): { output: string } | undefined {
  const p = parseJsonObject(rawResult)
  if (p === undefined) return undefined
  return BODY_BY_TOOL.get(String(event.name))?.(p)
}

type ParsedResult = Record<string, unknown>

const BODY_BY_TOOL: ReadonlyMap<string, (p: ParsedResult) => { output: string } | undefined> =
  new Map([
    ['interactive_shell', terminalBody],
    ['write_stdin', terminalBody],
    [
      'edit_file',
      (p) => {
        if (p.ok === false) return { output: `edit_file: ${errorText(p)}` }
        if (typeof p.replacements !== 'number') return undefined
        return {
          output: `Applied ${String(p.replacements)} edit${p.replacements === 1 ? '' : 's'}.`,
        }
      },
    ],
    [
      'current_time',
      (p) => {
        if (p.ok === false) return { output: `current_time: ${errorText(p)}` }
        return typeof p.current_time === 'string' ? { output: p.current_time } : undefined
      },
    ],
    [
      'read_file',
      (p) => {
        if (p.ok === false) return { output: `read_file: ${errorText(p)}` }
        return typeof p.content === 'string' ? { output: p.content } : undefined
      },
    ],
    [
      'apply_patch',
      (p) => {
        if (p.ok === false) return { output: `apply_patch: ${errorText(p)}` }
        const files = Array.isArray(p.files_patched)
          ? (p.files_patched as unknown[]).map(String)
          : []
        if (files.length === 0) return { output: 'Applied patch.' }
        return {
          output: `Edited ${String(files.length)} file${files.length === 1 ? '' : 's'}: ${files.join(', ')}`,
        }
      },
    ],
    [
      'grep',
      (p) => {
        if (p.ok === false) return { output: `grep: ${errorText(p)}` }
        if (!Array.isArray(p.matches)) return undefined
        const lines = (
          p.matches as Array<{ file?: unknown; line?: unknown; preview?: unknown }>
        ).map((m) => `${String(m.file ?? '')}:${String(m.line ?? '')}: ${String(m.preview ?? '')}`)
        return { output: lines.length > 0 ? lines.join('\n') : '(no matches)' }
      },
    ],
    ['update_plan', planBody],
    ['run_shell', shellBody],
  ])

function terminalBody(p: ParsedResult): { output: string } | undefined {
  if (p.ok === false) return { output: `error: ${errorText(p)}` }
  return typeof p.output === 'string'
    ? { output: p.output.replace(/\r\n/g, '\n').replace(/\r/g, '') }
    : undefined
}

function planBody(p: ParsedResult): { output: string } | undefined {
  if (p.ok === false || !Array.isArray(p.steps)) return undefined
  const glyph: Record<string, string> = { completed: '✔', in_progress: '▶', pending: '□' }
  const lines = (p.steps as Array<{ step?: unknown; status?: unknown }>).map((s) => {
    const status = typeof s.status === 'string' ? s.status : 'pending'
    return `${glyph[status] ?? '□'} ${typeof s.step === 'string' ? s.step : ''}`
  })
  if (typeof p.explanation === 'string' && p.explanation) lines.unshift(p.explanation)
  if (typeof p.warning === 'string' && p.warning) lines.push(`(note: ${p.warning})`)
  return { output: lines.join('\n') }
}

function shellBody(p: ParsedResult): { output: string } | undefined {
  if (p.ok === false) return { output: `run_shell: ${errorText(p)}` }
  const body = [p.stdout, p.stderr]
    .map((s) =>
      typeof s === 'string' ? s.replace(/\r\n/g, '\n').replace(/\r/g, '').trimEnd() : '',
    )
    .filter(Boolean)
    .join('\n')
  const code = typeof p.exit_code === 'number' ? p.exit_code : 0
  const suffix = code !== 0 ? `${body ? '\n' : ''}(exit code: ${String(code)})` : ''
  return { output: `${body}${suffix}` || '(no output)' }
}

export function formatApproval(pending: { toolName: string; input?: unknown }): {
  toolType: string
  command: string
  description?: string
} {
  const label = APPROVAL_LABELS.get(pending.toolName)
  if (label !== undefined) return label((pending.input ?? {}) as Record<string, unknown>)
  return {
    toolType: 'Tool call',
    command: pending.toolName,
    ...(pending.input !== undefined ? { description: JSON.stringify(pending.input) } : {}),
  }
}

type ApprovalLabel = { toolType: string; command: string; description?: string }

const APPROVAL_LABELS: ReadonlyMap<string, (input: Record<string, unknown>) => ApprovalLabel> =
  new Map([
    [
      'run_shell',
      (input) => ({
        toolType: 'Run command',
        command: typeof input.command === 'string' ? input.command : '',
      }),
    ],
    [
      'interactive_shell',
      (input) => ({
        toolType: 'Start interactive shell',
        command: typeof input.command === 'string' ? input.command : '',
      }),
    ],
    [
      'write_stdin',
      (input) => {
        const chars = typeof input.input === 'string' ? input.input : ''
        return { toolType: 'Write to session', command: chars.replace(/\n/g, '⏎').slice(0, 80) }
      },
    ],
    [
      'edit_file',
      (input) => ({
        toolType: 'Apply edit',
        command: typeof input.path === 'string' ? input.path : 'file',
      }),
    ],
    [
      'apply_patch',
      (input) => {
        const patch = typeof input.patch === 'string' ? input.patch : ''
        return { toolType: 'Apply patch', command: filesFromV4APatch(patch), description: patch }
      },
    ],
    [
      'web_fetch',
      (input) => ({
        toolType: 'Fetch URL',
        command: typeof input.url === 'string' ? input.url : '',
      }),
    ],
    [
      'web_search',
      (input) => ({
        toolType: 'Web search',
        command: typeof input.query === 'string' ? input.query : '',
      }),
    ],
  ])

function parseJsonObject(raw: unknown): Record<string, unknown> | undefined {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function errorText(p: Record<string, unknown>): string {
  return typeof p.error === 'string' ? p.error : 'failed'
}

function filesFromV4APatch(patch: string): string {
  const markers: Array<[string, boolean]> = [
    ['*** Add File: ', false],
    ['*** Delete File: ', false],
    ['*** Update File: ', false],
    ['*** Move to: ', true], // rename → replaces the last file with the destination
  ]
  const files: string[] = []
  for (const raw of patch.split('\n')) {
    const line = raw.trim()
    for (const [marker, isMove] of markers) {
      if (!line.startsWith(marker)) continue
      const name = line.slice(marker.length).trim()
      if (isMove && files.length > 0) files[files.length - 1] = name
      else if (name) files.push(name)
      break
    }
  }
  const uniq = [...new Set(files.filter(Boolean))]
  if (uniq.length === 0) return 'files'
  return uniq.length <= 3
    ? uniq.join(', ')
    : `${uniq.slice(0, 3).join(', ')} +${uniq.length - 3} more`
}

function diffCounts(diff: string | undefined): string {
  if (typeof diff !== 'string' || diff.length === 0) return ''
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue
    if (line.startsWith('+')) added++
    else if (line.startsWith('-')) removed++
  }
  return added === 0 && removed === 0 ? '' : ` (+${added} -${removed})`
}
