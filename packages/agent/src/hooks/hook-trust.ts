import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { TRUST_STORE, mutateConsentStore } from '../config/index.js'

import type { HookSpec } from './hooks-spec.js'
import { canonical as canonicalDir } from '../config/trust-store.js'

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

function readStore(path: string): StoreShape {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed === null || typeof parsed !== 'object') return {}
    return parsed as StoreShape
  } catch {
    return {}
  }
}

export function loadApprovedHooks(
  dir: string,
  path: string = TRUST_STORE,
): Map<string, ApprovedHook> {
  const store = readStore(path)
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
    const chave = canonicalDir(dir)
    const forDir = { ...(hooks[chave] ?? {}) }

    forDir[hookFingerprint(spec)] = {
      command: spec.command,
      event: spec.event,
      approvedAt: new Date().toISOString(),
    }

    return { ...doc, hooks: { ...hooks, [chave]: forDir } }
  })
}
