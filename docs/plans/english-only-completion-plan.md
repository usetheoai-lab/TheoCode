# Plan: Complete the English-only rule across every package

> **Version 1.0** — The repository rule is that everything written here is English. Its guard is wired into `npm run lint`, and until 2026-08-09 it was a 96-word denylist that reported `clean` over 144 Portuguese identifiers. The guard has been rebuilt on dictionary lookup and `packages/agent` has been cleared, which leaves the lint **red**: 111 violations over 87 distinct identifiers in 37 files across `tui`, `cli` and `shared`. This plan drives that count to zero, closes the three detector gaps the rebuild exposed (filenames, unaccented prose inside string literals, words in neither lexicon), and adds the behaviour tests for the two modules whose renames are currently protected by `tsc` alone.

## Goal

> Enable `npm run lint` to exit 0 across all four packages by removing every Portuguese identifier, filename and user-facing string it detects, measured by `node tools/check-english-only.mjs` reporting **0 violations** with the filename and string-literal detectors enabled.

## Context

`tools/check-english-only.mjs` is wired into `npm run lint` (`package.json:21`), so a green lint has been read as *the English-only rule holds*. It did not hold. The guard's second detector was a closed list of 96 Portuguese words; a denylist matches only what someone already enumerated, so every unforeseen Portuguese identifier passed — and passed by **reporting success**.

The strongest evidence is in the git history of the files this plan touches. Commit `f3a9e26` (2026-08-08) is titled *"refactor(i18n): rename Portuguese identifiers to English (B-052)"*; `packages/tui/src/terminal-io/input-router.ts`, which that commit modified, still carries **15** violations today. Commit `006d773` (2026-08-08), *"refactor(i18n): translate Portuguese prose and guard against its return (B-052)"*, left `packages/cli/src/runtime/session-busy.ts` with **32**. Both commits closed their backlog item against a guard that could not see what remained.

On 2026-08-09 the guard was rebuilt on lexicon-based language identification (a word a Portuguese dictionary knows and an English one does not), and `packages/agent` was cleared — 58 identifiers plus the Portuguese filename `hooks-para-membro.ts`. The rebuild is what makes this plan possible and also what makes it urgent: the lint is red until the remaining three packages are done.

The rebuild exposed three gaps that this plan must close, or "0 violations" will mean less than it claims. They are enumerated in `## Objective` and each maps to a task.

## Baseline Context (deep review of current state)

### Files that will be touched

Full per-file counts are in `code-review-output/final_report.md`; the table lists every file with ≥ 2 violations plus the new files. Files with exactly 1 violation are handled by the same scripted pass in T2.1/T3.1 and are listed in `## Appendix A`.

| File | LoC today | Last commit (sha + date) | Why it exists today | Invariants to preserve |
|---|---|---|---|---|
| `packages/cli/src/runtime/session-busy.ts` | 84 | `006d773` (2026-08-08) | Detects a busy session and forks to a new id rather than interleaving two consumers | `consumirComForkSeOcupada` + `idDisponivelOuFork` are re-exported by `packages/cli/src/runtime/index.ts`; fork-on-contention behaviour must not change |
| `packages/tui/src/terminal-io/use-tui-keyboard.ts` | 100 | `2df6f0e` (2026-08-08) | Builds the keyboard capability object consumed by the input router | Field names form the contract with `input-router.ts` and `apply-key-action.ts` — all three rename together or none |
| `packages/tui/src/commands/goal.ts` | 273 | `6bd459c` (2026-08-08) | Goal-mode slash command: status/pause/clear/edit/resume verbs | `VERBOS_DE_GOAL` keys are the user-typed verb strings and MUST NOT change; only the map identifier renames |
| `packages/tui/src/terminal-io/apply-key-action.ts` | 47 | `f3a9e26` (2026-08-08) | Maps a resolved key action to the capability that executes it | Same capability contract as `use-tui-keyboard.ts` |
| `packages/tui/src/terminal-io/input-router.ts` | 115 | `f3a9e26` (2026-08-08) | Decides which handler a keypress reaches, from screen state | Same capability contract; routing precedence unchanged |
| `packages/tui/src/commands/interpret-command.ts` | — | — | Routes a typed slash command to its group handler | Group ordering in `GRUPOS` is precedence — order preserved |
| `packages/tui/src/commands/review.ts` | — | — | `/review` command: installs signal handlers, tears them down | Handler install/uninstall pairing must stay symmetric |
| `packages/cli/src/commands/run.ts` | — | — | `run` subcommand entrypoint; opens the session stream | Imports two symbols renamed in T1.1 |
| `packages/cli/src/runtime/goal-cancellation.ts` | — | — | Cancellation registry for goal mode; races shutdown against completion | Cancellation must still win over completion; no double-resolve |
| `packages/tui/src/agent-session/tui-session.ts` | — | — | Session facade for the TUI, holds pending attached images | `tomarImagens` is called from `composition-root.ts:92` |
| `packages/tui/src/rendering/timeline-memo.ts` | — | — | Collapsed-continuation placeholder row | Line 11 holds a **Portuguese user-facing string** — see T3.2 |
| `packages/shared/src/diagnostic-sink.ts` | 33 | `b0fbda1` (2026-08-07) | Installs a diagnostic sink for cross-package logging | Single exported installer; commit message itself is Portuguese |
| `tools/check-english-only.mjs` | 214 | `6044801` (2026-08-09) | The guard: lexicon + suffix + accent detectors | Must keep exiting non-zero when it cannot check |
| `packages/agent/src/delegation/roles.test.ts` (NEW) | 0 | — | (to be created) | — |
| `packages/agent/src/delegation/delegation-cap.test.ts` (NEW) | 0 | — | (to be created) | — |
| `packages/agent/src/goal/goal.test.ts` (NEW) | 0 | — | (to be created) | — |

### Current callers / dependents

Measured with `grep -rl --include='*.ts' --include='*.tsx' '\bSYMBOL\b' packages/`.

- **Symbol:** `consumirComForkSeOcupada` in `packages/cli/src/runtime/session-busy.ts:9`
  - **Callers (production):** `packages/cli/src/commands/run.ts:8`, `packages/cli/src/runtime/index.ts:12`
  - **Callers (tests):** none — this symbol has no test
  - **External:** no
- **Symbol:** `idDisponivelOuFork` in `packages/cli/src/runtime/session-busy.ts:81`
  - **Callers (production):** `packages/cli/src/commands/run.ts:48`, `packages/cli/src/runtime/index.ts:12`
  - **Callers (tests):** none
  - **External:** no
- **Symbol:** `tomarImagens` / `anexarImagens` in `packages/tui/src/agent-session/tui-session.ts:19-20`
  - **Callers (production):** `packages/tui/src/agent-session/composition-root.ts:92`, `packages/tui/src/commands/command-capabilities.ts:11`, `packages/tui/src/commands/interpret-command.ts:86`
  - **Callers (tests):** none
  - **External:** no
- **Symbol:** `hooksRevisados` in `packages/tui/src/consent/consent-state.ts:3`
  - **Callers (production):** `packages/tui/src/consent/use-consent.ts:25`, `packages/tui/src/components/InputSlot.tsx:70`
  - **Callers (tests):** none
  - **External:** no
- **Cross-package check:** all 13 exported/constant Portuguese identifiers were tested for cross-package reach. **None leave their own package** — verified by grepping each symbol across `packages/` and comparing the set of owning packages. This is what allows Phases 1–3 to run in parallel.

### Domain glossary

- **capability object** — the record of callbacks (`cancelarDemo`, `fecharDiff`, …) that `use-tui-keyboard.ts` builds and `apply-key-action.ts` invokes; its field names are a structural contract across three files.
- **fork-on-busy** — when a second consumer attaches to a session already being drained, `session-busy.ts` allocates a new session id instead of interleaving two readers.
- **structural chunk** — a stream event (`start`, `start-step`, `finish`) that carries protocol state rather than model output; `ESTRUTURAIS` holds the set.
- **verb** — the second token of a goal-mode slash command (`/goal pause`); the user-typed string, distinct from the handler that implements it.
- **unknown bucket** — words the guard finds in neither the English nor the Portuguese lexicon (949 today), reported by `--list-unknown`.
- **lexicon test** — a word is Portuguese when a Portuguese dictionary has it and an English dictionary does not.

### Architecture boundaries affected

Per `rules/architecture.md`, the packages layer as `shared` (leaf) ← `agent` ← {`tui`, `cli`}. This plan **crosses no boundary**: every rename is package-local (verified above), and no import direction changes. `tools/check-english-only.mjs` is build tooling and sits outside the layering entirely.

The only boundary-adjacent change is T4.1/T4.2, which adds test files inside `packages/agent` — inward of both surfaces, importing nothing new.

