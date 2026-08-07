import { existsSync, readFileSync } from 'node:fs'

import { atomicWriteText } from '@theokit/agents/persistence'

import { enqueue } from '../terminal-io/index.js'
import { fireAndForget } from './fire-and-forget.js'

export function persistSessionId(file: string, id: string): Promise<void> {
  return enqueue(file, () => atomicWriteText(file, id))
}

export function loadOrCreateSessionId(file: string, generate: () => string): string {
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim()
    if (stored) return stored
  }
  const id = generate()
  void fireAndForget(persistSessionId(file, id), 'the session pointer')
  return id
}
