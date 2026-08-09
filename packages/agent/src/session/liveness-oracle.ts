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

/**
 * B-054 — a node budget SHARED by every classification in one sweep.
 *
 * The per-project ceiling multiplies by the number of projects, and that is not a ceiling. Measured
 * on a real machine: `~/.theokit/projects` holds 13 269 directories; a 120-project sample resolves
 * 91 through the cheap transcript read and 29 carry no transcript at all, so roughly 3 200 fall
 * through to the filesystem search. At `MAX_NOS_DFS` each, that is ~64 million readdir/stat calls
 * for one `--all-projects` run — and the command never returns.
 *
 * The search exists because `encodeProjectDir` is LOSSY: `theokit-framework` and
 * `theokit/framework` encode identically, so a project name cannot be decoded back to a path and a
 * moved directory has to be found by searching. It is worth 20 000 nodes ONCE, not 13 269 times.
 *
 * When the budget runs out the remaining projects are UNDETERMINED, never DEAD (B-020): a project
 * the sweep did not look at is not a project it found to be gone, and `planOneProject` keeps those.
 */
export interface DfsBudget {
  remaining: number
}

export function createDfsBudget(nodes: number): DfsBudget {
  return { remaining: nodes }
}

export interface OracleOptions {
  projectsRoot: string
  /** Shared across a sweep. Absent for a single-project run, which keeps its own ceiling. */
  dfsBudget?: DfsBudget
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

/** The ceiling this step would cross, or `undefined` when the walk may continue. */
function ceilingHit(
  nodes: number,
  depth: number,
  shared: DfsBudget | undefined,
  opts: OracleOptions,
): DfsResult | undefined {
  if (nodes >= opts.maxDfsNodes || exhausted(shared)) {
    return { kind: 'CEILING', reason: `DFS exceeded the ceiling of ${opts.maxDfsNodes} visited nodes` }
  }
  if (depth >= opts.maxDfsDepth) {
    return { kind: 'CEILING', reason: `DFS exceeded the depth ceiling of ${opts.maxDfsDepth}` }
  }
  return undefined
}

/** Whether a shared sweep budget exists and has run out. */
function exhausted(budget: DfsBudget | undefined): boolean {
  return budget !== undefined && budget.remaining <= 0
}

function dfsExists(name: string, io: OracleIO, opts: OracleOptions): DfsResult {
  const shared = opts.dfsBudget
  if (exhausted(shared)) {
    return {
      kind: 'CEILING',
      reason: 'the sweep exhausted its shared filesystem-search budget before reaching this project',
    }
  }
  let nodes = 0
  // B-020 — a directory we could not read is the difference between "it is not there" and "I could
  // not look". Without this the walk reported the second as the first, on the deletion path.
  let unreadable: string | undefined
  const stack: { path: string; depth: number }[] = [{ path: FS_ROOT, depth: 0 }]
  while (stack.length > 0) {
    const current = stack.pop()
    /* c8 ignore next */
    if (current === undefined) break
    const stop = ceilingHit(nodes, current.depth, shared, opts)
    if (stop !== undefined) return stop
    let entries: string[]
    try {
      entries = io.listEntries(current.path)
    } catch (err) {
      unreadable ??= `${current.path} — ${reasonOf(err)}`
      continue
    }
    // B-054 — charge for the ENTRIES, because that is the work. `visitEntries` stats every one of
    // them, so a directory with 13 269 children costs 13 269 syscalls and used to cost ONE node.
    // Measured before this: 40 projects produced 87 `listEntries` and 547 019 `isDirectory` calls,
    // because the walk reaches `~/.theokit/projects` and stats all of it — once per project.
    nodes += entries.length
    if (shared !== undefined) shared.remaining -= entries.length
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