## Prior Art & Related Work

- **Internal — the completed sibling slice.** `packages/agent` was cleared on 2026-08-09 (`6044801`). The rename procedure that worked there — collision pre-check → longest-identifier-first replacement → `tsc` → tests — is reused verbatim in Phases 1–3 and is the reason those phases carry low risk.
- **Internal — the review that measured this.** `code-review-output/final_report.md` (2026-08-09), 82 findings, and the database at `code-review-output/code-review.db`. Per-file counts and the residual-gap list come from there.
- **Internal — the prior review's caveat.** `docs/reviews/2026-08-08-packages-review.md` recorded `credentials.ts` as a filename-only secret false positive; the same gate blocked this session twice, which motivated the content-based rewrite noted in `## Drawbacks & Risks`.
- **Patterns skills:** none exist in this repository (`ls .claude/skills/*-patterns/` returns nothing), so no registered Pattern is consumed or overridden.
- **Blueprints:** `.claude/knowledge-base/discoveries/blueprints/` is empty — no discovery cycle has run on this topic.
- **External:** lexicon-based language identification is a standard technique; this plan adopts no new library for it (see D1).

## Objective

- [ ] Every Portuguese identifier in `packages/cli` removed — 28 distinct, 10 files
- [ ] Every Portuguese identifier in `packages/tui` removed — 66 distinct, 28 files
- [ ] Every Portuguese identifier in `packages/shared` removed — 1 distinct, 1 file
- [ ] The guard detects Portuguese **filenames**, the gap `hooks-para-membro.ts` slipped through
- [ ] The guard detects unaccented Portuguese **inside string literals**, the gap `'↻ continuando o goal…'` sits in today
- [ ] The 949-word unknown bucket swept once by hand, closing the `efforto` class
- [ ] `packages/agent/src/delegation` and `packages/agent/src/goal` have behaviour tests

## ADRs

### D1 — Rename with a scripted word-boundary pass plus a collision pre-check, not a codemod library.
*Rationale:* the parsimony ladder (`rules/parsimony-ladder.md`, rung 4) says reuse what is installed before adding a dependency. `tsc` is already the authority on whether a rename is correct, and on `packages/agent` it caught three cross-package consumers the file list had missed. A regex pass plus `tsc --noEmit` plus 233 tests is a complete correctness argument at this scale (87 identifiers).
*Alternatives considered:* **ts-morph / jscodeshift** — rejected: adds a dependency to do what `tsc` already verifies, and an AST rename would still need the same human judgement on target names. **IDE rename-symbol** — rejected: not scriptable, not reviewable, and no record of what ran.
*Consequences:* enables a reproducible, reviewable pass; constrains us to identifiers with distinctive spellings, which is why the collision pre-check (D2) is not optional.

### D2 — Pre-check every target name against the file before replacing, and pick a distinct name on collision.
*Rationale:* on `packages/agent` seven target names already existed in their file. Four were prose inside strings and harmless; three were real identifiers where a blind replacement would have shadowed an unrelated symbol — `prioridade` → `priority` collided with the `f.priority` **field** in the same file. Silent shadowing typechecks cleanly and changes behaviour.
*Alternatives considered:* **rely on `tsc` to catch collisions** — rejected: shadowing a distinct symbol in an inner scope is legal TypeScript and produces no diagnostic. **Prefix every rename** (`ptPriority`) — rejected: mechanical, ugly, and defeats the point of readable English names.
*Consequences:* enables safe bulk renaming; costs one extra pass per file and some human naming judgement.

### D3 — Extend the existing guard with the filename and string-literal detectors rather than adding a second tool.
*Rationale:* `rules/parsimony-ladder.md` rung 1 and KISS. The guard already walks every file and already owns the lexicon, the TECHNICAL exclusion list and the ALLOWED map. A second tool would duplicate all four and give two exit codes for one rule.
*Alternatives considered:* **a separate `check-filenames.mjs`** — rejected: two entry points for one rule means one of them eventually is not wired into `npm run lint`, which is the failure mode this whole engagement is about. **An eslint rule** — rejected: eslint sees file contents, not the tree, so it cannot check filenames at all.
*Consequences:* enables one command and one exit code; grows a single file (must stay ≤ 500 LoC per `rules/architecture.md` — it is 214 today).

### D4 — Scan string literals with the lexicon, gated behind a measured false-positive rate.
*Rationale:* `packages/tui/src/rendering/timeline-memo.ts:11` ships `'↻ continuando o goal…'` to users. The accent detector misses it (no accents) and the identifier scan strips string literals before testing. A user-facing Portuguese string is the most visible possible violation of the rule, so leaving it undetected makes "0 violations" misleading.
*Alternatives considered:* **manual review of all strings** — rejected: not repeatable, and the next string regresses silently. **Accent detector only** — rejected: that is the status quo, and it is what let this string ship.
*Consequences:* enables catching user-facing regressions; risks false positives on English prose containing words the Portuguese lexicon also holds. T3.2 measures the rate before wiring it in, and the detector is only enabled if the rate is zero on the cleaned tree.

### D5 — One phase per package, each independently committable.
*Rationale:* the cross-package check proved no Portuguese identifier leaves its own package, so the phases have no ordering dependency. Separate commits give an atomic rollback per package and a reviewable diff; one 37-file commit is not reviewable.
*Alternatives considered:* **single sweep across all three** — rejected: no per-package rollback, and a reviewer cannot separate a `cli` naming judgement from a `tui` one. **One commit per file** — rejected: 37 commits of mechanical renames buries the two commits that carry real judgement.
*Consequences:* enables parallel execution and clean rollback; costs three lint runs instead of one.

### D6 — Test the two untested modules at their public entry points, behaviour-first.
*Rationale:* `rules/testing.md § 3` requires a behaviour test per business rule and forbids testing implementation. `delegation/` decides which tools a sub-agent inherits and how deep recursion may go — a security boundary. Its renames currently rest on `tsc`, which proves the code compiles, not that it behaves.
*Alternatives considered:* **snapshot tests** — rejected: they lock structure, not behaviour, and break on every refactor (`rules/testing.md § 6`). **Defer until after the renames** — rejected: the renames are exactly what needs covering, so the test must exist to have value.
*Consequences:* enables safe future change in `delegation/`; costs the most effort of any phase and is the one place this plan writes non-trivial new logic.

## Drawbacks & Risks

| Drawback / Risk | Severity | Mitigation | Owner |
|---|---|---|---|
| A rename silently shadows an existing symbol in an inner scope — legal TypeScript, no diagnostic | **High** | D2 collision pre-check per file before replacing; three distinct names already required on `packages/agent` | implementer |
| `packages/tui` renames touch a 3-file structural contract (`use-tui-keyboard` / `input-router` / `apply-key-action`); renaming one file alone breaks routing at runtime, not at compile time (structural typing) | **High** | T2.2 renames all three in one atomic step; `tsc` plus a keyboard-routing test asserted before and after | implementer |
| The string-literal detector (D4) false-positives on English prose, making the guard noisy enough that someone disables it | Medium | T3.2 measures the rate on the cleaned tree first and only wires it in at zero; TECHNICAL list absorbs known collisions | implementer |
| `VERBOS_DE_GOAL` map **keys** are user-typed command strings; renaming a key silently breaks `/goal pause` with no type error | Medium | Rename the identifier only, never the map keys; T2.3 asserts each verb still routes | implementer |
| `session-busy.ts` and `goal-cancellation.ts` carry async races; a rename that reorders nothing can still be committed alongside an accidental edit | Medium | Concurrency tests declared in T1.1/T1.2; diff reviewed for non-rename hunks | implementer |
| The plan adds 3 new test files to a package already at 26 — suite runtime grows | Low | Current suite is 7.5s for 233 tests; budget 10s | implementer |
| The same stop-validation secret-gate defect exists in 4 sibling repos and this plan fixes only TheoCode's | Low | Named in `## Unresolved Questions` Q3; not silently absorbed | Paulo |

## Unresolved Questions

