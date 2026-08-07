import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function tempTarget(name: string): string | undefined {
  const m = /^(.+?)\.\d+\.[0-9a-f]+\.tmp$/.exec(name)
  return m?.[1]
}

export interface OrphanTemp {
  readonly path: string
  readonly name: string
  readonly idadeDias: number
}

export interface OpcoesDeVarredura {
  readonly dir: string
  readonly maxAgeDays?: number
  readonly now?: () => number
}

export function temporariosOrfaos(opts: OpcoesDeVarredura): OrphanTemp[] {
  const now = opts.now ?? Date.now
  const maxAgeDays = opts.maxAgeDays ?? 1
  let entries: string[]
  try {
    entries = readdirSync(opts.dir)
  } catch {
    return []
  }
  const presentes = new Set(entries)
  const achados: OrphanTemp[] = []
  for (const name of entries) {
    const target = tempTarget(name)
    if (target === undefined) continue
    if (!presentes.has(target)) continue
    const path = join(opts.dir, name)
    let mtimeMs: number
    try {
      mtimeMs = statSync(path).mtimeMs
    } catch {
      continue
    }
    const idadeDias = (now() - mtimeMs) / 86_400_000
    if (idadeDias > maxAgeDays) achados.push({ path, name, idadeDias })
  }
  return achados.sort((a, b) => a.name.localeCompare(b.name))
}
