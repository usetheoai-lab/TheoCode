import { atomicWriteJson, withFileLock } from '@theokit/agents/persistence'

import { chmodSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const TRUST_STORE = join(homedir(), '.theokit', 'trusted-dirs.json')

/**
 * B-005 — the one canonical form for a directory used as a consent key.
 *
 * Directory trust keyed on this; hook approvals keyed on the raw string. Two spellings of the same
 * path (a symlink, a `..` segment) were therefore the same directory for one decision and two for
 * the other. The divergence is fail-safe rather than fail-open — an approval under one spelling does
 * not leak to another — but a consent store where the same fact has two keys is one nobody can audit.
 */
export function canonical(dir: string): string {
  try {
    return realpathSync(dir)
  } catch {
    return resolve(dir) 
  }
}

/**
 * B-005 — refuse a store any other local user can write.
 *
 * This file decides which directories are trusted and which hook command lines are pre-approved, and
 * a hook is `spawn(cmd, { shell: true, detached: true })`. Reading a group/other-writable copy as
 * authoritative hands command execution to whoever can write it.
 *
 * A missing file is NOT an error: a first run has no store, and that means "nothing is trusted yet".
 */
function assertPrivate(store: string): void {
  let mode: number
  try {
    mode = statSync(store).mode
  } catch {
    return
  }
  if ((mode & 0o022) !== 0) {
    throw new Error(
      `refusing to read ${store}: it is group- or world-writable (mode ` +
        `${(mode & 0o777).toString(8)}). It authorises directory trust and pre-approved hook ` +
        'commands, so anyone who can write it can run commands as you. Fix with: chmod 600 ' +
        `${store}`,
    )
  }
}

/** Create the store's directory private, and repair it when it already exists. */
function ensurePrivateDir(store: string): void {
  const dir = dirname(store)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  // `mkdirSync({ mode })` is a no-op on an existing directory, and this one is SHARED with the SDK's
  // transcript root, which creates it without a mode. Whoever got there first set the permissions.
  try {
    if ((statSync(dir).mode & 0o077) !== 0) chmodSync(dir, 0o700)
  } catch {
    // A directory we cannot stat is one we are about to fail on anyway, loudly, at write time.
  }
}

function lerDocumento(store: string): Record<string, unknown> {
  assertPrivate(store)
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
  ensurePrivateDir(store)
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
