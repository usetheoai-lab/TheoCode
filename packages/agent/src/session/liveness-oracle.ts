import { encodeProjectDir } from '@theokit/agents/persistence'

export type Liveness =
  | { state: 'VIVO'; cwd: string }
  | { state: 'MORTO'; cwd?: string }
  | { state: 'INDETERMINADO'; reason: string }

export interface OracleIO {
  listEntries(dir: string): string[]
  firstLine(file: string): string
  ehDiretorio(path: string): boolean
}

export interface OracleOptions {
  projectsRoot: string
  maxProfundidadeDFS: number
  maxNosDFS: number
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
  { kind: 'ACHOU'; path: string } | { kind: 'NAO_ACHOU' } | { kind: 'TETO'; reason: string }

function dfsExistencia(name: string, io: OracleIO, opts: OracleOptions): ResultadoDFS {
  let nos = 0
  const pilha: { path: string; profundidade: number }[] = [{ path: FS_ROOT, profundidade: 0 }]
  while (pilha.length > 0) {
    const atual = pilha.pop()
    /* c8 ignore next */
    if (atual === undefined) break
    if (nos >= opts.maxNosDFS) {
      return { kind: 'TETO', reason: `DFS estourou o teto de ${opts.maxNosDFS} nós visitados` }
    }
    nos += 1
    if (atual.profundidade >= opts.maxProfundidadeDFS) {
      return {
        kind: 'TETO',
        reason: `DFS estourou o teto de profundidade ${opts.maxProfundidadeDFS}`,
      }
    }
    let entries: string[]
    try {
      entries = io.listEntries(atual.path)
    } catch {
      continue
    }
    const achado = visitEntries(name, atual, entries, io, pilha)
    if (achado !== undefined) return achado
  }
  return { kind: 'NAO_ACHOU' }
}

function visitEntries(
  name: string,
  atual: { path: string; profundidade: number },
  entries: readonly string[],
  io: OracleIO,
  pilha: { path: string; profundidade: number }[],
): ResultadoDFS | undefined {
  for (const entry of entries) {
    const path = atual.path === FS_ROOT ? `/${entry}` : `${atual.path}/${entry}`
    const codificado = encodeProjectDir(path)
    if (!io.ehDiretorio(path)) continue
    if (codificado === name) return { kind: 'ACHOU', path }
    if (name.startsWith(codificado)) {
      pilha.push({ path, profundidade: atual.profundidade + 1 })
    }
  }
  return undefined
}

export function classifyDirectory(name: string, io: OracleIO, opts: OracleOptions): Liveness {
  let cwd: string | undefined
  try {
    cwd = cwdAutoVerificado(name, io, opts)
  } catch (err) {
    return { state: 'INDETERMINADO', reason: `não foi possível ler ${name} — ${reasonOf(err)}` }
  }
  if (cwd !== undefined) {
    return io.ehDiretorio(cwd) ? { state: 'VIVO', cwd } : { state: 'MORTO', cwd }
  }

  const r = dfsExistencia(name, io, opts)
  if (r.kind === 'ACHOU') return { state: 'VIVO', cwd: r.path }
  if (r.kind === 'NAO_ACHOU') return { state: 'MORTO' }
  return { state: 'INDETERMINADO', reason: r.reason }
}

