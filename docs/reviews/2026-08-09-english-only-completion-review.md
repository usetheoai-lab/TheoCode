# Review — `english-only-completion`

**Date:** 2026-08-09 · **Branch:** `workspace` · **Range:** `6d78cce..HEAD` (7 commits)
**Plan:** `.claude/knowledge-base/plans/english-only-completion-plan.md` v1.1
**Verdict:** `READY_TO_MERGE_WITH_FOLLOWUPS`

## Cycle executed

`/to-plan` → `/edge-case-plan` → `/deps-audit` → `/plan-confidence` → `/implement` → `/code-quality` → `/review`

| Phase | Result |
|---|---|
| plan-confidence | `SHIPPABLE_WITH_CAVEATS` — 34 citations, 0 unresolved; 1 soft cap (`vague_acceptance_criteria`, acceptable_ratio 0.568) |
| deps-audit | `PASS_WITH_CAVEATS` — 2 LOW CVEs (`diff`, GHSA-73rr-hh4g-fpgx), pre-existing, no dependency added by this plan |
| code-quality | `PASS`, cap 100, zero findings across D1/D2/D3 |

## Goal metric — met

> "Enable `npm run lint` to exit 0 across all four packages … measured by `node tools/check-english-only.mjs` reporting 0 violations with the filename and string-literal detectors enabled."

```
$ node tools/check-english-only.mjs
english-only: clean (111679 EN forms, 484091 PT forms)
$ echo $?
0
```

Read off a real run, with all five detectors on — not asserted.

## Coverage Matrix — 9/9

| # | Gap | Task | Evidence |
|---|---|---|---|
| 1 | 28 Portuguese identifiers in `cli` | T1.1, T1.2 | `31f1201` — 84 occurrences, 10 files |
| 2 | 66 in `tui` | T2.1–T2.3 | `cd58ed1` — 197 occurrences, 29 files |
| 3 | 1 in `shared` | T3.1 | `cd58ed1` |
| 4 | Filenames unguarded | T0.1 | `c95dd1e` — detector 4 + 10 tests |
| 5 | Portuguese strings shipping to users | T3.2 | `cd58ed1` — detector 5 + 17 strings translated |
| 6 | 949-word unknown bucket never swept | T3.3 | 182 words read; 0 Portuguese |
| 7 | `delegation/` untested | T4.1 | `b506ad0` — 5 tests |
| 8 | `goal/` untested | T4.2 | `b506ad0` — 9 tests |
| 9 | Repo-wide metric never observed whole | T5.1 | above |

## Hard gates

| Gate | Result |
|---|---|
| Failing tests on the branch | none — 257 pass (49 files; 233 at plan time) |
| New secrets committed | none — content scan of the full range for `sk-`/`ghp_`/`npm_`/`AKIA`/PEM found 0 |
| Direct commit to `main` | none — every commit on `workspace` |
| Authorship trailer forbidden by user policy | absent from all 7 commits |
| CHANGELOG not updated | updated by 6 commits |
| `tsc --noEmit` | clean |
| `depcruise` | 0 violations, 190 modules, 495 dependencies |

## Findings

**No BLOCKER.** Four findings, all recorded rather than silently absorbed.

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | HIGH | `packages/agent` was reported clean on 2026-08-09 while `THREAD_PADRAO`, `semEspaco` and `indice` remained. All three were invisible to every detector: their accented forms are in no installed `.dic`, and no suffix rule reached them. | Fixed `f57341b`; the claim was corrected to the user before the fix |
| 2 | HIGH | 17 Portuguese strings were shipping **to users** — `maxSessions deve ser inteiro >= 1`, `APLICADO — N artefato(s) removido(s)`, `↻ continuando o goal…`, and `Aguarde o turno current terminar before de iniciar o goal` (half-translated by an earlier i18n pass). Four passes of this engagement missed them. | Fixed `cd58ed1` |
| 3 | MEDIUM | `formatGoalEvent` is a switch with no `default`, exhaustive over the compiled-against union. An event variant added by `@theokit/agents` returns `undefined` and the caller's `line.length` throws a raw TypeError, killing a goal run mid-flight. | Found by T4.2's tests, fixed RED-first in `b506ad0` |
| 4 | LOW | Two error `code:` values were Portuguese (`surface_nao_tratada`, `max_sessions_invalido`). These are a matchable contract; no external consumer is documented. | Changed to English in `cd58ed1`, flagged in that commit |

