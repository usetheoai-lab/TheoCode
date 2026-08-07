import { existsSync, readFileSync } from 'node:fs'

import { atomicWriteText } from '@theokit/agents/persistence'

import { enqueue } from '../terminal-io/index.js'

export function persistSessionId(file: string, id: string): Promise<void> {
  return enqueue(file, () => atomicWriteText(file, id))
}

export function loadOrCreateSessionId(file: string, generate: () => string): string {
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim()
    if (stored) return stored
  }
  const id = generate()
  void persistSessionId(file, id)
  return id
}
