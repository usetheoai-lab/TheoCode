/**
 * The layer chain this product resolves configuration through, and the reporting that cites it.
 *
 * B-097 — the FOLD is `@theokit/sdk`'s: later layers win, `undefined` never erases, named keys
 * accumulate, and the declared order is verified rather than assumed. Those rules are identical in
 * every layered-config product. What is this product's, and stays here, is the chain itself: six
 * named layers with their precedences, `profile` among them because this product has profiles.
 */
import { TheokitAgentError } from '@theokit/agents'
import { foldLayers as fold, verifyLayerOrdering } from '@theokit/sdk'

class LayerError extends TheokitAgentError {
  override readonly name = 'LayerError'
}

export type Layer = 'defaults' | 'user' | 'project' | 'profile' | 'env' | 'cli'

export interface DeclaredLayer {
  readonly layer: Layer
  readonly precedence: number
}

export const LAYERS: readonly DeclaredLayer[] = Object.freeze([
  Object.freeze({ layer: 'defaults' as const, precedence: 10 }),
  Object.freeze({ layer: 'user' as const, precedence: 20 }),
  Object.freeze({ layer: 'project' as const, precedence: 30 }),
  Object.freeze({ layer: 'profile' as const, precedence: 40 }),
  Object.freeze({ layer: 'env' as const, precedence: 50 }),
  Object.freeze({ layer: 'cli' as const, precedence: 60 }),
])

// At module load, so a chain edited into an inconsistent state fails on import rather than on the
// first resolution — which would be somewhere far from the edit.
verifyLayerOrdering(LAYERS)

const PRECEDENCE_PER_LAYER: ReadonlyMap<string, number> = new Map(
  LAYERS.map((c) => [c.layer, c.precedence]),
)

function precedenceOf(layer: Layer): number {
  const p = PRECEDENCE_PER_LAYER.get(layer)
  if (p === undefined) throw new LayerError(`unknown layer: \`${layer}\``)
  return p
}

export interface LayerWithValues {
  readonly layer: Layer
  readonly values: Readonly<Record<string, unknown>>
}

export function foldLayers(
  entries: readonly LayerWithValues[],
  accumulatingKeys: readonly string[] = [],
): Record<string, unknown> {
  return fold(
    // The precedence is attached here rather than trusted from the array order: the caller passes
    // layers it assembled itself, and an assembly bug would otherwise invert precedence silently.
    entries.map((e) => ({ ...e, precedence: precedenceOf(e.layer) })),
    accumulatingKeys,
  )
}

export function measuredPrecedenceChain(descendingWinners: readonly string[]): {
  line: string
  divergence: string | null
} {
  const declaredDescendant = [...LAYERS].reverse().map((c) => c.layer)
  const measured = descendingWinners.join(' > ')
  const declared = declaredDescendant.join(' > ')
  if (measured !== declared) {
    const divergence =
      `the measured order (${measured || '(empty)'}) does not match the order declared in ` +
      `\`agents/config/layers.ts\` (${declared})`
    return { line: `**DIVERGENCE** — ${divergence}`, divergence }
  }
  return { line: [...declaredDescendant].reverse().join(' < '), divergence: null }
}
