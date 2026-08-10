#!/usr/bin/env node
/**
 * B-052 / B-058 — fail when Portuguese re-enters the source.
 *
 * The project rule is that everything WRITTEN in the repository is English; only the conversation is
 * Portuguese. This guard enforces it on `packages/**` sources.
 *
 * ## Why this file was rewritten
 *
 * The first version paired an accent regex with a CLOSED LIST of Portuguese words. Its own docstring
 * admitted the gap — "detector 2 is a denylist, not a language model" — and the gap was then measured
 * FOUR times: the list was extended after `ResultadoDFS`/`pilha`, after `mais antiga(s)`, after
 * `loginComMetodo`, and it still reported CLEAN while 70 Portuguese identifiers remained in
 * `packages/agent` (`THREAD_PADRAO`, `varrerMarkdownComGuardas`, `SEGMENTOS_RESERVADOS`, …).
 *
 * A denylist can only find words someone already thought of, so every new Portuguese identifier is
 * invisible by construction and each extension buys exactly one word. The failure mode is silent:
 * it reports success. This version inverts it — a word is flagged when it is in a PORTUGUESE
 * dictionary and absent from an ENGLISH one, so the unforeseen case is the one that fires.
 *
 * ## Method
 *
 * Lexicon-based language identification against dictionaries already installed on the system
 * (`/usr/share/dict`, `/usr/share/hunspell`) — no new dependency, per the parsimony ladder's
 * "reuse what is installed" rung. Portuguese entries are also indexed with accents stripped (NFD,
 * combining marks dropped) because source code writes `selecao` where the dictionary has `seleção`.
 *
 * Identifiers are split on camelCase / snake_case / SCREAMING_SNAKE and each part >= 3 chars is
 * classified. Strings and comments are stripped before the identifier scan and checked separately by
 * the accent detector, which needs no dictionary and has near-zero false positives.
 *
 * ## Honest limits
 *
 *   - It flags what is Portuguese-and-not-English. A word in NEITHER dictionary (`cwd`, `pty`, `dfs`)
 *     is not flagged — abbreviations are legitimate, and flagging them would make the check one people
 *     delete. An invented Portuguese-looking token can therefore still pass.
 *   - A handful of English technical abbreviations collide with real Portuguese words (`cli` = to
 *     click, `pre` = a prefix, `repo` = cabbage, `uri` = urine). They are listed in TECHNICAL below;
 *     that list is a genuine denylist, but a bounded and auditable one — 18 entries against ~866k
 *     Portuguese forms, and each addition weakens the check by exactly one word rather than being
 *     the sole thing keeping it working.
 *   - Without the dictionaries installed the lexicon detector cannot run. It says so and exits 1
 *     rather than reporting clean, because a guard that passes when it cannot check is the failure
 *     this rewrite exists to remove.
 *
 * Usage: node tools/check-english-only.mjs [--quiet] [--list-unknown]
 * Exit 0 when clean, 1 when a violation is found or the lexicons are unavailable.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const SCAN = ['packages', 'tools']
const EXTS = new Set(['.ts', '.tsx', '.mjs'])

/**
 * Files the scan skips, each for a reason that would otherwise make the check fire on correct
 * content.
 *
 * This guard and its tests NAME the language they detect — `KNOWN_PORTUGUESE` is a list of
 * Portuguese words, and the tests assert on `indice` and `padrao` by design. A detector that flags
 * its own vocabulary is unusable.
 *
 * `docs/` is not in SCAN for the same reason and is worth stating: a review reporting that
 * `THREAD_PADRAO` shipped has to write `THREAD_PADRAO`. Documentation about the removal necessarily
 * quotes what was removed.
 */
const SELF = new Set(['tools/check-english-only.mjs', 'tools/check-english-only.test.mjs'])

const ACCENTED = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/

/** Where the system keeps word lists. Missing entries are skipped; all missing is fatal. */
const LEXICONS = {
  en: ['/usr/share/dict/american-english', '/usr/share/dict/words', '/usr/share/hunspell/en_US.dic'],
  pt: ['/usr/share/dict/brazilian', '/usr/share/dict/portuguese', '/usr/share/hunspell/pt_BR.dic'],
}

