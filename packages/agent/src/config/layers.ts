import { TheokitAgentError } from '@theokit/agents'

export class LayerError extends TheokitAgentError {
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

export function verifyOrdering(layers: readonly DeclaredLayer[]): void {
  for (let i = 1; i < layers.length; i += 1) {
    const previous = layers[i - 1]!
    const current = layers[i]!
    if (current.precedence <= previous.precedence) {
      throw new LayerError(
        `layers out of order: \`${current.layer}\` (precedence ${current.precedence}) comes after ` +
          `\`${previous.layer}\` (precedence ${previous.precedence}) but does not outrank it`,
      )
    }
  }
}

verifyOrdering(LAYERS)

const PRECEDENCE_PER_LAYER: ReadonlyMap<string, number> = new Map(
  LAYERS.map((c) => [c.layer, c.precedence]),
)

export function precedenceOf(layer: Layer): number {
  const p = PRECEDENCE_PER_LAYER.get(layer)
  if (p === undefined) throw new LayerError(`camada desconhecida: \`${layer}\``)
  return p
}

export interface LayerWithValues {
  readonly layer: Layer
  readonly values: Readonly<Record<string, unknown>>
}

export function foldLayers(
  entries: readonly LayerWithValues[],
  acumulam: readonly string[] = [],
): Record<string, unknown> {
  verifyOrdering(entries.map((e) => ({ layer: e.layer, precedence: precedenceOf(e.layer) })))

  const acumulado = new Map<string, unknown[]>(acumulam.map((k) => [k, []]))
  const combinado: Record<string, unknown> = {}
  for (const { values } of entries) {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue
      const pilha = acumulado.get(key)
      if (pilha !== undefined && Array.isArray(value)) {
        pilha.push(...(value as unknown[]))
        combinado[key] = pilha
        continue
      }
      combinado[key] = value
    }
  }
  return combinado
}

export function measuredPrecedenceChain(vencedoresDescendentes: readonly string[]): {
  line: string
  divergence: string | null
} {
  const declaredDescendant = [...LAYERS].reverse().map((c) => c.layer)
  const measured = vencedoresDescendentes.join(' > ')
  const declared = declaredDescendant.join(' > ')
  if (measured !== declared) {
    const divergence =
      `the measured order (${measured || '(empty)'}) does not match the order declared in ` +
      `\`agents/config/layers.ts\` (${declared})`
    return { line: `**DIVERGENCE** — ${divergence}`, divergence }
  }
  return { line: [...declaredDescendant].reverse().join(' < '), divergence: null }
}
