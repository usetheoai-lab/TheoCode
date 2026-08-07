import { atomicWriteJson, withFileLock } from '@theokit/agents/persistence'

import { mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const TRUST_STORE = join(homedir(), '.theokit', 'trusted-dirs.json')

function canonical(dir: string): string {
  try {
    return realpathSync(dir)
  } catch {
    return resolve(dir) 
  }
}

function lerDocumento(store: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(store, 'utf8'))
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {} 
  }
}

function trustedList(doc: Record<string, unknown>): string[] {
  return Array.isArray(doc.trusted)
    ? doc.trusted.filter((p): p is string => typeof p === 'string')
    : []
}

function readTrusted(store: string): string[] {
  return trustedList(lerDocumento(store))
}

export async function mutateConsentStore(
  store: string,
  mutar: (atual: Record<string, unknown>) => Record<string, unknown> | undefined,
): Promise<void> {
  mkdirSync(dirname(store), { recursive: true, mode: 0o700 })
  await withFileLock(
    store,
    async () => {
      const proximo = mutar(lerDocumento(store))
      if (proximo === undefined) return
      await atomicWriteJson(store, proximo, { mode: 0o600, exclusive: true })
    },
    WAIT_BUDGET,
  )
}

const WAIT_BUDGET = { retries: 40, retryFactor: 1 } as const

export function isTrusted(dir: string, store: string = TRUST_STORE): boolean {
  return readTrusted(store).includes(canonical(dir))
}

export async function trustDir(dir: string, store: string = TRUST_STORE): Promise<void> {
  const norm = canonical(dir)
  if (readTrusted(store).includes(norm)) return

  await mutateConsentStore(store, (doc) => {
    const atual = trustedList(doc)
    if (atual.includes(norm)) return undefined
    return { ...doc, trusted: [...atual, norm] }
  })
}
