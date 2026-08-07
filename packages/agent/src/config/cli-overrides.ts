import { ConfigError, ENV_BY_KEY, type SchemaKey } from './config.js'

const SEGMENTOS_RESERVADOS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

function coagir(folha: string, bruto: string): unknown {
  return ENV_BY_KEY[folha as SchemaKey]?.coagir(bruto) ?? bruto
}

function requireUsablePath(par: string, path: readonly string[]): void {
  if (path.some((s) => s.trim().length === 0)) {
    throw new ConfigError(`-c ${par}: path de key com segmento vazio`)
  }
  const reservado = path.find((s) => SEGMENTOS_RESERVADOS.has(s))
  if (reservado !== undefined) {
    throw new ConfigError(
      `-c ${par}: \`${reservado}\` é um segmento reservado do protótipo de objeto e não pode ser ` +
        `key de configuração — escrevê-lo alteraria \`Object.prototype\` para o processo inteiro, ` +
        `por baixo da validação estrita do schema`,
    )
  }
}

function descerCriando(
  root: Record<string, unknown>,
  path: readonly string[],
  par: string,
): Record<string, unknown> {
  let no = root
  for (const segmento of path.slice(0, -1)) {
    const proximo = no[segmento]
    if (proximo === undefined) {
      const criado: Record<string, unknown> = {}
      no[segmento] = criado
      no = criado
    } else if (typeof proximo === 'object' && proximo !== null && !Array.isArray(proximo)) {
      no = proximo as Record<string, unknown>
    } else {
      throw new ConfigError(
        `-c ${par}: \`${segmento}\` já foi definida como valor nesta mesma line de comando`,
      )
    }
  }
  return no
}

export function cliOverridesLayer(pares: readonly string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const par of pares) {
    const corte = par.indexOf('=')
    if (corte < 0) {
      throw new ConfigError(
        `-c ${par}: esperado \`key=valor\` (ou \`key.aninhada=valor\`), sem o sinal de igual não há valor a aplicar`,
      )
    }
    const path = par.slice(0, corte).split('.')
    const bruto = par.slice(corte + 1)
    requireUsablePath(par, path)
    const no = descerCriando(root, path, par)
    const folha = path[path.length - 1]!
    const existente = no[folha]
    if (typeof existente === 'object' && existente !== null) {
      throw new ConfigError(
        `-c ${par}: \`${folha}\` já foi montada como ramo nesta mesma line de comando — ` +
          `sobrescrevê-la devolveria um objeto que não corresponde a nenhum dos dois pares escritos`,
      )
    }
    no[folha] = coagir(folha, bruto)
  }
  return root
}