/**
 * English technical vocabulary that collides with a Portuguese dictionary entry. Each one is a real
 * word in Portuguese, which is why the lexicon test alone cannot clear it.
 */
const TECHNICAL = new Set([
  'cli', // pt: "to click"
  'pre', // pt: prefix particle
  'repo', // pt: "cabbage"
  'uri', // pt: "urine"
  'acp', // agent client protocol
  'todo', // pt: "all" — here it is the English task marker (`TodoItem`)
  'num', // pt: contraction of "em um" — here it abbreviates "number" (`parseNum`)
  'proto', // pt: a prefix — here it is `__proto__`, the prototype-pollution guard
  'ino', // pt: "inn" — here it is `Stats.ino`, the POSIX inode number
  'https', // pt: conjugation of "hipar" in some lists — here it is the URL scheme
  'distro', // pt: a verb form — here it is the Linux-distribution abbreviation
  'eval', // present in pt_BR.dic — here it is the English evaluate/eval abbreviation
  'renormalize', // present in /usr/share/dict/portuguese — an English verb either way
  // Tool and protocol names that collide with a Portuguese dictionary entry. Measured against the
  // theokit repositories, where they accounted for ~19% of all matches.
  'vite', 'astro', 'cron', 'param', 'params', 'abi', 'goto', 'stringify', 'enum',
  // Syntax-highlighter language identifiers. Each is a Portuguese dictionary entry and each
  // appears in a language list, never as prose.
  'mdx', 'cpp', 'apl', 'lua', 'imba', 'vala', 'prisma', 'abap',
  // Other measured collisions across the theokit repositories.
  'topo', // `topoSort` — topological, not pt "top"
  'sao', 'paulo', // the IANA timezone `America/Sao_Paulo`
  'sms', 'btn', 'mdc', 'jina', 'rgb', 'intra',
  // English derived forms absent from en_US.dic (it ships without its .aff affix rules) and
  // present in pt_BR.dic. Measured against the theokit corpus; each is unambiguously English here.
  'subclasses', 'subclass', 'multimodal', 'responder', 'responders', 'transcode',
  // Abbreviations measured in the gateway/plugin repositories.
  'ipc', // inter-process communication
  'tpc', // "topic" in a session-id scheme
  'paras', // "paragraphs" in a chunker test
  'ses', 'saas', 'bps', 'cta', 'rhf', 'mui',
  // Terminal and image-format vocabulary measured in theokit-tui.
  'csi', // Control Sequence Introducer (ANSI/CSI-2026)
  'seps', // "separators" in a status-bar test
  'todos', // pt "all" — here the plural of the English TodoItem
  'sof', 'soi', 'uno',
  'mis', // the English prefix in "mis-splits" — wordParts breaks on the hyphen
  'ico', // the .ico file extension in a MIME map
  'ccc', // a CSS hex colour (#ccc) — three-letter hex runs read as words
  'gru', // the IATA code for Guarulhos airport, used in flight-search fixtures
  'facto', // the Latin in "de-facto"
  'wai', 'wcag', // WAI-ARIA and WCAG
  'dlg', // "dialog" in a test id
  'tri', // the English prefix in "tri-state" — wordParts breaks on the hyphen
  'mantissas', // the English plural of mantissa (the 1/2/5 nice-number ladder)
  'cmp', // "compare" in a sort comparator
  'cas', // compare-and-swap
  'xai', // the xAI provider
  'aip', // Google API Improvement Proposal (AIP-193)
  'metas', // regex metacharacters, plural of "meta"
  'ver', // SemVer, and `<ver>` in a path placeholder
  'scp', // secure copy
  'entra', // Microsoft Entra ID
  'pojo', // plain old JavaScript object
  'fsm', // finite state machine
  'mcd', // `McdFrontmatterSchema` — a transposition of `mdc`, not a word
  'bom', // byte order mark
  'tpm', // tokens per minute
  'iam', // AWS / GCP identity and access management
  'aci', // agent-computer interface
  'ecma', // ECMAScript
  'cnpj', // the Brazilian company registry id — same reason as cpf
  'noir', // a theme name shipped by @theokit/ui
  'correlator', // the tool-card correlator
  'crm', // customer relationship management
  'consolas', // the font, in a font stack
  'reviver', // the JSON.parse reviver argument
  'ans', // "answer", a test fixture string
  'cti', // a fragment of a `<function=…>` tag split across stream chunks
  'eln', // the grep flags -rEln
  'dlx', // pnpm dlx
  'xhtml', // the XHTML namespace in an SVG sanitizer fixture
  'mono', // monospace, in a font stack
  'vero', // `vero_id`, a cache-key field name
  'cpf', // the Brazilian taxpayer id — a proper noun, and a thing PII redaction must name
  'sdk', 'api', 'url', 'dir', 'tmp', 'src', 'min', 'max', 'doc', 'ref', 'dev', 'log',
])

