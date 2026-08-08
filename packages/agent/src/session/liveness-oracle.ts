import { encodeProjectDir } from '@theokit/agents/persistence'

export type Liveness =
  | { state: 'ALIVE'; cwd: string }
  | { state: 'DEAD'; cwd?: string }
  | { state: 'UNDETERMINED'; reason: string }

export interface OracleIO {
  listEntries(dir: string): string[]
  firstLine(file: string): string
  /**
   * B-020 — `undefined` means "I cannot tell", and is NOT the same answer as `false`.
   *
   * The adapter used to map every `statSync` failure to `false`, and `classifyDirectory` branches on
   * exactly this value to decide ALIVE vs DEAD. So a cwd that exists but cannot be stat-ed (EACCES on
   * a non-traversable parent, ENOTDIR mid-path, EMFILE under a wide sweep) was classified DEAD, which
   * empties the protection set. Distinguishing ENOENT from every other errno IS the decision.
   */
  isDirectory(path: string): boolean | undefined
}

export interface OracleOptions {
  projectsRoot: string
  maxDfsDepth: number
  maxDfsNodes: number
  transcriptSamples?: number
}

const DEFAULT_SAMPLES = 3

const FS_ROOT = '/'

function reasonOf(err: unknown): string {
  const e = err as NodeJS.ErrnoException
  return e.code !== undefined ? `${e.code}: ${e.message}` : String((e as Error)?.message ?? err)
}

function recordedCwd(name: string, io: OracleIO, opts: OracleOptions): string | undefined {
  const dir = `${opts.projectsRoot}/${name}`
  const jsonl = io.listEntries(dir).filter((f) => f.endsWith('.jsonl'))
  const samples = opts.transcriptSamples ?? DEFAULT_SAMPLES
  for (const file of jsonl.slice(0, samples)) {
    let rec: unknown
    try {
      rec = JSON.parse(io.firstLine(`${dir}/${file}`))
    } catch {
      continue
    }
    const cwd = (rec as { cwd?: unknown } | null)?.cwd
    if (typeof cwd !== 'string' || cwd.length === 0) continue
    if (encodeProjectDir(cwd) === name) return cwd
  }
  return undefined
}

type DfsResult =
  | { kind: 'FOUND'; path: string }
  | { kind: 'NOT_FOUND' }
  | { kind: 'CEILING'; reason: string }
  | { kind: 'UNREADABLE'; reason: string }

function dfsExists(name: string, io: OracleIO, opts: OracleOptions): DfsResult {
  let nodes = 0
  // B-020 — a directory we could not read is the difference between "it is not there" and "I could
  // not look". Without this the walk reported the second as the first, on the deletion path.
  let unreadable: string | undefined
  const stack: { path: string; depth: number }[] = [{ path: FS_ROOT, depth: 0 }]
  while (stack.length > 0) {
    const current = stack.pop()
    /* c8 ignore next */
    if (current === undefined) break
    if (nodes >= opts.maxDfsNodes) {
      return { kind: 'CEILING', reason: `DFS exceeded the ceiling of ${opts.maxDfsNodes} visited nodes` }
    }
    nodes += 1
    if (current.depth >= opts.maxDfsDepth) {
      return {
        kind: 'CEILING',
        reason: `DFS exceeded the depth ceiling of ${opts.maxDfsDepth}`,
      }
    }
    let entries: string[]
    try {
      entries = io.listEntries(current.path)
    } catch (err) {
      unreadable ??= `${current.path} — ${reasonOf(err)}`
      continue
    }
    const found = visitEntries(name, current, entries, io, stack)
    if (found !== undefined) return found
  }
  return unreadable === undefined
    ? { kind: 'NOT_FOUND' }
    : { kind: 'UNREADABLE', reason: `could not read ${unreadable}` }
}

function visitEntries(
  name: string,
  current: { path: string; depth: number },
  entries: readonly string[],
  io: OracleIO,
  stack: { path: string; depth: number }[],
): DfsResult | undefined {
  for (const entry of entries) {
    const path = current.path === FS_ROOT ? `/${entry}` : `${current.path}/${entry}`
    const encoded = encodeProjectDir(path)
    if (io.isDirectory(path) !== true) continue
    if (encoded === name) return { kind: 'FOUND', path }
    if (name.startsWith(encoded)) {
      stack.push({ path, depth: current.depth + 1 })
    }
  }
  return undefined
}

export function classifyDirectory(name: string, io: OracleIO, opts: OracleOptions): Liveness {
  let cwd: string | undefined
  try {
    cwd = recordedCwd(name, io, opts)
  } catch (err) {
    return { state: 'UNDETERMINED', reason: `could not read ${name} — ${reasonOf(err)}` }
  }
  if (cwd !== undefined) {
    const present = io.isDirectory(cwd)
    if (present === undefined) {
      return { state: 'UNDETERMINED', reason: `could not stat the recorded cwd ${cwd}` }
    }
    return present ? { state: 'ALIVE', cwd } : { state: 'DEAD', cwd }
  }

  const r = dfsExists(name, io, opts)
  if (r.kind === 'FOUND') return { state: 'ALIVE', cwd: r.path }
  if (r.kind === 'NOT_FOUND') return { state: 'DEAD' }
  return { state: 'UNDETERMINED', reason: r.reason }
}