- Q1 — **Should the guard also check commit messages?** `b0fbda1`'s message is Portuguese ("remove toda mencao a agent-builder"). The rule says everything *written* in the repository is English, and history is written. Adding a `commit-msg` hook is out of scope here (YAGNI — one observed instance), but the instance is real and the decision is Paulo's.
- Q2 — **What is the acceptable false-positive rate for the string-literal detector?** D4 assumes zero on the cleaned tree. If T3.2 measures non-zero, is the detector still wired in with an ALLOWED list, or deferred? Blocking for T3.2 only.
- Q3 — **Who fixes the stop-validation secret gate in the four sibling repos?** `agent-builder`, `theokit-plugins`, `theokit-sdk` and `theokit` all carry the name-only version that blocks `credentials.ts` and misses a hardcoded `sk-ant-…`. The hook is gitignored in each, so there may be an upstream template this plan cannot see.
- Q5 — **Should `hunspell-pt-br` become a documented developer prerequisite?** Installing it supplies the `.aff` affix rules whose absence is the root cause of `KNOWN_PORTUGUESE`. It would shrink that list toward zero but adds a system-level setup step for every contributor. Not taken here.
- Q4 — **RESOLVED.** `packages/tui/src/terminal-io/` has one test (`stderr-guard.test.ts`, B-039) and it covers the stderr diagnostic channel, not key routing. T2.1 must write the routing anchor; the ~40-minute estimate stands.
- Q4 — ~~Does `packages/tui` have a keyboard-routing test to anchor T2.2?~~ If none exists, T2.2 must write one first, which is a real cost this plan estimates at ~40 minutes and has not confirmed.

## Dependency Graph

```
Phase 0 (guard gaps: filename detector)
   │
   ├──────────────┬──────────────┬──────────────┐
   ▼              ▼              ▼              │
Phase 1 (cli)  Phase 2 (tui)  Phase 3 (shared)  │   ← parallel: no shared identifier
   │              │              │              │
   └──────────────┴──────────────┘              │
                  │                             │
                  ▼                             │
        Phase 3.2 (string-literal detector) ◀───┘   ← needs a clean tree to measure FP rate
                  │
                  ▼
        Phase 4 (tests: delegation, goal)  ← independent of 1-3; may start any time
                  │
                  ▼
        Phase 5 (integration validation)
```

Phase 0 blocks nothing functionally but runs first so the filename gap is closed before the packages are declared clean. Phases 1–3 are parallel (D5). Phase 3.2 is sequenced **after** 1–3 because its false-positive measurement is only meaningful on a tree with no remaining Portuguese. Phase 4 is independent and can run at any point.

---

## Phase 0: Close the filename gap in the guard

**Objective:** make the guard detect a Portuguese filename, the one gap in this engagement found by human reading rather than by tooling.

### T0.1 — Add a filename detector to `check-english-only.mjs`

#### Objective
Flag any scanned path whose basename contains a Portuguese word, using the lexicon test already in the file.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** extends `walk()`'s consumer so each file's basename is split on `-`/`_`/`.` and run through the existing `isPortuguese()` predicate, emitting a violation with the path and the offending word.

**Why it is necessary now:** `packages/agent/src/delegation/hooks-para-membro.ts` was found by reading the tree, not by any detector — every detector reads file *contents*. It is recorded as a LOW finding in `code-review-output/code-review.db` and in `code-review-output/final_report.md` § Residual gaps. Doing it in Phase 0, before the packages are cleared, means the "0 violations" claimed at the end of Phase 3 actually covers paths. Per D3 it lands in the existing guard rather than a second tool.

#### Evidence
- `code-review-output/final_report.md § Residual gaps` — "Filenames are unguarded… A second Portuguese filename would not be caught."
- `git log --diff-filter=R` shows `hooks-para-membro.ts` → `hooks-for-member.ts` renamed in `6044801`, by hand.
- `tools/check-english-only.mjs:150` — `walk()` yields paths; the basename is available and currently unused.

#### Files to edit
```
tools/check-english-only.mjs — add basename scan inside the per-file loop
tools/check-english-only.test.mjs — RED tests added first (NEW)
```

#### Deep file dependency analysis
- `tools/check-english-only.mjs` is build tooling invoked by `package.json:21` (`npm run lint`) and `package.json:24` (`lint:english`). Nothing imports it; it has no callers in `packages/`. Changing it cannot break the product build, only the lint gate.
- The new test file is the guard's **first** test. `vitest.config.ts` includes only `packages/*/src/**/*.test.{ts,tsx}`, so a test under `tools/` is **not** picked up — T0.1 must extend the `include` glob, or place the test at `packages/shared/src/...`. Chosen: extend the glob (the tool is repo-level, not package-level).

#### Deep Dives
- Basename split: `hooks-para-membro.ts` → drop the extension → split on `[-_.]` → `["hooks","para","membro"]` → `para` and `membro` both hit the lexicon test.
- Invariant: extensions must be dropped before the split, or `ts`/`tsx`/`mjs` enter the word stream. They are < 3 chars and already filtered by the `length >= 3` rule, but relying on that is accidental — drop explicitly.
- Edge case: a path component like `pt-br` in a fixture directory would false-positive. No such path exists today (`find packages -path '*pt*'` returns nothing); if one appears, the ALLOWED map handles it.
- Edge case: `index.ts`, `main.tsx` — `index` and `main` are English lexicon words, no hit.

#### Pseudo-code / Signatures
```pseudocode
function portugueseWordsInFilename(path: string): string[]
  base = basename(path) minus its extension
  parts = base.split(/[-_.]+/)
  return parts.flatMap(wordParts).filter(isPortuguese)

# Example
input:  "packages/agent/src/delegation/hooks-para-membro.ts"
output: ["para", "membro"]
input:  "packages/tui/src/terminal-io/input-router.ts"
output: []
```

#### Tasks
1. Add `portugueseWordsInFilename(path)` next to `isPortuguese`.
2. Call it once per file inside the scan loop, before reading contents.
3. Emit a violation shaped like the others: path, reason `Portuguese word "X" in filename`.
4. Extend `vitest.config.ts` `include` to pick up `tools/**/*.test.mjs`.
5. Write the RED tests first (below).

#### TDD
```
RED:     test_a_portuguese_filename_is_flagged() — portugueseWordsInFilename('a/hooks-para-membro.ts') returns ["para","membro"]
RED:     test_an_english_filename_is_not_flagged() — 'a/input-router.ts' returns [] (ANTI-VACUITY: flagging everything would satisfy the first test)
RED:     test_the_extension_is_not_treated_as_a_word() — 'a/instrucao.ts' flags "instrucao" and never "ts"
GREEN:   Implement portugueseWordsInFilename and wire it into the scan loop
REFACTOR: Extract the shared word-splitting so filename and content scans use one implementation (DRY)
VERIFY:  npx vitest run tools/check-english-only.test.mjs
```

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- [ ] `node tools/check-english-only.mjs` flags a file named with a Portuguese word
- [ ] It does not flag any of the 98 current `packages/agent` filenames
- [ ] Pass: lint — `npx eslint tools/` zero warnings
- [ ] Pass: size — `tools/check-english-only.mjs` ≤ 500 lines (214 today)

#### DoD
- [ ] Three RED tests written and failing before implementation
- [ ] `npm test` green
- [ ] `npx tsc --noEmit` clean
- [ ] CHANGELOG `[Unreleased] § Added` updated

---

## Phase 1: `packages/cli` — 28 identifiers, 10 files

**Objective:** drive the `cli` violation count to zero.

### T1.1 — Rename the fork-on-busy session module

#### Objective
Rename the 15 Portuguese identifiers across `session-busy.ts` and its two importers.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** renames `consumirComForkSeOcupada` → `consumeWithForkIfBusy`, `idDisponivelOuFork` → `availableIdOrFork`, `ResultadoDaPassagem` → `PassResult`, `ESTRUTURAIS` → `STRUCTURAL`, `ehEstrutural` → `isStructural`, plus 8 locals, and updates the two importers.

**Why it is necessary now:** this is the single heaviest file in the repository for this rule (13 identifiers, 32 line-level violations) and its last commit — `006d773`, *"translate Portuguese prose and guard against its return"* — declared exactly this work done. It is also the only `cli` file with exported symbols crossing a module boundary (`runtime/index.ts:12`), so it must land before or with `run.ts`. Per D2 the collision pre-check runs first.

#### Evidence
- `packages/cli/src/runtime/session-busy.ts:9` — `export async function consumirComForkSeOcupada(`
- `packages/cli/src/runtime/session-busy.ts:33` — `const ESTRUTURAIS = new Set(['start', 'start-step', 'finish', …`
- `git log -1 006d773` — "refactor(i18n): translate Portuguese prose and guard against its return (B-052)"
- `packages/cli/src/runtime/index.ts:12` and `packages/cli/src/commands/run.ts:8` — the two importers

#### Files to edit
```
packages/cli/src/runtime/session-busy.ts — 13 identifiers renamed
packages/cli/src/runtime/index.ts — re-export names updated
packages/cli/src/commands/run.ts — import + 3 local identifiers renamed
packages/cli/src/runtime/session-busy.test.ts — RED test added first (NEW)
```

#### Deep file dependency analysis
- `session-busy.ts` (84 LoC, `006d773`) implements fork-on-busy. It has **no test today** — the rename would otherwise be protected by `tsc` alone, which is why T1.1 writes one first.
- `runtime/index.ts:12` re-exports both public symbols; renaming without updating it is a compile error, so `tsc` covers this edge.
- `commands/run.ts` consumes both and additionally holds `abrirStream` and `sair`, renamed in the same pass.