/** `path:line` allowances — keyed by line so one cannot silently widen to a whole file. */
const ALLOWED = new Set([
  // A regression test asserting an error message carries no Portuguese.
  'packages/agent/src/ask/ask-bridge.test.ts:76',
])

/** Strip combining marks so `seleção` also indexes as `selecao`. */
const unaccent = (w) =>
  w.normalize('NFD').replace(/\p{Mn}/gu, '')

function loadLexicon(paths, alsoUnaccented) {
  const words = new Set()
  let loaded = 0
  for (const p of paths) {
    if (!existsSync(p)) continue
    loaded++
    for (const line of readFileSync(p, 'latin1').split('\n')) {
      // hunspell `.dic` lines are `word/FLAGS`; plain dict files are bare words.
      const w = (line.split('/')[0] ?? '').trim().toLowerCase()
      if (w.length < 3 || !/^[a-zà-ÿ]+$/.test(w)) continue
      words.add(w)
      if (alsoUnaccented) words.add(unaccent(w))
    }
  }
  return { words, loaded }
}

const EN = loadLexicon(LEXICONS.en, false)
const PT = loadLexicon(LEXICONS.pt, true)

if (EN.loaded === 0 || PT.loaded === 0) {
  console.error(
    'english-only: CANNOT CHECK — no system word lists found.\n' +
      `  english sources tried: ${LEXICONS.en.join(', ')}\n` +
      `  portuguese sources tried: ${LEXICONS.pt.join(', ')}\n` +
      '  install with: sudo apt-get install wamerican wbrazilian hunspell-pt-br\n' +
      'Exiting 1 rather than reporting clean: a guard that passes when it cannot check is worse\n' +
      'than no guard, because it is believed.',
  )
  process.exit(1)
}

