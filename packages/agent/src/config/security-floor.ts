/**
 * B-006 — the two config keys that decide confinement do not follow plain last-wins.
 *
 * `sandbox_mode` and `approval_policy` were ordinary scalars, so `project` (precedence 30) and `env`
 * (50) both outranked the user's own file (20): a cloned repository could hand itself
 * `danger-full-access`, and the user's global setting simply lost.
 *
 * The codebase already made this argument once, for `hooks`, and recorded it — an environment
 * variable injecting hooks would be arbitrary code execution declared outside any reviewable file,
 * bypassing the accumulation that stops a project from displacing the user's global guard. The same
 * reasoning applies to these two keys and had not been applied.
 *
 * The floor is narrow on purpose. `project` and `env` may only HARDEN. `cli` may still loosen: that
 * is the operator typing an explicit flag for a single session, and the threat model here is a
 * repository or an inherited environment, not the person at the keyboard.
 */

/** Each vocabulary ordered from most confined to least. Index = permissiveness. */
export const MORE_PERMISSIVE = {
  sandbox_mode: ['read-only', 'workspace-write', 'danger-full-access'],
  approval_policy: ['untrusted', 'on-request', 'never'],
} as const

export type SecurityKey = keyof typeof MORE_PERMISSIVE

/** Layers that may only tighten the user's choice, in precedence order. */
const CANNOT_LOOSEN = ['project', 'profile', 'env'] as const

export interface LayeredValues {
  defaults?: string | undefined
  user?: string | undefined
  project?: string | undefined
  profile?: string | undefined
  env?: string | undefined
  cli?: string | undefined
}

function permissiveness(key: SecurityKey, value: string | undefined): number {
  if (value === undefined) return -1
  const i = (MORE_PERMISSIVE[key] as readonly string[]).indexOf(value)
  return i
}

/**
 * Resolve one security key across layers: last-wins, except that `project`/`profile`/`env` may never
 * choose something more permissive than what a lower layer already established.
 */
export function applySecurityFloor(key: SecurityKey, layers: LayeredValues): string | undefined {
  // The baseline the restricted layers must not exceed: whatever defaults/user settled on.
  let resolved = layers.user ?? layers.defaults
  let ceiling = permissiveness(key, resolved)

  for (const layer of CANNOT_LOOSEN) {
    const candidate = layers[layer]
    if (candidate === undefined) continue
    const level = permissiveness(key, candidate)
    if (level < 0) continue
    // Harden freely; loosen never. With no ceiling yet, the layer simply applies.
    if (ceiling < 0 || level <= ceiling) {
      resolved = candidate
      ceiling = level
    }
  }

  // The operator's explicit flag wins outright, in both directions.
  return layers.cli ?? resolved
}
