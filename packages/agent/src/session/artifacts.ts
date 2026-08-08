export const ARTIFACT_KINDS = ['transcript', 'lock-file', 'lock-directory', 'tmp'] as const

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]



export function classifyEntry(name: string, isDirectory: boolean): ArtifactKind | undefined {
  if (name.endsWith('.jsonl.lock')) return isDirectory ? 'lock-directory' : undefined
  if (isDirectory) return undefined
  if (name.endsWith('.jsonl')) return 'transcript'
  if (name.endsWith('.writer.lock')) return 'lock-file'
  if (name.endsWith('.tmp')) return 'tmp'
  return undefined
}