#### Deep Dives
- Invariant (from Baseline Context): fork-on-contention behaviour must not change. The RED test pins it: two consumers attaching to one session must yield two distinct ids.
- `ESTRUTURAIS` holds protocol event names as **string values** — the set contents are wire protocol and MUST NOT change; only the identifier renames.
- Edge case: `emitir?: boolean` is an optional options field. Renaming a field of an inline object type is structural — every construction site must change together. Only one exists (`session-busy.ts:38`), confirmed by grep.

#### Tasks
1. Write the RED tests (below) against the current Portuguese names so they fail for the right reason.
2. Run the D2 collision pre-check over the three files.
3. Apply the rename map, longest identifier first.
4. `npx tsc --noEmit`; fix any importer the file list missed.
5. `npm test`.

#### TDD
```
RED:     test_a_second_consumer_forks_to_a_new_session_id() — two attaches to one id yield two distinct ids
RED:     test_a_single_consumer_keeps_its_session_id() — ANTI-VACUITY: always forking would satisfy the first test
RED:     test_structural_chunks_are_not_forwarded_to_the_consumer() — 'start'/'finish' are withheld, model output is not
GREEN:   Apply the renames; all three tests stay green
REFACTOR: None expected — this is a rename
VERIFY:  npx vitest run packages/cli/src/runtime/session-busy.test.ts
```

#### Concurrency tests
`session-busy.ts` races two async consumers over one session id — a concurrency signal, so this subsection is mandatory.
Happens-before observation: start two consumeWithForkIfBusy calls against the same
  initial id, await both with Promise.all, assert the two resolved ids are distinct
  and that exactly one equals the initial id (no Lost Update on the id allocation).
Cancellation: abandon the first consumer mid-stream; assert the second still resolves
  rather than deadlocking on a never-released busy flag.


#### Acceptance Criteria
- [ ] `node tools/check-english-only.mjs` reports 0 violations for `packages/cli/src/runtime/session-busy.ts`
- [ ] `ESTRUTURAIS` string values unchanged (diff shows identifier rename only)
- [ ] Pass: lint — `npx eslint packages/cli` zero warnings
- [ ] Pass: size — every changed file ≤ 500 lines
- [ ] Pass: coverage — the three new tests cover fork, no-fork and structural-filter paths

#### DoD
- [ ] RED tests failed before the rename, pass after
- [ ] `npm test` green · `npx tsc --noEmit` clean
- [ ] Diff contains no non-rename hunk

### T1.2 — Rename the remaining `cli` identifiers

#### Objective
Clear the other 12 identifiers across 6 `cli` files.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** renames `RegistradorDeCleanup` → `CleanupRegistrar`, `encerrado` → `shutdown`, `jaEncerrou` → `alreadyShutDown`, `desistir` → `giveUp`, `ResultadoDoGoal` → `GoalResult`, `SinalDeUpdateGoal` → `GoalUpdateSignal`, `relatarDesfechoDoGoal` → `reportGoalOutcome`, `MODO_PARA_POLITICA` → `MODE_TO_POLICY`, `overridesPresentes` → `presentOverrides`, `APELIDOS_DE_USAGE` → `USAGE_ALIASES`, `soberano` → `sovereign`, `verbo` → `verb`.

**Why it is necessary now:** these are the balance of `packages/cli`. They are separated from T1.1 because T1.1 carries the module's only concurrency invariant and its only cross-module exports, and mixing them would make the risky diff unreviewable. Per D5 both land in one `cli` commit.

#### Evidence
- `packages/cli/src/runtime/goal-cancellation.ts:2,31,34,44` — 4 identifiers
- `packages/cli/src/commands/goal.ts:14,15,72` — 3 identifiers
- `packages/cli/src/runtime/args.ts:114,158` — 2 identifiers
- `packages/cli/src/runtime/events.ts:25`, `project-env.ts:24`, `commands/sessions.ts:37` — 1 each

#### Files to edit
```
packages/cli/src/runtime/goal-cancellation.ts — 4 identifiers
packages/cli/src/commands/goal.ts — 3 identifiers
packages/cli/src/runtime/args.ts — 2 identifiers
packages/cli/src/runtime/events.ts — 1 identifier
packages/cli/src/runtime/project-env.ts — 1 identifier
packages/cli/src/commands/sessions.ts — 1 identifier
```

#### Deep file dependency analysis
- `args.ts` already has a test (`args.test.ts`, 20 flag cases) — the strongest existing anchor in `cli`. `MODO_PARA_POLITICA` maps a CLI `--sandbox` value to a policy string; its **keys and values** are the user-facing contract and MUST NOT change.
- `goal-cancellation.ts` races a shutdown promise against completion; see Concurrency tests.
- `sessions.ts:37` `verbo` is a local holding `'would remove'`/`'removed'` — output strings unchanged.

#### Deep Dives
- Invariant: `MODO_PARA_POLITICA` keys are parsed from `--sandbox`; `args.test.ts` line 126 exercises `['--sandbox','read-only']` and will fail if a key changes. That existing test is the guard for this task.
- Edge case: `encerrado`/`jaEncerrou` are a promise plus its idempotence flag. Renaming both is safe; renaming one and not the other compiles and breaks the double-resolve guard — hence renaming as one atomic map.

#### Tasks
1. Run the D2 collision pre-check across all six files.
2. Apply the rename map.
3. `npx tsc --noEmit` and `npm test` — `args.test.ts` is the anchor.

#### TDD
```
RED:     None new — args.test.ts (20 flag cases) already covers the only user-facing
         contract in this task and MUST stay green. Adding a test that asserts a
         rename happened would test the implementation, not behaviour (rules/testing.md § 6).
GREEN:   Apply the renames
REFACTOR: None expected
VERIFY:  npx vitest run packages/cli/src/runtime/args.test.ts && npm test
```

#### Concurrency tests
`goal-cancellation.ts` races a cancellation promise against goal completion — concurrency signal present.
Cancellation propagation: register two cleanups, trigger shutdown once, assert both
  ran exactly once (`jaEncerrou`/`alreadyShutDown` idempotence holds under a double
  trigger). Assert a cleanup registered AFTER shutdown still runs or is refused
  explicitly — never silently dropped.


#### Acceptance Criteria
- [ ] `node tools/check-english-only.mjs` reports **0** violations for `packages/cli`
- [ ] `args.test.ts` 20/20 green — no CLI flag contract changed
- [ ] Pass: lint — `npx eslint packages/cli` zero warnings
- [ ] Pass: size — every changed file ≤ 500 lines

#### DoD
- [ ] `npm test` green · `npx tsc --noEmit` clean
- [ ] CHANGELOG `[Unreleased] § Changed` updated

---

## Phase 2: `packages/tui` — 66 identifiers, 28 files

**Objective:** drive the `tui` violation count to zero.

### T2.1 — Rename the keyboard capability contract atomically

#### Objective
Rename the 14 identifiers (27 occurrences) spanning `use-tui-keyboard.ts`, `input-router.ts` and `apply-key-action.ts` in one step.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** renames the capability fields (`emDemoInterativa` → `inDemoInput`, `modo` → `mode`, `mostrandoUso` → `showingUsage`, `mostrandoDiff` → `showingDiff`, `mostrandoAjuda` → `showingHelp`, `goalAtivo` → `goalActive`, `transmitindo` → `streaming`, `cancelarDemo` → `cancelDemo`, `fecharDiff` → `closeDiff`, `fecharUso` → `closeUsage`, `fecharAjuda` → `closeHelp`, `pausarGoal` → `pauseGoal`, `sair` → `exit`, `EXECUTORES` → `EXECUTORS`) across all three files simultaneously.

**Why it is necessary now:** these three files share a **structural** contract — TypeScript matches the capability object by shape, not by name. Renaming a field in one file and not the others produces an object that no longer satisfies the interface, and while `tsc` catches most of that, a partially-renamed optional field can typecheck and route nothing at runtime. This is the highest-severity risk in `## Drawbacks & Risks`. `f3a9e26` — *"rename Portuguese identifiers to English"* — touched two of these three files and left 22 identifiers behind.

#### Evidence
- `packages/tui/src/terminal-io/use-tui-keyboard.ts:40-48,79-97` — 13 identifiers
- `packages/tui/src/terminal-io/input-router.ts:7-15` — 7 identifiers, all `readonly` interface fields
- `packages/tui/src/terminal-io/apply-key-action.ts:7-21` — 7 identifiers, the mirror of the same contract
- `git log -1 f3a9e26` — the commit that claimed this file set was done
- `use-tui-keyboard.ts:40` already reads `emDemoInterativa: inDemoInput,` — the English name exists on the right-hand side, so the target names are already established in the codebase