/** Split an identifier into lowercase word parts: `varrerMarkdown` -> [varrer, markdown]. */
export function* wordParts(identifier) {
  // A git SHA is not a word. `50fafe2` splits to `fafe`, which is a Portuguese verb form, and a
  // changelog citing a commit would be reported as Portuguese prose. Hex runs adjacent to digits
  // are dropped before splitting.
  // A backslash escape is not a letter. `\n` in a string literal and `\b` in a regex source were
  // being split as `[^A-Za-z]` boundaries, leaving the escape letter glued to the next word:
  // `"\nno json here"` yielded `nno` and `/\bpa-/` yielded `bpa`, both Portuguese words.
  const withoutEscapes = identifier.replace(
    /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|.)/g,
    (_m, brace, u4, x2) => {
      // A numeric escape names a CHARACTER — decode it. Blanking it split `Bras\u00edlia` into
      // `Bras` + `lia`, manufacturing a Portuguese word out of a correctly spelled proper noun.
      const hex = brace ?? u4 ?? x2
      if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16))
      // Everything else (`\n`, `\t`, `\b`) is a control escape, not a letter: it separates words.
      return ' '
    },
  )
  // An opaque token is not a word. Generalizes the git-SHA case: any alphanumeric run of 20+ chars
  // containing a digit (base64 key blobs, OAuth client ids) is dropped whole, because splitting it
  // on case boundaries manufactures fragments — `MIIEvQIBADAN...` produced `mii`.
  const withoutBlobs = withoutEscapes.replace(
    /[A-Za-z0-9+/=]{20,}/g,
    (run) => (/\d/.test(run) ? ' ' : run),
  )
  // A UUID is one opaque identifier, not five words. The hex rule below requires a digit, so
  // all-letter groups slipped past it: `bebe`, `daca`, `feda` and `abda` are all valid hex AND
  // Portuguese, and 37 generated session filenames were reported because of it.
  const withoutUuids = withoutBlobs.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ' ',
  )
  const withoutHex = withoutUuids.replace(/\b[0-9a-f]*\d[0-9a-f]*\b/gi, ' ')
  // Strip diacritics BEFORE splitting. Without this, the split on `[^A-Za-z]` chops an accented
  // word in half: `façade` became `fa` + `ade`, and `ade` is a Portuguese word — so a correctly
  // spelled English noun was reported as Portuguese. Unaccenting also matches how the Portuguese
  // lexicon is indexed, so `seleção` still resolves to `selecao` and stays detectable.
  const flat = unaccent(withoutHex)
  for (const chunk of flat.split(/[^A-Za-z]+/)) {
    for (const w of chunk.match(/[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+/g) ?? []) {
      if (w.length >= 3) yield w.toLowerCase()
    }
  }
}

/**
 * Suffixes that end Portuguese words and do not end English ones. Applied ONLY to words absent from
 * BOTH lexicons, which is what makes them safe: an English word ending in `-ndo` ("commando",
 * "innuendo") is in the English lexicon and never reaches this test.
 *
 * This exists because the installed lexicons are `.dic` files without their `.aff` affix rules, so
 * derived forms are missing — `localização` is in no list on this machine, and `localizacao` was
 * therefore invisible to the lexicon test despite being named in the engagement scope. No hunspell
 * binary and no Portuguese aspell dictionary are installed to expand them properly.
 *
 * HEURISTIC, and labelled as such. Measured on this repository: 11 hits, 0 false positives
 * (`selecao`, `localizacao`, `instrucao`, `delegacao`, `continuacao`, `interrupcao`, `inspecao`,
 * `conducao`, `instancia`, `disponivel`, `intocaveis`) out of 949 words in neither lexicon.
 */
const PT_SUFFIX = /^.{3,}(?:cao|coes|acoes|mento|mentos|dade|dades|agem|agens|ncia|ncias|avel|ivel|aveis|iveis|ndo|ao|oes)$/

/**
 * Portuguese words that NO installed dictionary contains and NO suffix rule reaches, found by
 * reading all 189 entries of `--list-unknown` on 2026-08-09. Each one's accented form is absent
 * from `/usr/share/dict/*` and `/usr/share/hunspell/pt_BR.dic`, which is why the lexicon test
 * cannot see them.
 *
 * This IS a denylist, and the whole point of the 2026-08-09 rewrite was that a denylist cannot be
 * the ONLY detector. It is acceptable here for two reasons the original list did not have:
 * it is a SUPPLEMENT to two open-ended detectors rather than the sole one, and every entry was
 * MEASURED against a real occurrence rather than imagined. A word missing from all three
 * detectors is not a hole this list closes permanently — it is the residue, and the residue is
 * small and enumerated instead of unknown.
 *
 * Exact match only. `indice` (pt: índice) is Portuguese; `indices` is the English plural of index
 * and appears legitimately in `packages/agent/src/session/backtrack.ts` — a substring rule would
 * flag it.
 */
const KNOWN_PORTUGUESE = new Set([
  'cabecalho', 'cabecalhos', // cabeçalho — header
  'codigo', // código — code
  'espaco', // espaço — space
  'indice', // índice — index (NOT `indices`, the English plural)
  'resetar', // to reset — Portuguese verb form of an English loanword
  'rotulo', 'rotulos', // rótulo — label
])

