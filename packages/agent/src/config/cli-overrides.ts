import { ConfigError, ENV_BY_KEY, type SchemaKey } from './config.js'

const SEGMENTOS_RESERVADOS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

function coagir(folha: string, bruto: string): unknown {
  return ENV_BY_KEY[folha as SchemaKey]?.coagir(bruto) ?? bruto
}

function requireUsablePath(pair: string, path: readonly string[]): void {
  if (path.some((s) => s.trim().length === 0)) {
    throw new ConfigError(`-c ${pair}: path de key com segment vazio`)
  }
  const reserved = path.find((s) => SEGMENTOS_RESERVADOS.has(s))
  if (reserved !== undefined) {
    throw new ConfigError(
      `-c ${pair}: \`${reserved}\` é um segment reserved do protótipo de objeto e não pode ser ` +
        `key de configuração — escrevê-lo alteraria \`Object.prototype\` para o processo inteiro, ` +
        `por baixo da validação estrita do schema`,
    )
  }
}

function descerCriando(
  root: Record<string, unknown>,
  path: readonly string[],
  pair: string,
): Record<string, unknown> {
  let node = root
  for (const segment of path.slice(0, -1)) {
    const next = node[segment]
    if (next === undefined) {
      const criado: Record<string, unknown> = {}
      node[segment] = criado
      node = criado
    } else if (typeof next === 'object' && next !== null && !Array.isArray(next)) {
      node = next as Record<string, unknown>
    } else {
      throw new ConfigError(
        `-c ${pair}: \`${segment}\` já foi definida como value nesta mesma line de comando`,
      )
    }
  }
  return node
}

export function cliOverridesLayer(pares: readonly string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const pair of pares) {
    const corte = pair.indexOf('=')
    if (corte < 0) {
      throw new ConfigError(
        `-c ${pair}: esperado \`key=value\` (ou \`key.aninhada=value\`), sem o sinal de igual não há value a apply`,
      )
    }
    const path = pair.slice(0, corte).split('.')
    const bruto = pair.slice(corte + 1)
    requireUsablePath(pair, path)
    const node = descerCriando(root, path, pair)
    const folha = path[path.length - 1]!
    const existente = node[folha]
    if (typeof existente === 'object' && existente !== null) {
      throw new ConfigError(
        `-c ${pair}: \`${folha}\` já foi montada como ramo nesta mesma line de comando — ` +
          `sobrescrevê-la devolveria um objeto que não corresponde a nenhum dos dois pares escritos`,
      )
    }
    node[folha] = coagir(folha, bruto)
  }
  return root
}