#### Files to edit
```
packages/tui/src/terminal-io/use-tui-keyboard.ts — 13 identifiers
packages/tui/src/terminal-io/input-router.ts — 7 interface fields
packages/tui/src/terminal-io/apply-key-action.ts — 7 fields + `EXECUTORES`
packages/tui/src/terminal-io/input-router.test.ts — RED test added first (NEW, see Q4)
```

#### Deep file dependency analysis
- All three files were last touched by `f3a9e26`/`2df6f0e` (2026-08-08). None has a test today — confirmed by `find packages/tui/src/terminal-io -name '*.test.ts'`, which is why the RED test is written first (Q4 flags that this may not exist).
- The capability object is constructed in `use-tui-keyboard.ts` and consumed in `apply-key-action.ts` via `EXECUTORES`, keyed by `KeyAction['kind']`. The keys are action kinds, not Portuguese — unchanged.

#### Deep Dives
- Invariant: routing precedence in `input-router.ts` is decided by the order of the boolean checks (`mostrandoAjuda` before `mostrandoDiff` before `modo`). Renaming must not reorder them; the diff is asserted to contain no line reordering.
- Edge case: `sair` → `exit` — `exit` is a global in Node typings. As a **field name** on an interface this is safe; as a bare local it would shadow. `apply-key-action.ts:18` declares it `readonly sair: () => void` (a field) — safe. Verify with the D2 pre-check regardless.
- Edge case: `modo` → `mode` — `screen.mode` already exists on the right-hand side at `use-tui-keyboard.ts:43`, so after the rename the line reads `mode: screen.mode`. Correct, not a collision.

#### Pseudo-code / Signatures
```pseudocode
interface KeyCapabilities            # input-router.ts, after rename
  readonly inDemoInput: boolean
  readonly mode: string
  readonly showingUsage: boolean
  readonly showingDiff: boolean
  readonly showingHelp: boolean
  readonly goalActive: boolean
  readonly streaming: boolean

# Example — precedence must not change
input:  { showingHelp: true, showingDiff: true, mode: 'chat' }
output: routes to closeHelp   (help wins over diff, as today)
```

#### Tasks
1. Write the RED routing test against current behaviour (Portuguese names) so it fails only if routing changes.
2. Run the D2 collision pre-check over the three files, paying attention to `exit`.
3. Apply the rename map to all three files in ONE pass.
4. `npx tsc --noEmit`; `npm test`.
5. Diff-review for reordered lines.

#### TDD
```
RED:     test_help_overlay_takes_precedence_over_diff() — both open, help closes first
RED:     test_a_keypress_in_demo_input_is_not_routed_to_a_command() — demo input swallows keys
RED:     test_a_plain_keypress_still_reaches_the_composer() — ANTI-VACUITY: swallowing
         everything would satisfy the two tests above
GREEN:   Apply the three-file rename; all tests stay green
REFACTOR: None expected — rename only
VERIFY:  npx vitest run packages/tui/src/terminal-io/
```

#### Concurrency tests
(none — single-threaded)
Keyboard routing is a synchronous pure decision over a state snapshot; no shared mutable state, no async.

#### Acceptance Criteria
- [ ] `node tools/check-english-only.mjs` reports 0 violations for `packages/tui/src/terminal-io/{use-tui-keyboard,input-router,apply-key-action}.ts`
- [ ] The three RED tests pass before and after the rename
- [ ] Diff contains no line reordering in `input-router.ts`
- [ ] Pass: lint / size / complexity as in T1.1

#### DoD
- [ ] `npm test` green · `npx tsc --noEmit` clean

### T2.2 — Rename the goal-mode command verbs

#### Objective
Clear the 9 identifiers in `packages/tui/src/commands/goal.ts` without touching the user-typed verb strings.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** renames `conduzirGoal` → `driveGoal`, `ContextoDeVerbo` → `VerbContext`, `verboStatus`/`verboPause`/`verboClear`/`verboEdit`/`verboResume` → `verbStatus`/`verbPause`/…, `VERBOS_DE_GOAL` → `GOAL_VERBS`, `verbo` → `verb`.

**Why it is necessary now:** `VERBOS_DE_GOAL` is a `ReadonlyMap` whose **keys** are the strings a user types after `/goal`. Renaming the map identifier is safe; renaming a key silently breaks the command with no type error. This is the second Medium risk in `## Drawbacks & Risks` and needs its own task so the diff can be checked key-by-key.

#### Evidence
- `packages/tui/src/commands/goal.ts:246` — `const VERBOS_DE_GOAL: ReadonlyMap<string, (ctx: ContextoDeVerbo…`
- `packages/tui/src/commands/goal.ts:260` — `const verbo = VERBOS_DE_GOAL.get(arg)` — `arg` is user input
- File is 273 LoC (`6bd459c`), the largest in this phase

#### Files to edit
```
packages/tui/src/commands/goal.ts — 9 identifiers, zero map keys
packages/tui/src/commands/goal.test.ts — RED test added first (NEW)
```

#### Deep file dependency analysis
- `goal.ts` (273 LoC) is the `/goal` slash command. No test today.
- The five verb handlers are referenced only through the map, so renaming them is contained to this file — confirmed by grep for each handler name across `packages/`.

#### Deep Dives
- Invariant (Baseline Context): `VERBOS_DE_GOAL` keys are user-typed and MUST NOT change. The RED test enumerates all five keys and asserts each resolves to a handler.
- Edge case: an unknown verb must still produce the existing error path, not a crash — asserted as the anti-vacuity floor.

#### Tasks
1. Write the RED verb-routing test.
2. D2 collision pre-check.
3. Rename identifiers only; assert the map-key string literals are untouched in the diff.
4. `npx tsc --noEmit`; `npm test`.

#### TDD
```
RED:     test_every_documented_goal_verb_routes_to_a_handler() — it.each over
         ['status','pause','clear','edit','resume']; each resolves non-undefined
RED:     test_an_unknown_verb_does_not_route() — ANTI-VACUITY: returning a handler
         for everything would satisfy the test above
GREEN:   Apply the renames
REFACTOR: None expected
VERIFY:  npx vitest run packages/tui/src/commands/goal.test.ts
```

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- [ ] 0 violations for `packages/tui/src/commands/goal.ts`
- [ ] All five verb key strings byte-identical in the diff
- [ ] Pass: lint / size (273 ≤ 500) / complexity

#### DoD
- [ ] `npm test` green · `npx tsc --noEmit` clean

### T2.3 — Rename the remaining `tui` identifiers

#### Objective
Clear the balance — 38 identifiers across 23 files.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** applies the rename map to the 23 remaining `tui` files, each holding 1–5 identifiers (`instalarSinal` → `installSignal`, `hooksRevisados` → `hooksReviewed`, `tomarImagens` → `takeImages`, `anexarImagens` → `attachImages`, `computar` → `compute`, `CABECALHOS_POR_TOOL` → `HEADERS_BY_TOOL`, and 17 others).

**Why it is necessary now:** it is the balance of the package, and per D5 the whole package lands as one commit. It is separated from T2.1/T2.2 because those two carry the phase's structural and user-contract risk; this task is mechanical, and mixing it in would hide the two diffs that need careful reading.

#### Evidence
- Per-file list in `## Appendix A`, every entry with a `file:line` from the guard's own output.
- `packages/tui/src/consent/consent-state.ts:3` → consumed at `use-consent.ts:25` and `InputSlot.tsx:70` — a 3-file structural contract like T2.1, smaller.
- `packages/tui/src/agent-session/tui-session.ts:19` → consumed at `composition-root.ts:92`, `command-capabilities.ts:11`, `interpret-command.ts:86`.

#### Files to edit
```
(23 files — see ## Appendix A for the full list with line numbers)
```

#### Deep file dependency analysis
Two sub-contracts inside this task span multiple files and must each be renamed atomically, exactly as in T2.1:
- `hooksRevisados` / `recusados` — `consent-state.ts` → `use-consent.ts` → `InputSlot.tsx`
- `tomarImagens` / `anexarImagens` — `tui-session.ts` → `composition-root.ts`, `command-capabilities.ts`, `interpret-command.ts`

The other 34 identifiers are file-local (verified: each grep returns exactly one file).

#### Deep Dives
- Edge case: `packages/tui/src/formatting/last-usage.ts:3` declares `ler: (m: M) => U | undefined` — a reader callback. `read` is safe as a field; use `readFrom` if the D2 pre-check finds `read` in the file.
- Edge case: `packages/tui/src/main.tsx:32` `instancia` → `instance`. `main.tsx` is the app entrypoint; a shadowing error here fails the build loudly, not silently.
- Edge case: `packages/tui/src/commands/config-commands.ts:140` `comInstrucaoDeDelegacao` → `withDelegationInstruction` — carries `instrucao`, one of the words only the suffix detector finds.

