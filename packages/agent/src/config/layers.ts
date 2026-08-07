import { TheokitAgentError } from '@theokit/agents'

export class LayerError extends TheokitAgentError {
  override readonly name = 'LayerError'
}

export type Layer = 'defaults' | 'user' | 'project' | 'profile' | 'env' | 'cli'

export interface DeclaredLayer {
  readonly layer: Layer
  readonly precedencia: number
}

export const LAYERS: readonly DeclaredLayer[] = Object.freeze([
  Object.freeze({ layer: 'defaults' as const, precedencia: 10 }),
  Object.freeze({ layer: 'user' as const, precedencia: 20 }),
  Object.freeze({ layer: 'project' as const, precedencia: 30 }),
  Object.freeze({ layer: 'profile' as const, precedencia: 40 }),
  Object.freeze({ layer: 'env' as const, precedencia: 50 }),
  Object.freeze({ layer: 'cli' as const, precedencia: 60 }),
])

export function verifyOrdering(layers: readonly DeclaredLayer[]): void {
  for (let i = 1; i < layers.length; i += 1) {
    const anterior = layers[i - 1]!
    const atual = layers[i]!
    if (atual.precedencia <= anterior.precedencia) {
      throw new LayerError(
        `camadas fora de ordem: \`${atual.layer}\` (precedência ${atual.precedencia}) vem depois de ` +
          `\`${anterior.layer}\` (precedência ${anterior.precedencia}), mas não a supera`,
      )
    }
  }
}

verifyOrdering(LAYERS)

const PRECEDENCE_PER_LAYER: ReadonlyMap<string, number> = new Map(
  LAYERS.map((c) => [c.layer, c.precedencia]),
)

export function precedenciaDe(layer: Layer): number {
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
  verifyOrdering(entries.map((e) => ({ layer: e.layer, precedencia: precedenciaDe(e.layer) })))

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
  divergencia: string | null
} {
  const declaredDescendant = [...LAYERS].reverse().map((c) => c.layer)
  const medida = vencedoresDescendentes.join(' > ')
  const declared = declaredDescendant.join(' > ')
  if (medida !== declared) {
    const divergencia =
      `a ordem medida (${medida || '(vazia)'}) não corresponde à ordem declarada em ` +
      `\`agents/config/layers.ts\` (${declared})`
    return { line: `**DIVERGÊNCIA** — ${divergencia}`, divergencia }
  }
  return { line: [...declaredDescendant].reverse().join(' < '), divergencia: null }
}