/**
 * A word is Portuguese when a Portuguese lexicon has it and an English one does not, or — for words
 * neither lexicon knows — when it carries a Portuguese-only suffix.
 */
export const isPortuguese = (w) => {
  if (TECHNICAL.has(w) || EN.words.has(w)) return false
  return PT.words.has(w) || PT_SUFFIX.test(w) || KNOWN_PORTUGUESE.has(w)
}

/**
 * Portuguese words in a file's own NAME.
 *
 * Every other detector reads file contents, which is how `hooks-para-membro.ts` shipped and was
 * eventually found by a human reading the tree rather than by tooling. A path is written text under
 * the same English-only rule as prose.
 *
 * The extension is dropped before splitting so `ts`/`tsx`/`mjs` never enter the word stream — they
 * are below the 3-character floor today, which makes relying on that accidental.
 */
/**
 * Portuguese inside STRING LITERALS — the text that reaches a user.
 *
 * The accent detector misses unaccented prose, and the identifier scan strips strings before it
 * runs, so `'↻ continuando o goal…'` shipped to the timeline and a dozen error messages
 * (`maxSessions deve ser inteiro >= 1`, `APLICADO — N artefato(s) removido(s)`) sat in the product
 * while the guard printed `clean`.
 *
 * Comments are removed BEFORE this runs, for a measured reason: a JSDoc block legitimately quotes
 * Portuguese it is explaining — the old code `perfis = layer.profiles` in a regression test, and
 * the SDK's own `ListOptionsSemPaginacao` type name. Flagging a quotation of the defect makes the
 * check fire on correct code. The cost is stated rather than hidden: unaccented Portuguese PROSE
 * in a comment is caught by nothing here. It does not reach users, which is why it ranks below a
 * false positive that would get this detector deleted.
 *
 * Import/export specifiers are skipped — a Portuguese path is detector 4's job, not this one's.
 */
export function portugueseInStrings(line) {
  if (/^\s*(?:import|export)\s.*\sfrom\s/.test(line)) return []
  const found = []
  for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    for (const w of wordParts(m[2] ?? '')) if (isPortuguese(w)) found.push(w)
  }
  return found
}

/**
 * Portuguese PROSE inside comments.
 *
 * Comments were exempt until 2026-08-09, and the exemption was justified: a JSDoc block legitimately
 * QUOTES the Portuguese it explains — the old `perfis = layer.profiles` in a regression test, the
 * SDK's `ListOptionsSemPaginacao`, the rename table in `delegation-cap.test.ts`. Flagging a
 * quotation of the defect makes the check fire on correct code.
 *
 * The exemption was also wrong, and a probe proved it: a seven-line Portuguese comment sat in
 * `tools/build-cli.mjs` explaining why `proper-lockfile` stays external, and nothing could see it.
 *
 * The resolution is that every one of those legitimate citations is inside a BACKTICK CODE SPAN —
 * measured, all four of them. So the span is removed and the surrounding prose is judged. A comment
 * may quote Portuguese; it may not be written in it.
 */