#### Tasks
1. D2 collision pre-check across all 23 files.
2. Apply renames, atomically per sub-contract.
3. `npx tsc --noEmit`; `npm test`.

#### TDD
```
RED:     None new. These 34 file-local identifiers have no behaviour to pin that
         tsc does not already prove, and writing a test asserting a name changed
         would test implementation (rules/testing.md § 6). The two multi-file
         sub-contracts are covered by the existing suite via InputSlot rendering.
GREEN:   Apply the renames
REFACTOR: None expected
VERIFY:  npm test
```

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- [ ] `node tools/check-english-only.mjs` reports **0** violations for `packages/tui`
- [ ] Pass: lint — `npx eslint packages/tui` zero warnings
- [ ] Pass: size — every changed file ≤ 500 lines

#### DoD
- [ ] `npm test` green · `npx tsc --noEmit` clean
- [ ] CHANGELOG `[Unreleased] § Changed` updated

---

## Phase 3: `packages/shared` and the string-literal gap

**Objective:** clear the last identifier and close the detector gap that lets Portuguese ship to users.

### T3.1 — Rename `instalar` in `diagnostic-sink.ts`

#### Objective
Rename the single Portuguese identifier in `packages/shared`.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** renames `instalar` → `install` at `packages/shared/src/diagnostic-sink.ts:4`.

**Why it is necessary now:** it is the last identifier outside `agent`, and `shared` is the leaf of the dependency graph (`rules/architecture.md`) — everything imports it, so leaving Portuguese at the base of the stack is the worst placement for it. One-line change, own task because it is its own package and own commit per D5.

#### Evidence
- `packages/shared/src/diagnostic-sink.ts:4` — `instalar: (sink: ((m: string) => void) | undefined) => void,`
- `git log -1 b0fbda1` — *"refactor: remove toda mencao a agent-builder — o produto se chama TheoCode"*, itself a Portuguese commit message (see Q1)

#### Files to edit
```
packages/shared/src/diagnostic-sink.ts — 1 identifier
```

#### Deep file dependency analysis
33 LoC, last touched `b0fbda1` (2026-08-07). `instalar` is a field of the exported sink descriptor; grep confirms consumers reference it through the object, and `tsc` covers every one.

#### Deep Dives
- Edge case: `install` must not collide with an existing local — D2 pre-check, though at 33 LoC the risk is near zero.

#### Tasks
1. D2 pre-check. 2. Rename. 3. `tsc` + `npm test`.

#### TDD
```
RED:     None new — a one-line field rename with no behaviour to pin; tsc proves
         every consumer updated. Adding a test here would test implementation.
GREEN:   Rename `instalar` -> `install`
REFACTOR: None expected
VERIFY:  npm test
```

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- [ ] `node tools/check-english-only.mjs` reports **0** violations repo-wide for identifiers
- [ ] Pass: lint / size

#### DoD
- [ ] `npm test` green · `npx tsc --noEmit` clean

### T3.2 — Detect unaccented Portuguese inside string literals

#### Objective
Extend the guard to run the lexicon test on string-literal contents, gated on a measured false-positive rate.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** adds a third detector that extracts string literals (currently stripped by `codeOnly()`), runs `isPortuguese()` over their words, measures the false-positive rate on the now-clean tree, and wires it in only if that rate is zero.

**Why it is necessary now:** `packages/tui/src/rendering/timeline-memo.ts:11` ships `'↻ continuando o goal…'` **to users**. The accent detector misses it (no accents); the identifier scan strips strings before testing. A user-facing Portuguese string is the most visible violation of the rule possible, and without this detector the "0 violations" this plan claims would not cover it. It runs after Phases 1–3 because the false-positive measurement is only meaningful once no true positives remain (D4).

#### Evidence
- `packages/tui/src/rendering/timeline-memo.ts:11` — `const CONTINUACAO_COLAPSADA = '↻ continuando o goal…'`
- `tools/check-english-only.mjs` `codeOnly()` — `.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""')` strips exactly the content this task must read
- `code-review-output/final_report.md § What was NOT reviewed` — "Portuguese in prose… beyond what the accent detector catches"

#### Files to edit
```
tools/check-english-only.mjs — third detector + measurement mode
tools/check-english-only.test.mjs — RED tests
packages/tui/src/rendering/timeline-memo.ts — translate the user-facing string
```

#### Deep file dependency analysis
The guard is build tooling with no importers (see T0.1). `timeline-memo.ts` renders the collapsed-continuation row; the string is display text with no parsing dependency.

#### Deep Dives
- Algorithm: for each string literal, split on non-letters, apply the same `wordParts` + `isPortuguese` used for identifiers. Reuse, do not duplicate (DRY).
- Invariant: the detector must not fire on the repository's own English prose. Measured before wiring — that is the gate.
- Edge case: template literals with `${}` interpolation — strip the expressions, test only the literal chunks.
- Edge case: a string containing a URL or a file path (`'packages/agent/src'`) — `src` is in TECHNICAL; longer path segments are English or unknown.
- Edge case: imports (`from './rules.js'`) are string literals. Module specifiers must be excluded or every Portuguese *filename* double-reports (T0.1 already owns filenames).

#### Pseudo-code / Signatures
```pseudocode
function portugueseInStringLiterals(line: string): string[]
  literals = extractStringLiterals(line)          # excluding import/require specifiers
  return literals.flatMap(wordParts).filter(isPortuguese)

# Example
input:  "const X = '↻ continuando o goal…'"
output: ["continuando"]
input:  "const Y = 'resume the goal'"
output: []
```

#### Tasks
1. Write the RED tests.
2. Implement extraction + reuse of `wordParts`/`isPortuguese`.
3. Run in report-only mode over the cleaned tree; record the false-positive count.
4. **Decision gate (Q2):** zero → wire into the violation path. Non-zero → report the rate, wire it behind ALLOWED entries or defer, and record the decision here.
5. Translate `timeline-memo.ts:11` to English.

#### TDD
```
RED:     test_an_unaccented_portuguese_string_is_flagged() — '↻ continuando o goal…' flags "continuando"
RED:     test_an_english_string_is_not_flagged() — 'resume the goal' flags nothing (ANTI-VACUITY)
RED:     test_an_import_specifier_is_not_scanned() — "from './hooks-for-member.js'" flags nothing here
GREEN:   Implement the detector
REFACTOR: Share wordParts/isPortuguese between all three detectors (DRY)
VERIFY:  npx vitest run tools/check-english-only.test.mjs
```

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- [ ] The detector flags `'↻ continuando o goal…'` before the translation and nothing after
- [ ] False-positive count on the cleaned tree is recorded in the DoD, and is **0** if the detector is wired into the violation path
- [ ] Pass: size — `tools/check-english-only.mjs` ≤ 500 lines
- [ ] Pass: lint

#### DoD
- [ ] Measured false-positive rate written into this task's completion note (a number, not "low")
- [ ] Q2 resolved and the resolution recorded
- [ ] `npm test` green

### T3.3 — Sweep the unknown bucket once, by hand

#### Objective
Read the 949 words in neither lexicon and confirm none is Portuguese.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** runs `node tools/check-english-only.mjs --list-unknown`, reads the list, and renames anything Portuguese that neither the lexicon nor the suffix rule catches.

**Why it is necessary now:** `efforto` — in `packages/agent/src/delegation/roles.ts` — was caught only because it shared a line with `selecao`. It is in neither lexicon and matches no Portuguese suffix, so nothing detects its class. The bucket is the only place such a word can hide, and a one-time human read is the only instrument that covers it. Per YAGNI this is a **one-off sweep**, not new tooling: building a detector for invented words is speculative until a second instance exists.

#### Evidence
- `code-review-output/final_report.md § Residual gaps` — "`efforto` is not independently detectable"
- `node tools/check-english-only.mjs --list-unknown` — 949 entries, frequency-ordered
- The `--list-unknown` flag already exists (shipped in `6044801`), so this task adds no code

#### Files to edit
```
(none expected — any file the sweep implicates is added here when found)
```

#### Deep file dependency analysis
No code change unless the sweep finds something. The output is a written record, not a diff.

#### Deep Dives
- The list is frequency-ordered, so genuine abbreviations (`cwd`, `pty`, `dfs`, `env`) cluster at the top and one-off oddities at the tail — read the tail first.
- Invariant: this is a **point-in-time** sweep. It does not prevent the next invented word, and the plan does not claim it does.

