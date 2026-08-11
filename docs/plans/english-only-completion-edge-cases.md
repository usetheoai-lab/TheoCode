# Edge-case review — `english-only-completion`

**Plan:** `.claude/knowledge-base/plans/english-only-completion-plan.md` v1.0
**Date:** 2026-08-09 · **Verdict:** 6 MUST-FIX · 3 SHOULD-TEST · 2 DOCUMENT

Two lenses per `rules/testing.md § 4.1`: **edge** (extreme of a valid case — does it hold at the boundary?) and **negative** (invalid/unexpected — does it fail-fast and clearly?).

---

## MUST-FIX

### M1 — The rename replaces inside string literals and comments (negative)

**Lens:** negative — the input is valid code, but the transformation is applied where it must not be.

The `packages/agent` pass replaced `\bIDENT\b` across the whole file text. Strings and comments are text. A user-facing string containing the word being renamed is silently rewritten, and no gate catches it: `tsc` sees a string, tests assert behaviour that did not change, lint is clean.

Measured on the `agent` commit (`6044801`): **no damage** — the only string-adjacent hit was `${part.content}` inside a template literal, which is code and correct. So the risk did not materialise there, but `tui` and `cli` carry far more user-facing prose, including `packages/tui/src/commands/session-commands.ts:54` (`Login methods for ${provider}: ${rotulos}`) and `packages/tui/src/rendering/timeline-memo.ts:11`.

**Fix (≤ 1 sentence of plan change):** every rename task's DoD gains — *"the diff contains no change inside a string literal or comment that is not an interpolated identifier"*, verified with `git diff -U0 | grep -E "^[+-].*['\"\`]"` before commit.

### M2 — The plan's baseline counts are already stale (edge)

**Lens:** edge — the count is a valid measurement taken at the boundary of the plan's own authoring.

The plan states `tui` 61, `cli` 27, `shared` 1. After `f57341b` added the `-ao` suffix rule and `KNOWN_PORTUGUESE`, the guard sees **`tui` 66, `cli` 28, `shared` 1**. The plan's numbers were correct when written and are wrong now, which is exactly how a plan stops being a contract.

**Fix:** update `## Objective`, both Phase headers, and the Coverage Matrix to 66/28/1, and add a note that the count is a function of detector capability, not a fixed quantity.

### M3 — Renaming introduces new unknown words (edge)

**Lens:** edge — the sweep is valid, but taken at the wrong moment.

T3.3 sweeps the unknown bucket. Every rename **changes** that bucket: new English names enter it, and words hidden behind a renamed compound become visible. Sweeping before Phases 1–3 finish measures a tree that will not exist.

Worse, this already bit: `packages/agent` was declared clean, then `THREAD_PADRAO`, `semEspaco` and `indice` surfaced from the bucket afterwards.

**Fix:** move T3.3 **after** T5.1's first full run, and re-run it until two consecutive sweeps find nothing new (loop-until-dry, not a single pass).

### M4 — Exact match is load-bearing and untested (negative)

**Lens:** negative — a substring rule is the wrong instrument and would produce a false positive on correct code.

`KNOWN_PORTUGUESE` must match whole words. `indice` (índice) is Portuguese; `indices` is the English plural of index and appears at `packages/agent/src/session/backtrack.ts:86,94,96`. A substring rule flags correct English.

**Fix:** add a RED test to T0.1 — `isPortuguese('indices') === false` while `isPortuguese('indice') === true`. This is the anti-vacuity floor for the whole `KNOWN_PORTUGUESE` mechanism.

### M5 — `sair` → `exit` can shadow, and one site is a bare local (negative)

**Lens:** negative — a rename that typechecks but changes meaning.

The plan's T2.1 notes `sair` is a field in `apply-key-action.ts:18` and therefore safe. But `packages/cli/src/commands/run.ts:87` declares `const sair = createDrainedProcessOutput(WATCHDOG_MS)` — a **bare local**. `exit` is not a bare global in Node ESM, so this compiles; it is still a name that reads as `process.exit` to every future reader.

**Fix:** rename that site to `drainedExit`, not `exit`. One line of plan change in T1.1's rename map.

### M6 — `VERBOS_DE_GOAL` has a sibling the plan missed (edge)

**Lens:** edge — the same class of user-contract map, one instance not enumerated.

The plan protects `VERBOS_DE_GOAL` keys (T2.2). The same hazard exists at `packages/tui/src/terminal-io/apply-key-action.ts:21` (`EXECUTORES`, keyed by `KeyAction['kind']` — `'reset-backtrack'`, `'close-diff'`, …) and `packages/cli/src/runtime/args.ts:114` (`MODO_PARA_POLITICA`, keyed by `--sandbox` values). Both are string keys that are contracts.

**Fix:** T2.1 and T1.2 DoD gain — *"map key string literals byte-identical in the diff"*, the same bullet T2.2 already has.

---

## SHOULD-TEST

### S1 — Three-file capability contract, anchor test is partial (edge)
`use-tui-keyboard` / `input-router` / `apply-key-action` match structurally. Q4 of the plan asked whether an anchor test exists. **Answer: one does** — `packages/tui/src/terminal-io/stderr-guard.test.ts` — but it covers the stderr diagnostic channel (B-039), NOT key routing. So the routing contract is still unanchored and T2.1 must write that test; the plan's ~40-minute estimate stands. Q4 is resolved.

*(This entry corrected an earlier claim in this report that no test file existed at all. One does; it covers a different concern.)*

### S2 — `resetarBacktrack` spans the same three files (edge)
`apply-key-action.ts:13`, `:32`, `use-tui-keyboard.ts:92`. It is in T2.1's file set but was not in the plan's enumerated rename map (it only became visible with `KNOWN_PORTUGUESE`). Rename it atomically with the rest.

### S3 — The string-literal detector will fire on the ALLOWED test fixture (negative)
`packages/agent/src/ask/ask-bridge.test.ts:76` deliberately contains Portuguese to assert an error message carries none. It is already in `ALLOWED` by `path:line`. T3.2 must confirm the allowance still applies once strings are scanned, or the guard fails on its own regression test.

---

## DOCUMENT (accept the risk, record it)

### D1 — `KNOWN_PORTUGUESE` is a denylist and will rot
Eight entries today, measured. Nothing stops it growing into the thing the rewrite removed. **Record:** the list is a supplement, never the sole detector; any entry added must cite the occurrence that justified it. A sunset is not appropriate (the words do not expire) but a size ceiling is — if it exceeds ~25 entries, the right response is to install proper `.aff` dictionaries, not to keep appending.

### D2 — Detector capability, not defect count, drives the number
`agent` went 0 → 3 → 0 without a line of product code changing in between. The "violations" figure measures *what we can currently see*. The plan's Goal metric is still valid (0 with the detectors as configured) but must not be read as "no Portuguese exists".

---

## What was checked and found safe

- **String/comment corruption in the completed `agent` pass** — inspected `6044801`'s diff; no prose was rewritten.
- **Cross-package identifier leakage** — re-verified after the new detectors: still none, so Phases 1–3 remain parallel.
- **`indices` false positive** — confirmed not flagged.
- **Empty/1-line files, generated code** — none in scope; no build output is scanned.
