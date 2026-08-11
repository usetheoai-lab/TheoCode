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
  // B-019 — the directory is part of the answer. A 0600 file inside a directory others can write is
  // not private: the file can be replaced wholesale, and the replacement's mode is set by whoever
  // wrote it. Checking the file alone answers a narrower question than the one asked.
  //
  // The directory is held to WORLD-write only (0o002), not to the file's 0o022. Group-write on a
  // directory is the DEFAULT under umask 002 — a fresh `mkdir` yields 0775, and on a distro with
  // per-user private groups that group contains only the owner. Refusing it would reject the
  // ordinary configuration of most Linux desktops, and a gate that fires on the default is one
  // people disable. World-write is unambiguous: it is a real third party, and it is rare.
  //
  // The file keeps 0o022 because this code creates it 0600 itself, so group-write on it is
  // anomalous rather than inherited.
  assertNotWritableByOthers(dirname(store), 0o002, 'chmod 700')
  assertNotWritableByOthers(store, 0o022, 'chmod 600')
}

function assertNotWritableByOthers(target: string, forbidden: number, remedy: string): void {
  let mode: number
  try {
    mode = statSync(target).mode
  } catch {
    return
  }
  if ((mode & forbidden) !== 0) {
    throw new Error(
      `refusing to read ${target}: it is group- or world-writable (mode ` +
        `${(mode & 0o777).toString(8)}). It authorises directory trust and pre-approved hook ` +
        `commands, so anyone who can write it can run commands as you. Fix with: ${remedy} ` +
        `${target}`,
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

/**
 * The one gated reader of the consent store. Exported because it is a gate, and a gate that only
 * one of two consumers can reach is not one: `hook-trust.ts` kept a private, ungated copy of this
 * function precisely because this one was module-private (B-019).
 *
 * Throws when the store or its directory is writable by anyone else. A MISSING file is not an
 * error — a first run has no store, and that means "nothing is trusted yet".
 */
export function readDocument(store: string): Record<string, unknown> {
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
  return trustedList(readDocument(store))
}

export async function mutateConsentStore(
  store: string,
  mutate: (current: Record<string, unknown>) => Record<string, unknown> | undefined,
): Promise<void> {
  ensurePrivateDir(store)
  await withFileLock(
    store,
    async () => {
      const next = mutate(readDocument(store))
      if (next === undefined) return
      await atomicWriteJson(store, next, { mode: 0o600, exclusive: true })
    },
    WAIT_BUDGET,
  )
}

const WAIT_BUDGET = { retries: 40, retryFactor: 1 } as const

export function isTrusted(dir: string, store: string = TRUST_STORE): boolean {
  return readTrusted(store).includes(canonical(dir))
}

export async function trustDir(dir: string, store: string = TRUST_STORE): Promise<void> {
  // Repair before the early-exit read (B-019). This path is about to write anyway, and the repair
  // is this module's own remedy for the directory the SDK created without a mode — reading first
  // would let the new directory gate refuse the very state `ensurePrivateDir` exists to fix.
  ensurePrivateDir(store)

  const canonicalDir = canonical(dir)
  if (readTrusted(store).includes(canonicalDir)) return

  await mutateConsentStore(store, (doc) => {
    const current = trustedList(doc)
    if (current.includes(canonicalDir)) return undefined
    return { ...doc, trusted: [...current, canonicalDir] }
  })
}
