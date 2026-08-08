import { createHash } from 'node:crypto'
import { TRUST_STORE, mutateConsentStore } from '../config/index.js'

import type { HookSpec } from './hooks-spec.js'
import { canonical as canonicalDir, readDocument } from '../config/trust-store.js'

type HookTrustStatus = 'trusted' | 'untrusted' | 'modified'

export interface ApprovedHook {
  command: string
  event?: string
  approvedAt: string
}

export interface ClassifiedHook {
  spec: HookSpec
  fingerprint: string
  status: HookTrustStatus
  previousCommand?: string
}

export function hookFingerprint(spec: HookSpec): string {
  const projection = {
    command: spec.command,
    event: spec.event,
    matcher: spec.matcher ?? null,
    timeout_ms: spec.timeout_ms,
  }
  const canonical = JSON.stringify(projection, Object.keys(projection).sort())
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

export function classifyHooks(
  specs: readonly HookSpec[],
  approved: ReadonlyMap<string, ApprovedHook>,
  opts: { previousByEvent?: boolean } = {},
): ClassifiedHook[] {
  return specs.map((spec) => {
    const fingerprint = hookFingerprint(spec)
    if (approved.has(fingerprint)) {
      return { spec, fingerprint, status: 'trusted' as const }
    }
    if (opts.previousByEvent === true) {
      const currentFingerprints = new Set(specs.map(hookFingerprint))
      const orphanedSameEvent = [...approved.entries()].filter(
        ([fp, a]) => a.event === spec.event && !currentFingerprints.has(fp),
      )
      const newSameEvent = specs.filter(
        (other) => other.event === spec.event && !approved.has(hookFingerprint(other)),
      )
      if (orphanedSameEvent.length === 1 && newSameEvent.length === 1) {
        const previous = orphanedSameEvent[0]![1]
        return {
          spec,
          fingerprint,
          status: 'modified' as const,
          previousCommand: previous.command,
        }
      }
    }
    return { spec, fingerprint, status: 'untrusted' as const }
  })
}

interface StoreShape {
  trusted?: string[]
  hooks?: Record<string, Record<string, ApprovedHook>>
}

/**
 * B-019 — read through `readDocument`, which is the gate.
 *
 * This function used to open TRUST_STORE with a bare `readFileSync`. B-005 had added a permission
 * check to the OTHER reader of the same file, so directory trust was refused on a group-writable
 * store while the hook-approval set — which decides what reaches `spawn(cmd, { shell: true })` —
 * was read unchecked. The duplicate existed because the gate was module-private; it is exported now
 * for exactly this consumer.
 */
export function loadApprovedHooks(
  dir: string,
  path: string = TRUST_STORE,
): Map<string, ApprovedHook> {
  const store = readDocument(path) as StoreShape
  const forDir = store.hooks?.[canonicalDir(dir)]
  if (forDir === undefined) return new Map()
  return new Map(Object.entries(forDir))
}

export async function approveHook(
  dir: string,
  spec: HookSpec,
  path: string = TRUST_STORE,
): Promise<void> {
  await mutateConsentStore(path, (doc) => {
    const store = doc as StoreShape
    const hooks = store.hooks ?? {}
    const key = canonicalDir(dir)
    const forDir = { ...(hooks[key] ?? {}) }

    forDir[hookFingerprint(spec)] = {
      command: spec.command,
      event: spec.event,
      approvedAt: new Date().toISOString(),
    }

    return { ...doc, hooks: { ...hooks, [key]: forDir } }
  })
}
