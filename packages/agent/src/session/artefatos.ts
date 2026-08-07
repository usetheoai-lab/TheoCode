export const FORMAS_DE_ARTEFATO = ['transcript', 'lock-arquivo', 'lock-diretorio', 'tmp'] as const

export type FormaDeArtefato = (typeof FORMAS_DE_ARTEFATO)[number]



export function classifyEntry(name: string, ehDiretorio: boolean): FormaDeArtefato | undefined {
  if (name.endsWith('.jsonl.lock')) return ehDiretorio ? 'lock-diretorio' : undefined
  if (ehDiretorio) return undefined
  if (name.endsWith('.jsonl')) return 'transcript'
  if (name.endsWith('.writer.lock')) return 'lock-arquivo'
  if (name.endsWith('.tmp')) return 'tmp'
  return undefined
}