#### Tasks
1. `node tools/check-english-only.mjs --list-unknown > unknown.txt`
2. Read all 949, tail first.
3. Rename anything Portuguese; add anything genuinely technical to TECHNICAL with a reason.
4. Record the count read and the count actioned.

#### TDD
```
RED:     None — this task is a human read with no logic to test. Its output is a
         record and any rename it triggers is covered by that file's own gates.
GREEN:   n/a
REFACTOR: n/a
VERIFY:  node tools/check-english-only.mjs --list-unknown | wc -l
```

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- [ ] All 949 entries read (count recorded, not estimated)
- [ ] Every Portuguese word found is renamed or explicitly justified
- [ ] The residual limit restated honestly: this sweep is point-in-time

#### DoD
- [ ] Sweep record written into the implementation log with both counts

---

## Phase 4: Cover the modules whose renames rest on `tsc` alone

**Objective:** give `delegation/` and `goal/` behaviour tests.

### T4.1 — Behaviour tests for `packages/agent/src/delegation`

#### Objective
Cover the public entry points of the delegation module.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** adds `roles.test.ts` and `delegation-cap.test.ts` covering role config derivation, per-member hook installation, and the recursion cap.

**Why it is necessary now:** the module has 6 source files and **zero** tests, and the 2026-08-09 rename changed five identifiers inside it (`selecao`, `efforto`, `hooksParaMembro`, `trabalho`, `dormir`). Those renames are protected by `tsc`, which proves the code compiles, not that it behaves. Delegation decides which tools a sub-agent inherits and how deep recursion may go — per `rules/architecture.md` it is a trust boundary, and per D6 a boundary with no test is the highest-value gap in this plan.

#### Evidence
- `find packages/agent/src/delegation -name '*.test.ts'` → nothing
- Finding `Module 'delegation' has 6 source files and zero test files` (MEDIUM) in `code-review-output/code-review.db`
- `packages/agent/src/delegation/roles.ts:45-52` — `roleConfigFrom` derives model + effort, the logic renamed on 2026-08-09
- `packages/agent/src/delegation/roles.ts:65` — the module's own comment says a role is NOT materialised with a silently inherited effort, "because that would run the subagent at an effort different from the declared one" — a stated invariant with no test

#### Files to edit
```
packages/agent/src/delegation/roles.test.ts — NEW
packages/agent/src/delegation/delegation-cap.test.ts — NEW
```

#### Deep file dependency analysis
- `roles.ts` (renamed 2026-08-09) exports role discovery and config derivation; imports `hooksForMember` from `hooks-for-member.ts`.
- `delegation-cap.ts` wraps a work promise with a recursion/time cap (`work`, `sleep` — renamed).
- Neither has an existing test to extend, so both files are new. `vitest.config.ts` picks up `packages/*/src/**/*.test.ts` — both paths qualify.

#### Deep Dives
- Invariant (from `roles.ts:65`): a role must not inherit reasoning effort silently. Test: a role declaring no effort must not receive the parent's.
- Invariant: `delegation-cap` must not let a capped call outlive its budget. Test with an injected `sleep` so the test is deterministic (`rules/testing.md § 6` — no wall-clock in unit tests).
- Edge case: a role with a string `model` vs an object `model` — `roleConfigFrom` branches on this (`roles.ts:48`), and only the object branch derives effort.

#### Pseudo-code / Signatures
```pseudocode
# roles.test.ts
test_a_role_without_declared_effort_does_not_inherit_the_parents()
  role = roleConfigFrom({ model: { id: 'x' } })      # no reasoning_effort
  assert role.reasoning_effort is undefined           # NOT parent's

test_a_role_with_a_declared_effort_keeps_it()        # anti-vacuity
```

#### Tasks
1. Write RED tests for role derivation (3 cases) and the cap (2 cases).
2. Run — they must fail or error before any fix.
3. Implement nothing unless a test reveals a real defect; if it does, that is a separate bug-fix task with its own RED-GREEN.
4. `npm test`.

#### TDD
```
RED:     test_a_role_without_declared_effort_does_not_inherit_the_parents()
RED:     test_a_role_with_a_declared_effort_keeps_it() — ANTI-VACUITY floor
RED:     test_a_string_model_yields_no_derived_effort() — the branch at roles.ts:48
RED:     test_delegated_work_is_abandoned_when_the_cap_elapses() — injected sleep
RED:     test_work_completing_before_the_cap_returns_its_value() — ANTI-VACUITY
GREEN:   No production change expected — these pin existing behaviour. Any test that
         fails is a real defect and becomes its own RED-GREEN-REFACTOR bug-fix task.
REFACTOR: None expected
VERIFY:  npx vitest run packages/agent/src/delegation/
```

#### Concurrency tests
`delegation-cap.ts` races work against a timeout — concurrency signal present.
Cancellation propagation: cap a promise that never settles; assert the cap resolves
  and that the abandoned work's later settlement does not resolve the cap twice
  (no double-resolve). Uses an injected sleep, so no wall-clock dependency.


#### Acceptance Criteria
- [ ] 5 tests, each asserting one behaviour, AAA-shaped (`rules/testing.md § 3`)
- [ ] At least 2 anti-vacuity floors present
- [ ] Pass: coverage — every public export of `roles.ts` and `delegation-cap.ts` exercised
- [ ] Pass: lint / size

#### DoD
- [ ] `npm test` green, total ≥ 238
- [ ] No test depends on wall-clock time or execution order

### T4.2 — Behaviour tests for `packages/agent/src/goal`

#### Objective
Cover the goal driver's turn and budget bounds.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** adds `goal.test.ts` covering max-turns and token-budget termination.

**Why it is necessary now:** the module has 3 source files and zero tests, and it drives **billable** autonomous turns. An off-by-one in the turn bound spends real money, and `args.test.ts` already exercises `--max-turns`/`--token-budget` at the CLI boundary while nothing exercises the driver that honours them.

#### Evidence
- `find packages/agent/src/goal -name '*.test.ts'` → nothing
- Finding `Module 'goal' has 3 source files and zero test files` (MEDIUM) in `code-review-output/code-review.db`
- `packages/cli/src/runtime/args.test.ts:120-121` — the flags are parsed and tested; the driver that consumes them is not

#### Files to edit
```
packages/agent/src/goal/goal.test.ts — NEW
```

#### Deep file dependency analysis
`goal/goal.ts` (130 LoC across the module) runs bounded turns. It takes injected dependencies, so no network or model call is needed to test the bound.

#### Deep Dives
- Invariant: the turn bound is inclusive/exclusive consistently — the test pins which.
- Edge case: budget exhausted mid-turn — does it finish the turn or abort? The test records the actual behaviour rather than asserting a preference.

#### Tasks
1. Write RED tests for both bounds.
2. Run; any failure is a real defect and gets its own bug-fix task.
3. `npm test`.

#### TDD
```
RED:     test_the_driver_stops_after_max_turns() — injected runner counts invocations
RED:     test_the_driver_runs_every_turn_when_under_budget() — ANTI-VACUITY: stopping
         at turn 1 always would satisfy the test above
RED:     test_the_driver_stops_when_the_token_budget_is_exhausted()
GREEN:   No production change expected
REFACTOR: None expected
VERIFY:  npx vitest run packages/agent/src/goal/
```

#### Concurrency tests
(none — single-threaded)
The driver awaits each turn sequentially; there is no shared mutable state across turns.

#### Acceptance Criteria
- [ ] 3 tests, one anti-vacuity floor
- [ ] No real model call — every dependency injected
- [ ] Pass: lint / size / coverage on both bounds

#### DoD
- [ ] `npm test` green
- [ ] Test runtime added < 200ms

---

## Phase 5: Integration Validation

**Objective:** prove the whole chain, not each piece.

### T5.1 — Full-chain validation

#### Objective
Run every gate together and confirm the Goal's metric.

#### Why this step (action + reasoning — ReAct discipline)

**What this step does:** runs typecheck, the full suite, lint, dependency-cruiser and the guard, and records the guard's violation count.

**Why it is necessary now:** each phase validated its own package. The Goal is a repo-wide count, and only a repo-wide run can observe it. This is the "eat your own cooking" gate — this entire engagement exists because a per-slice green was mistaken for a repo-wide guarantee.

#### Evidence
- `package.json:21-26` — the five gate commands
- The engagement's origin: `f3a9e26` and `006d773` both passed their own gates and left 47 violations between them

#### Files to edit
```
CHANGELOG.md — final [Unreleased] entries
```

#### Deep file dependency analysis
No source change. `CHANGELOG.md` per Unbreakable Rule 6.

#### Deep Dives
- The guard's exit code IS the Goal metric. Record the printed count, not a claim.

#### Tasks
1. `npx tsc --noEmit`
2. `npm test`
3. `npm run lint`
4. `npm run depcruise`
5. `node tools/check-english-only.mjs` — record the count
6. Update CHANGELOG.

