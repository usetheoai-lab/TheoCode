import { encodeProjectDir } from '@theokit/agents/persistence'

export type Liveness =
  | { state: 'ALIVE'; cwd: string }
  | { state: 'DEAD'; cwd?: string }
  | { state: 'UNDETERMINED'; reason: string }

export interface OracleIO {
  listEntries(dir: string): string[]
  firstLine(file: string): string
  isDirectory(path: string): boolean
}

export interface OracleOptions {
  projectsRoot: string
  maxProfundidadeDFS: number
  maxDfsNodes: number
  transcriptSamples?: number
}

const DEFAULT_SAMPLES = 3

const FS_ROOT = '/'

function reasonOf(err: unknown): string {
  const e = err as NodeJS.ErrnoException
  return e.code !== undefined ? `${e.code}: ${e.message}` : String((e as Error)?.message ?? err)
}

function cwdAutoVerificado(name: string, io: OracleIO, opts: OracleOptions): string | undefined {
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

type ResultadoDFS =
  { kind: 'ACHOU'; path: string } | { kind: 'NOT_FOUND' } | { kind: 'CEILING'; reason: string }

function dfsExists(name: string, io: OracleIO, opts: OracleOptions): ResultadoDFS {
  let nodes = 0
  const pilha: { path: string; depth: number }[] = [{ path: FS_ROOT, depth: 0 }]
  while (pilha.length > 0) {
    const current = pilha.pop()
    /* c8 ignore next */
    if (current === undefined) break
    if (nodes >= opts.maxDfsNodes) {
      return { kind: 'CEILING', reason: `DFS exceeded the ceiling of ${opts.maxDfsNodes} visited nodes` }
    }
    nodes += 1
    if (current.depth >= opts.maxProfundidadeDFS) {
      return {
        kind: 'CEILING',
        reason: `DFS estourou o teto de depth ${opts.maxProfundidadeDFS}`,
      }
    }
    let entries: string[]
    try {
      entries = io.listEntries(current.path)
    } catch {
      continue
    }
    const achado = visitEntries(name, current, entries, io, pilha)
    if (achado !== undefined) return achado
  }
  return { kind: 'NOT_FOUND' }
}

function visitEntries(
  name: string,
  current: { path: string; depth: number },
  entries: readonly string[],
  io: OracleIO,
  pilha: { path: string; depth: number }[],
): ResultadoDFS | undefined {
  for (const entry of entries) {
    const path = current.path === FS_ROOT ? `/${entry}` : `${current.path}/${entry}`
    const codificado = encodeProjectDir(path)
    if (!io.isDirectory(path)) continue
    if (codificado === name) return { kind: 'ACHOU', path }
    if (name.startsWith(codificado)) {
      pilha.push({ path, depth: current.depth + 1 })
    }
  }
  return undefined
}

export function classifyDirectory(name: string, io: OracleIO, opts: OracleOptions): Liveness {
  let cwd: string | undefined
  try {
    cwd = cwdAutoVerificado(name, io, opts)
  } catch (err) {
    return { state: 'UNDETERMINED', reason: `could not read ${name} — ${reasonOf(err)}` }
  }
  if (cwd !== undefined) {
    return io.isDirectory(cwd) ? { state: 'ALIVE', cwd } : { state: 'DEAD', cwd }
  }

  const r = dfsExists(name, io, opts)
  if (r.kind === 'ACHOU') return { state: 'ALIVE', cwd: r.path }
  if (r.kind === 'NOT_FOUND') return { state: 'DEAD' }
  return { state: 'UNDETERMINED', reason: r.reason }
}