## Non-vacuity — verified, not asserted

Both new test files were mutation-checked rather than trusted because they passed:

- Removing the `Promise.race` from `withDelegationCap` → **2 of 5** delegation tests fail.
- The unknown-event test failed before the `default` branch existed and passes after, with its anti-vacuity floor (`test_a_known_event_still_renders_its_line`) green throughout — so the fix could not have been "render nothing for everything".

## Edge-case MUST-FIX — all six applied

| # | Applied as |
|---|---|
| M1 | Every diff checked for changes inside string literals and comments; the only string hunks are interpolations of renamed identifiers |
| M2 | Plan counts corrected 61/27/1 → 66/28/1 |
| M3 | Unknown-bucket sweep moved after the renames |
| M4 | `isPortuguese('indices') === false` while `('indice') === true` — RED test, the floor for the whole `KNOWN_PORTUGUESE` mechanism |
| M5 | `sair` at `run.ts:87` is a bare local → `drainedExit`, never `exit` |
| M6 | `MODE_TO_POLICY` keys, `STRUCTURAL` values and `GOAL_VERBS` keys verified byte-identical |

## Not covered — stated, not implied

- **No independent design review.** The 5–7 specialist agents of `cycle-review` did not run: everything here is mechanical (scripts, gates, git history) or was verified by the same person who wrote it. For a slice whose central finding was *"the instrument reported clean while broken"*, that is the honest caveat.
- **Unaccented Portuguese PROSE in comments is caught by nothing.** Detector 5 strips comments first, deliberately — a JSDoc block legitimately quotes the Portuguese it explains (the old `perfis = layer.profiles`, the SDK's `ListOptionsSemPaginacao`). Flagging a quotation of the defect makes the check fire on correct code, and such a check gets deleted. Comments do not reach users, which is why this ranks below a false positive.
- **The `efforto` class is bounded, not closed.** `KNOWN_PORTUGUESE` holds 8 measured words; a ninth that no dictionary contains and no suffix reaches would still pass. The residue is enumerated instead of unknown — that is the claim, not that it is closed.
- **The unknown-bucket sweep is point-in-time.** One dry sweep of 182 words. M3's loop-until-dry only has meaning across a change; re-run after the next one.
- **The knowledge-base is not versioned.** `.claude/` is gitignored, so the plan, edge-case review and confidence output live only on this machine. The same gap dropped an ADR earlier in this session. This review is mirrored to `docs/reviews/` for that reason; the plan is not.
- **The stop-validation secret gate was fixed only here.** Four sibling repos (`agent-builder`, `theokit-plugins`, `theokit-sdk`, `theokit`) carry the name-only version that blocks `credentials.ts` and misses a hardcoded `sk-ant-…`. The hook is gitignored in each, so an upstream template may exist that this repository cannot see.

## Followups — registered

- **`ListOptionsSemPaginacao`** is a Portuguese type name exported by `@theokit/agents`. It is a defect in the SDK, not in this repository, and cannot be fixed here.
- **Q1 (open):** should the guard check commit messages? `b0fbda1`'s message is Portuguese. One observed instance; YAGNI until a second.
- **Q3 (open):** who fixes the secret gate in the four sibling repos.
- **Q5 (open):** should `hunspell-pt-br` become a documented developer prerequisite? Installing the `.aff` affix rules is the root fix for `KNOWN_PORTUGUESE`, at the cost of a setup step for every contributor.
- **Release version undecided.** `develop` is 112 commits behind `workspace`; no semver tag exists.

## Handoff

`READY_TO_MERGE_WITH_FOLLOWUPS` per `cycle-review § Verdicts`: no BLOCKER, and the debt above is named rather than mentioned. Promotion `workspace → develop` is a human gate (Unbreakable Rule 4) and is not taken here.
