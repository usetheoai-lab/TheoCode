import { Dirent, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const FORMAS_DE_ARTEFATO = ['transcript', 'lock-arquivo', 'lock-diretorio', 'tmp'] as const

export type FormaDeArtefato = (typeof FORMAS_DE_ARTEFATO)[number]

interface ContagemDeForma {
  contagem: number
  bytesAparentes: number
}

interface CensoPorForma extends Record<FormaDeArtefato, ContagemDeForma> {
  ilegiveis: number
  projects: number
}

export function classifyEntry(name: string, ehDiretorio: boolean): FormaDeArtefato | undefined {
  if (name.endsWith('.jsonl.lock')) return ehDiretorio ? 'lock-diretorio' : undefined
  if (ehDiretorio) return undefined
  if (name.endsWith('.jsonl')) return 'transcript'
  if (name.endsWith('.writer.lock')) return 'lock-arquivo'
  if (name.endsWith('.tmp')) return 'tmp'
  return undefined
}

function zerado(): CensoPorForma {
  const base = Object.fromEntries(
    FORMAS_DE_ARTEFATO.map((f) => [f, { contagem: 0, bytesAparentes: 0 }]),
  ) as Record<FormaDeArtefato, ContagemDeForma>
  return { ...base, ilegiveis: 0, projects: 0 }
}

function lerDir(dir: string): Dirent[] | undefined {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
}

export function countByShape(projectsRoot: string): CensoPorForma {
  const censo = zerado()
  const projects = lerDir(projectsRoot)
  if (projects === undefined) return censo
  for (const p of projects) {
    if (!p.isDirectory()) continue
    censo.projects += 1
    const dir = join(projectsRoot, p.name)
    const entries = lerDir(dir)
    if (entries === undefined) {
      censo.ilegiveis += 1
      continue
    }
    for (const e of entries) {
      const forma = classifyEntry(e.name, e.isDirectory())
      if (forma === undefined) continue
      censo[forma].contagem += 1
      if (forma !== 'lock-diretorio') {
        try {
          censo[forma].bytesAparentes += statSync(join(dir, e.name)).size
        } catch {
          // O arquivo sumiu entre o `readdir` e o `stat` (outro processo, ou um GC concorrente).
          // A contagem já foi feita; o byte a menos é ruído de ±1, não um erro do censo.
        }
      }
    }
  }
  return censo
}
