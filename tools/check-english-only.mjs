#!/usr/bin/env node
/**
 * B-052 — fail when Portuguese re-enters the source.
 *
 * The project rule is that everything WRITTEN in the repository is English; only the conversation is
 * Portuguese. That was never enforced, so the two languages interleaved inside single functions —
 * `resolverGuardas` returned `protegidos`, `classificar` returned `MORTO` — and 92 user-facing
 * strings shipped in Portuguese.
 *
 * Two detectors, deliberately different in confidence:
 *
 *   1. ACCENTED CHARACTERS — near-zero false positives. English source has no `ç`/`ã`/`é`. This is
 *      the reliable half, and it catches prose (comments, strings) as well as identifiers.
 *   2. A CLOSED LIST of Portuguese words seen in this codebase — a heuristic. It cannot catch a
 *      Portuguese word nobody has used yet, and it deliberately excludes tokens that are also
 *      English (`no`, `error`, `format`, `total`, `final`) because a check that fires on correct
 *      code is a check people delete.
 *
 * Honest about the gap: detector 2 is a denylist, not a language model. A new Portuguese identifier
 * spelled without accents and absent from the list passes. Detector 1 remains the backstop, and most
 * Portuguese prose carries at least one accent.
 *
 * Usage: node tools/check-english-only.mjs [--quiet]
 * Exit 0 when clean, 1 when a violation is found.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN = ['packages']
const EXTS = new Set(['.ts', '.tsx'])

const ACCENTED = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/

/** Portuguese tokens measured in this repository. Extend when a new one is caught by hand. */
const PT_WORDS = [
  'atual', 'proximo', 'janela', 'protegidos', 'ehDiretorio', 'arquivo', 'arquivos', 'epoca',
  'abandonar', 'classificar', 'quantos', 'guardas', 'descartar', 'chave', 'mutar', 'listagem',
  'artefatos', 'documento', 'caminho', 'tentar', 'verificar', 'apagar', 'coletar', 'contagem',
  'tamanho', 'inicio', 'opcoes', 'selecionar', 'limpar', 'enviar', 'receber', 'texto', 'linha',
  'saida', 'entrada', 'consulta', 'resposta', 'pedido', 'montar', 'construir', 'calcular', 'obter',
  'remover', 'adicionar', 'plano', 'candidato', 'candidatos', 'segmento', 'aplicar', 'nenhum',
  'nenhuma', 'desfecho', 'folha', 'nivel', 'bruto', 'vistos', 'anterior', 'corpo', 'titulo',
  'manter', 'medida', 'antes', 'cortado', 'vazio', 'assinar', 'aprovar', 'reservado', 'aninhada',
  'esforco', 'profundidade', 'divergencia', 'precedencia', 'VIVO', 'MORTO', 'NAO_ACHOU',
  'INDETERMINADO',
  // Added after the guard reported "clean" on a file that still contained `ResultadoDFS`, `ACHOU`,
  // `pilha`, `achado`, `codificado` and `cwdAutoVerificado` — the documented denylist gap, observed.
  'pilha', 'achado', 'codificado', 'resultado', 'mantidos', 'planejar', 'planejou', 'candidato',
  'idsEmDisco', 'idsNoRegistry', 'cwdsVivos', 'totalPorForma', 'assertNuncaForma', 'FormaColetavel',
  'PlanoAll', 'CandidatoAll', 'ACHOU', 'TETO', 'FORMAS', 'coletavel', 'deletavel',
  // Added after `{hiddenBefore} mais antiga(s)` shipped in the backtrack overlay: an unaccented
  // Portuguese phrase in a user-facing string, invisible to both detectors.
  'mais', 'antiga', 'antigo', 'recente', 'semente', 'rotacionando', 'DepsDe', 'sementeDo',
]
const PT_RE = new RegExp(`\\b(?:${PT_WORDS.join('|')})[A-Za-z_]*`, 'g')

/**
 * Lines allowed to contain the patterns above, because their POINT is to name them. Keyed by
 * `path:line` so an allowance cannot silently widen to the whole file.
 */
const ALLOWED = new Set([
  // A regression test asserting an error message carries no Portuguese.
  'packages/agent/src/ask/ask-bridge.test.ts:76',
])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (EXTS.has(extname(p))) yield p
  }
}

const violations = []
for (const base of SCAN) {
  for (const file of walk(join(ROOT, base))) {
    const rel = relative(ROOT, file)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const at = `${rel}:${i + 1}`
        if (ALLOWED.has(at)) return
        if (ACCENTED.test(line)) {
          violations.push({ at, why: 'accented character', text: line.trim().slice(0, 100) })
          return
        }
        const words = line.match(PT_RE)
        if (words) {
          violations.push({ at, why: `Portuguese word: ${words[0]}`, text: line.trim().slice(0, 100) })
        }
      })
  }
}

if (violations.length === 0) {
  if (!process.argv.includes('--quiet')) console.log('english-only: clean')
  process.exit(0)
}

console.error(`english-only: ${String(violations.length)} violation(s)\n`)
for (const v of violations) console.error(`  ${v.at}  (${v.why})\n    ${v.text}`)
console.error(
  '\nEverything written in this repository is English; only the conversation is Portuguese.\n' +
    'If a match is a false positive, add its `path:line` to ALLOWED in this file with a reason.',
)
process.exit(1)