export function portugueseInComments(line) {
  const m = /(?:^\s*\*(?!\/)|\/\/|\/\*)(.*)$/.exec(line)
  if (m === null) return []
  const prose = (m[1] ?? '').replace(/`[^`]*`/g, ' ')
  const found = []
  for (const w of wordParts(prose)) if (isPortuguese(w)) found.push(w)
  return found
}

export function portugueseWordsInFilename(path) {
  const base = path.split('/').pop() ?? ''
  const withoutExt = base.includes('.') ? base.slice(0, base.indexOf('.')) : base
  // Strip UUIDs BEFORE splitting on separators — the split would shatter them into groups first,
  // and `wordParts` would never see the shape. `bebe`, `daca`, `feda` and `abda` are valid hex
  // AND Portuguese, so 37 generated session filenames were reported on that basis alone.
  const withoutUuids = withoutExt.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    '-',
  )
  const found = []
  for (const part of withoutUuids.split(/[-_]+/)) {
    for (const w of wordParts(part)) if (isPortuguese(w)) found.push(w)
  }
  return found
}

/**
 * Blank out string literals and comments so the identifier scan sees only code. They are not ignored
 * — the accent detector reads the raw line, which is where Portuguese prose almost always shows up.
 */
function codeOnly(line) {
  return line
    .replace(/\/\/.*$/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (EXTS.has(extname(p))) yield p
  }
}

/**
 * CLI entry. Guarded so the module can be imported by its own test suite: before this, importing
 * it ran the whole scan and called `process.exit(1)`, which is why the guard had no tests.
 */
function main() {
  const violations = []
  const unknown = new Map()

  for (const base of SCAN) {
    const dir = join(ROOT, base)
    if (!existsSync(dir)) continue
    for (const file of walk(dir)) {
      const rel = relative(ROOT, file)
      if (SELF.has(rel)) continue

      // Detector 4 — the file's own NAME. Runs before contents because a Portuguese path is a
      // violation even in an otherwise clean file.
      for (const w of portugueseWordsInFilename(rel)) {
        violations.push({ at: rel, why: `Portuguese word "${w}" in filename`, text: rel })
      }

      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const at = `${rel}:${i + 1}`
          if (ALLOWED.has(at)) return

          if (ACCENTED.test(line)) {
            violations.push({ at, why: 'accented character', text: line.trim().slice(0, 100) })
            return
          }

          // Detector 6 — prose inside comments, with backtick code spans removed (see above).
        const inComment = portugueseInComments(line)
        if (inComment.length > 0) {
          violations.push({
            at,
            why: `Portuguese word "${inComment[0]}" in a comment`,
            text: line.trim().slice(0, 100),
          })
          return
        }

        // Detector 5 — string literals, with comments removed first (see portugueseInStrings).
        // A JSDoc continuation line (` * …`) is a comment too — without this, a backtick code
        // span quoting Portuguese inside a doc block reads as a string literal.
        const noComments = /^\s*\*(?!\/)/.test(line)
          ? ''
          : line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')
        const inString = portugueseInStrings(noComments)
        if (inString.length > 0) {
          violations.push({
            at,
            why: `Portuguese word "${inString[0]}" in a string literal`,
            text: line.trim().slice(0, 100),
          })
          return
        }

        for (const identifier of codeOnly(line).match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
            for (const w of wordParts(identifier)) {
              if (isPortuguese(w)) {
                violations.push({
                  at,
                  why: `Portuguese word "${w}" in \`${identifier}\``,
                  text: line.trim().slice(0, 100),
                })
                return
              }
              if (!EN.words.has(w) && !PT.words.has(w) && !TECHNICAL.has(w)) {
                unknown.set(w, (unknown.get(w) ?? 0) + 1)
              }
            }
          }
        })
    }
  }

  if (process.argv.includes('--list-unknown')) {
    // Neither-lexicon words. Mostly legitimate abbreviations, and the one place an invented
    // Portuguese-looking token could hide — printed on demand so a human can sweep it.
    console.error(`\nwords in neither lexicon (${String(unknown.size)}):`)
    for (const [w, n] of [...unknown].sort((a, b) => b[1] - a[1])) console.error(`  ${w} (${String(n)})`)
  }

  if (violations.length === 0) {
    if (!process.argv.includes('--quiet')) {
      console.log(
        `english-only: clean (${String(EN.words.size)} EN forms, ${String(PT.words.size)} PT forms)`,
      )
    }
    process.exit(0)
  }

  console.error(`english-only: ${String(violations.length)} violation(s)\n`)
  for (const v of violations) console.error(`  ${v.at}  (${v.why})\n    ${v.text}`)
  console.error(
    '\nEverything written in this repository is English; only the conversation is Portuguese.\n' +
      'If a match is a false positive, add its `path:line` to ALLOWED in this file with a reason,\n' +
      'or — when an English technical term collides with a Portuguese word — add it to TECHNICAL.',
  )
  process.exit(1)

}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