#### TDD
```
RED:     None — this task runs existing gates rather than adding behaviour.
GREEN:   All five gates pass
REFACTOR: None
VERIFY:  npm run lint && npm test && npx tsc --noEmit && npm run depcruise
```

#### Concurrency tests
(none — single-threaded)

#### Acceptance Criteria
- [ ] `node tools/check-english-only.mjs` prints **0 violations** and exits 0
- [ ] `npm test` green with ≥ 238 tests
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` exits 0
- [ ] `npm run depcruise` 0 cycles, 0 boundary violations

#### DoD
- [ ] Every gate's actual output recorded in the implementation log — a number per gate, not "passed"
- [ ] CHANGELOG `[Unreleased]` updated

---

## Edge-case MUST-FIX absorbed (v1.1)

From `.claude/knowledge-base/plans/english-only-completion-edge-cases.md`. Each is now binding on the tasks named.

| # | MUST-FIX | Absorbed into |
|---|---|---|
| M1 | Diff must contain no change inside a string literal or comment that is not an interpolated identifier | DoD of T1.1, T1.2, T2.1, T2.2, T2.3, T3.1 |
| M2 | Baseline counts corrected to `tui` 66 / `cli` 28 / `shared` 1 | Objective, Phase 1 & 2 headers, Coverage Matrix |
| M3 | The unknown-bucket sweep runs AFTER the first full T5.1 run, and repeats until two consecutive sweeps find nothing new | T3.3 (loop-until-dry) |
| M4 | `isPortuguese('indices') === false` while `isPortuguese('indice') === true` — the anti-vacuity floor for `KNOWN_PORTUGUESE` | RED test in T0.1 |
| M5 | `sair` at `packages/cli/src/commands/run.ts:87` is a bare local — rename to `drainedExit`, never `exit` | T1.1 rename map |
| M6 | Map-key string literals byte-identical in the diff — `EXECUTORES` (`KeyAction['kind']`) and `MODO_PARA_POLITICA` (`--sandbox` values), not only `GOAL_VERBS` | DoD of T1.2 and T2.1 |

**Detector-capability caveat (D2, documented risk):** the violation count measures what the
guard can currently see. `packages/agent` read 0, then 3, then 0 again without a line of product
code changing in between — the middle reading came from adding the `-ao` rule and
`KNOWN_PORTUGUESE`. The Goal metric stays valid (0 with the detectors as configured) and must not
be read as "no Portuguese exists in this repository".

## Coverage Matrix

| # | Gap / Requirement | Task(s) | Resolution |
|---|---|---|---|
| 1 | 28 Portuguese identifiers in `packages/cli`, 10 files | T1.1, T1.2 | Renamed; guard reports 0 for `cli` |
| 2 | 66 Portuguese identifiers in `packages/tui`, 28 files | T2.1, T2.2, T2.3 | Renamed; guard reports 0 for `tui` |
| 3 | 1 Portuguese identifier in `packages/shared` | T3.1 | Renamed |
| 4 | Filenames unguarded — `hooks-para-membro.ts` found by hand | T0.1 | Filename detector added to the guard |
| 5 | Unaccented Portuguese in string literals ships to users | T3.2 | String-literal detector + `timeline-memo.ts:11` translated |
| 6 | 949-word unknown bucket never swept — the `efforto` class | T3.3 | One-time human sweep, limit restated |
| 7 | `delegation/` untested; 2026-08-09 renames rest on `tsc` | T4.1 | 5 behaviour tests at public entry points |
| 8 | `goal/` untested; drives billable turns | T4.2 | 3 behaviour tests on both bounds |
| 9 | Repo-wide metric never observed as a whole | T5.1 | Full-chain run; guard count recorded |

**Coverage: 9/9 gaps covered (100%)**

> Arithmetic note: the per-package distinct counts (27 + 61 + 1) sum to 89 while the
> repo-wide union is **87**. Two identifiers — `sair` and `verbo` — occur in both `tui`
> and `cli`. They are renamed independently in each package (no shared symbol; see
> `## Baseline Context § Current callers`).

Explicitly **out of scope**, with reason: the stop-validation secret-gate defect in the four sibling repos (Q3 — different repositories, hook is gitignored, upstream template unknown) and a commit-message language check (Q1 — one observed instance; YAGNI until a second).

## Global Definition of Done

- [ ] All phases completed
- [ ] All tests passing — `npm test` green, ≥ 238 tests
- [ ] Zero type errors — `npx tsc --noEmit`
- [ ] Zero lint warnings — `npm run lint` exits 0
- [ ] File-size budget respected — every changed file ≤ 500 lines (`rules/architecture.md`)
- [ ] CHANGELOG.md updated under `[Unreleased]` (Unbreakable Rule 6)
- [ ] Backward compatibility preserved — no user-facing string, CLI flag, slash-command verb or wire-protocol value changed; only identifiers
- [ ] **Guard reports 0 violations** with the filename detector enabled, and the string-literal detector's measured false-positive rate recorded as a number
- [ ] **Runtime-metric proof** — the Goal's metric is the guard's own printed count from a real run in T5.1, not a claim
- [ ] Q2 resolved and recorded; Q1, Q3, Q4 answered or explicitly carried forward
- [ ] **Plan archived** — after `/review` returns `READY_TO_MERGE` and the PR is merged, move this file to `knowledge-base/plans/completed/`

## Dependencies

This plan adds, upgrades and removes **no dependency**. Every task is a rename, a test, or an
extension of a script that already runs on the installed toolchain.

| Package | Version | Change | Rule 9 justification (why not hand-rolled / why not new) |
|---|---|---|---|
| — | — | none added | The language-identification data comes from `/usr/share/dict/*` and `/usr/share/hunspell/*.dic`, already present on the machine. Parsimony ladder rung 4: reuse what is installed. |
| `vitest` | `^3` (installed) | reused | Runs the new test files; T0.1 only widens the `include` glob. |
| `typescript` | `^5` (installed) | reused | `tsc --noEmit` is the correctness authority for every rename (D1). |
| `eslint` | `^9` (installed) | reused | Existing gate, unchanged. |

**Deliberately NOT added, with reason:**

- **`ts-morph` / `jscodeshift`** — rejected in D1. An AST rename would still need the same human
  naming judgement, and `tsc` already proves the result compiles across every caller.
- **A language-detection library** (`franc`, `cld3`, `langdetect`) — rejected: they classify
  *documents* by statistical n-gram profile and are unreliable on single identifiers, which is the
  unit this guard tests. The lexicon lookup is both simpler and more accurate at this granularity.
- **`hunspell` / `aspell` Portuguese dictionaries** — NOT a package dependency but a system one.
  Installing `hunspell-pt-br` would supply the `.aff` affix rules whose absence forced
  `KNOWN_PORTUGUESE` into existence (see Drawbacks). Deliberately out of scope: it changes the
  developer environment contract for every contributor, which is Paulo's decision, not this plan's.
  Recorded as Q5.

**CVE surface:** unchanged — no manifest is modified by this plan.

## Failure scenarios

The plan touches two files that perform stream I/O (`session-busy.ts` consumes an `AsyncIterable`; `run.ts` opens it), but **changes no I/O behaviour** — every edit is an identifier rename. There is no new external dependency, no new call, no changed timeout. The scenarios below exist because those files' *existing* resilience is the invariant the renames must not disturb, not because the plan adds I/O.

| Dependency | Failure mode | How the test reproduces it | Expected behavior |
|---|---|---|---|
| Session stream (`AsyncIterable` from the agent) | Stream ends mid-turn without a `finish` chunk | T1.1 test feeds a generator that returns after `start` | Consumer resolves rather than hanging; no partial state leaks to the next consumer |
| Session stream | Second consumer attaches while the first is draining | T1.1 concurrency test, two concurrent `consumeWithForkIfBusy` calls | Second receives a distinct forked id; neither interleaves |
| Goal cancellation registry | Shutdown fires twice (double SIGINT) | T1.2 concurrency test triggers shutdown twice | Each cleanup runs exactly once; idempotence flag holds |

## Appendix A — Full identifier inventory

The authoritative list is the guard's own output, reproducible at any time:

```bash
node tools/check-english-only.mjs 2>&1 | grep -oP 'packages/\S+?:\d+  \(Portuguese word "[^"]+" in `[^`]+`\)'
```

Snapshot taken 2026-08-09 (111 occurrences, 87 distinct identifiers, 37 files) is stored at
`code-review-output/findings/code/` and summarised per file in `code-review-output/final_report.md`.
Per D2, target names are decided per file at implementation time after the collision pre-check —
fixing all 87 target names in this plan would freeze decisions that depend on what the pre-check
finds in each file.
