export const FORMAS_DE_ARTEFATO = ['transcript', 'lock-arquivo', 'lock-diretorio', 'tmp'] as const

export type ArtifactKind = (typeof FORMAS_DE_ARTEFATO)[number]



export function classifyEntry(name: string, isDirectory: boolean): ArtifactKind | undefined {
  if (name.endsWith('.jsonl.lock')) return isDirectory ? 'lock-diretorio' : undefined
  if (isDirectory) return undefined
  if (name.endsWith('.jsonl')) return 'transcript'
  if (name.endsWith('.writer.lock')) return 'lock-arquivo'
  if (name.endsWith('.tmp')) return 'tmp'
  return undefined
}



