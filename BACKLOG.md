# BACKLOG — TheoCode

The single place that answers *"what is pending in TheoCode?"*.

**The rule that governs this registry: ids are monotonic and are never renumbered.** A killed item keeps its number forever — the number is the audit trail.

## How an item gets here

Two producers, one registry:

| Producer | Input | Arrives as |
|---|---|---|
| `/backlog-item {slug}` | human hypothesis, no evidence | `status: raw` · `evidence: none-yet` |
| `/discover --sweep {domain}` | already-measured finding | `status: triaged` · `evidence: <pointer>` |

The item schema, status transitions, gates G1–G5 and verdicts live in [`.claude/rules/cycle-backlog.md`](.claude/rules/cycle-backlog.md). This file is **data**; the contract is the rule. Do not duplicate one into the other.

Flow: `raw` → `/discover` measures → `triaged` or `killed` → `/to-plan` → `planned` → `/release` → `shipped`. The `raw → planned` transition is forbidden: nothing becomes a plan without passing through measurement.

## Domain routing

Verified on disk on 2026-08-07 (`git rev-list --count HEAD` plus the `packages/` inventory).

| Domain | Repos | Specialist |
|---|---|---|
| `theocode` | `TheoCode` (4 commits, 12,626 LOC, 4 workspaces) | [`.claude/agents/theocode.md`](.claude/agents/theocode.md) |

**One domain, deliberately.** The measured import graph splits cleanly (`shared` is a leaf, `agent` sits above it, `tui`/`cli` above `agent`), but gate G3 refuses an item spanning two domains — and in a 12.6k-LOC repo four commits old, most items touch the core *and* a surface. The split (`agent-core` / `surfaces`) is described in `cycle-backlog.md § Domain routing`; the trigger is the first item that genuinely belongs to one and not the other, twice in a row.

### Outside routing

| Excluded | Reason |
|---|---|
| `agent-builder` (`../agent-builder`) | Sibling repo under the same umbrella, **with no domain registered in this install**. An item filed here against it routes to nobody — which is the correct outcome. |
| Theo platform repos (`theo`, `theo-cloud`, `theo-db`, …) | They have their own Squad install and their own routing table. |
| **`theokit`** (`@theokit/agents`, `@theokit/tui`, `@theokit/sdk`) | A **dependency**, not a repo governed by this install. The 10 gaps measured against it are in § Upstream below, **outside the item registry** — a `B-NNN` whose `repo` is not in the inventory violates gate G1. |

## Provenance of these items

The 17 items below derive from **one** cross-validation measured on 2026-08-07: 6 parallel reviewers, ground truth = the theokit API surface on disk, 98 findings carrying `file:line` on both sides.

- Report: [`.claude/knowledge-base/reviews/theokit-crossval-review-2026-08-07.md`](.claude/knowledge-base/reviews/theokit-crossval-review-2026-08-07.md)
- Raw findings: `.claude/agents/review-theokit-crossval-2026-08-07/findings/*.yaml`

Of the 98 findings: **71 actionable** (grouped into the 17 items below, 1:1 coverage with no orphan), **10 SDK gaps** (§ Upstream), **17 `ok` verdicts** — measured statements that nothing is wrong, which produce no item because there is nothing to fix.

They enter as `status: triaged` and `source: discover-review` because they already carry the evidence intake is not allowed to require (`cycle-backlog.md § Chain`).

---

### Second review — 2026-08-08

Items **B-019..B-051** derive from a second, independent pass: `/loop-code-review` over `packages/`, **185/185 files inspected**, 87 findings.

- Report: [`code-review-output/final_report.md`](code-review-output/final_report.md)
- Evidence database: `code-review-output/code-review.db` (every finding carries `file`/`line` as columns)

Of the 87 findings: **78 actionable** (the 33 items below, coverage asserted by script — every actionable id in exactly one item, no duplicate, no orphan) and **9 `info` clean verdicts** — measured statements that nothing is wrong, which produce no item because there is nothing to fix, exactly as the 17 `ok` verdicts above did.

They enter as `status: triaged` / `source: discover-review` for the same reason the first batch did: they arrive with the evidence intake is not allowed to require. The producer was `/loop-code-review`, not `/discover --sweep` — the value `discover-review` denotes the shape (a review sweep of our own code, evidence attached), and the actual producer is named here so the provenance is not overstated.

**`reopens: B-NNN`** appears on 11 of them. It is a provenance field in the family `cycle-backlog.md § Step 2` already sanctions (`supersedes:`, `regression_of:`), introduced here for a case neither covers: an item that was closed with a Definition-of-done bullet the code never satisfied. That is not a regression — it never worked — and it is not a supersession. Naming it precisely is the point: **7 of the 17 items closed on 2026-08-07 have unmet bullets, and the single `critical` finding of the second review is one of them.**

---

## Items

Next free id: **B-055**

---

## B-018 — Nineteen touched files still have no sibling test   [ ]

domain: theocode
repo: TheoCode
suggested_mode: evolve
source: human
evidence: `stop-validation.sh` TDD gate, run 2026-08-08 — 19 files listed, among them `hooks/hooks.ts`, `hooks/hook-trust.ts`, `tools/registry.ts`, `delegation/squad.ts`, `agent-session/composition-root.ts`
why_now: the repository went from 0 to 90 tests closing B-001..B-017, and the tests followed the DEFECTS — each one was written to reproduce a specific finding. That was the right order, and it leaves a different gap: files that were touched but never had a failing test written against them. The TDD gate has been listing them all along, as a warning underneath a BLOCK, which is precisely how an advisory goes unread.
status: raw
severity: MEDIUM
dod:
  - every file in the gate's list either has a sibling test or an explicit note saying why it does not (`theme.ts` is data; `vitest.config.ts` is config)
  - the hook gate's list is empty, or its remaining entries are ones a human decided to exempt
  - no entry is silenced by lowering the gate

---

## B-001 — The ACP surface registers a tool it cannot answer   [x]

fixed_in: abd9bf7

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `packages/agent/src/chat-acp.ts:25` → `packages/agent/src/chat.ts:419` (AC-01)
why_now: the 2026-08-07 cross-validation measured that `buildChatAgent()` is called without `surface`, falling through to the `'interactive'` default, which registers `request_user_input` against a bridge only the TUI subscribes to — every call stalls on the built-in's 5-minute timeout. `chat.ts:286` documents this very defect one screen above, and the ACP surface commits it anyway.
status: triaged
severity: BLOCKER
dod:
  - `chat-acp.ts:25` passes `surface: 'headless'`, the same value `run-composition.ts:57` uses
  - a test covers that the headless profile does NOT register `request_user_input`
  - the ACP surface is exercised and no tool call is left pending

## B-002 — Wrong identity exposed to the end user   [x]

fixed_in: c237f5a

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `context/instructions.ts:1`, `shared/agent.ts:9,12`, `tui/components/Banner.tsx:9`, `tui/theme.ts:45`, `tui/components/ConsentGates.tsx:71`, `chat.ts:224,237` (CI-001, CI-002, CI-003, CI-011, AC-02, AC-07, TIP-08)
why_now: measured 82 imports of `@theokit/agents` and **0** of `@theokit/sdk`, while the system prompt and the greeting tell the user the agent runs on `@theokit/sdk` as "Theokit Builder" — a product renamed to TheoCode in commit `b0fbda1`. Four of the six literals are rendered, including the dialog that asks for filesystem and command-execution permission.
status: triaged
severity: HIGH (4 HIGH findings)
dod:
  - `grep -rn "Theokit Builder" packages/` returns 0
  - no product or SDK string is hard-coded outside `shared/agent.ts`
  - the banner's model id stops being a divergent copy and reads the single source
  - comments citing `@theokit/sdk-pty`, `@theokit/sdk@>=4.2.10` and non-existent paths are corrected or removed

## B-003 — Session-GC deletion guards fail open, with no test at all   [x]

fixed_in: 21d315b

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `session/gc/filesystem.ts:104,127`, `session/gc/all-sessions.ts:51,303`, `session/session-ops.ts:59,61`, `session/gc/per-session.ts:56` (PS-001, PS-002, PS-004, PS-005, PS-016)
why_now: `filesystem.ts` swallows any read error on the live-session pointer and returns `undefined`, disarming both layers of the guard — while its sibling `per-session.ts:56-68` treats the same condition as fail-fast ("refusing to GC — would risk the live session"). And `hasLiveWriter`, a required field wired to the SDK's `sessionHasWriter`, is never called in the plan phase. That is ~740 LoC deleting user transcripts, with 0 tests, even though every options interface was designed as an injectable seam.
status: triaged
severity: HIGH (4 HIGH findings)
dod:
  - the four sites deriving `.theokit/tui-session` inline use a single `readPointerId` with the fail-fast posture
  - `hasLiveWriter` is invoked in the plan phase OR the required field is removed — a declared, never-called guard reads as protection
  - `liveSessionPaths` receives the three categories the SDK documents, not just the pointer
  - tests cover: `FLOOR_DAYS` refusal, pointer protection, `keepLast`, the lock/transcript sibling rule and the apply-phase backstop

## B-004 — Ask-bridge: promise abandoned without settling, typed error escaping   [x]

fixed_in: 99a2df2

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `ask/ask-bridge.ts:26,32-35,60,68`, `ask/concurrent-question-error.ts:4-15`, `ask/index.ts:1-4` (TIP-03, TIP-04, TIP-05, TIP-06, TIP-07)
why_now: `abandonar()` calls `pending.delete()` and discards the `resolve` captured in the closure — and `perguntar()` never captures `reject`, so there is no path to reject at all. ESC frees the UI and leaves the turn stalled for 5 minutes. In parallel, `createQuestionTool` only catches `err.message === "timeout"`, so `ConcurrentQuestionError` (Portuguese message) escapes as an exception and its `code` never reaches the model.
status: triaged
severity: HIGH (2 HIGH findings)
dod:
  - `abandonar()` settles the promise (rejecting with a typed error) and a test covers that ESC unblocks the turn
  - `ConcurrentQuestionError` is handled by the handler and its `code` reaches the model
  - `ConcurrentQuestionError` is exported from the entrypoint so `instanceof` is possible
  - `assinar()` either supports multiple subscribers or is renamed to what it is (single slot)

## B-005 — Consent store held to a weaker permission standard than the credential store   [x]

fixed_in: 0631f50

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `config/trust-store.ts:19,40`, `hooks/hook-trust.ts:73,81`, `hooks/hook-runner.ts:39` (SAC-01, SAC-11)
why_now: `~/.theokit/trusted-dirs.json` decides which directories are trusted **and** which hook command lines are pre-approved — and a hook is `spawn(cmd, {shell:true, detached:true})`. Neither reader checks permissions, and `mkdirSync(..., {mode:0o700})` is a no-op on an existing directory, with no `chmodSync` to repair it. The directory is shared with the SDK's transcript root, created without a mode: whoever gets there first sets the permissions. The SDK does the opposite for a store of comparable sensitivity (`assertSecureModes`).
status: triaged
severity: HIGH
dod:
  - the consent store's directory and file have permissions verified on read and repaired on write
  - a group/other-writable store is refused, not silently accepted
  - hook approvals and directory trust use the same canonical key (today one uses a raw string, the other a resolved path)

## B-006 — The two surfaces disagree on when it is safe to stop asking   [x]

fixed_in: dfd4e8f

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `tui/consent/use-approvals.ts:44` → `tui/consent/approval-mode.ts:13`; contrast with `config/approval-policy.ts:19-27`; `config/layers.ts:19`; `config/config.ts:46,202`; `config/trust-posture.ts:94`; `tools/registry.ts:76` (SAC-02, SAC-03, SAC-04, SAC-05)
why_now: headless refuses to auto-approve without an enforced sandbox, in writing ("refusing instead of claiming a confinement that does not exist"). The TUI auto-approves every tool under `full-auto` with no posture check — while the same screen renders `sandbox:<mode> ⚠ tool-gating` warning that confinement is absent. And `sandbox_mode`/`approval_policy` are last-wins scalars: `env` (50) and `project` (30) outrank the user's own file (20). The codebase already solved this risk once for `hooks` (`ACCUMULATING_KEYS`) and did not apply it to the two sandbox keys.
status: triaged
severity: HIGH (2 HIGH findings)
dod:
  - the TUI consults the posture before auto-approving, with the same refusal as headless
  - `sandbox_mode` and `approval_policy` gain a floor: a lower-precedence layer cannot be loosened by a higher one without explicit consent
  - `resolveTrustPosture` reads the injected env, not ambient `process.env`
  - a missing `ToolScope.sandbox` fails loudly instead of silently omitting the sandbox

## B-007 — Credential failure degraded to an empty string   [x]

fixed_in: 47eced3

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `chat-acp.ts:19`, `tui/agent-session/credential-helpers.ts:20`, `auth/credentials.ts:40,55,342` (AC-03, SAC-06, SAC-08, SAC-10)
why_now: a typed credential error becomes `apiKey: ''`, turning "I could not authenticate" into a request that fails later with an irrelevant message — a direct violation of Unbreakable Rule 8 (fail loud, fail clear). On top of that, `ensureAuthHome` mutates the environment object it receives, and the `openai-chatgpt/` route passes `env: {}`, discarding more than it intends.
status: triaged
severity: HIGH
dod:
  - credential failure propagates a typed error; no path returns an empty bearer
  - `ensureAuthHome` does not mutate its argument
  - the route forcing the file store does not discard variables beyond the intended ones

## B-008 — Two hook execution paths active with asymmetric gating   [x]

fixed_in: 5ca3839

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `chat.ts:281`, `config/trust-posture.ts:54-58`, `hooks/hook-trust.ts:34`, `hooks/hooks.ts:381,391` (AC-04, AC-11)
why_now: `.settingSources(['project','user'])` enables hooks from `.theokit/hooks.json` through the SDK path, and the SDK states this twice in its own docs. TheoCode's hooks pass a second gate — a per-hook sha256 fingerprint whose whole purpose is catching a hook whose command changed after approval. The SDK path does not pass that gate, and the trust catalog does not know it.
status: triaged
severity: HIGH
dod:
  - both hook paths pass the same fingerprint gate, or the asymmetry is recorded in an ADR with justification
  - `trust-posture.ts` describes the real scope of the `subagents`/`hooks` capability
  - a throwing PostToolUse hook does not lose its `block` decision to a stderr note
uncertainty: rests on the SDK's security docstring, not on an observed spawn. If the docstring is stale, this degrades to a documentation defect.

## B-009 — `interactive_shell` forks the SDK schema instead of wrapping it   [x]

domain: theocode
repo: TheoCode
suggested_mode: evolve
source: discover-review
evidence: `ask/interactive-shell-tool.ts:49-78` vs `sdk-tools/index.js:1014-1034` (TIP-01)
why_now: the SDK's Zod schema and handler body were copied verbatim, with a single divergence (`:74`); the SDK factory is called only to harvest `.name`/`.description` and the object is discarded. Result: the description shown to the model comes from the SDK while the schema is a frozen copy — `cwd`/`ttl_ms`/`cols`/`rows` already exist in `StartInteractiveOptions` and will drift silently. The motivation is legitimate and recorded (see § Upstream U-2); the form is not.
status: triaged
severity: HIGH
status_note: CLOSED. U-2 was fixed at the source and released as `@theokit/sdk-tools@0.26.2`; this
  package now resolves it, the fork is gone (74 lines to 26), and a test asserts the behaviour the
  fork existed to provide. Verified by reverting the fix in the installed dist: the test goes red,
  so it detects the regression rather than passing by accident.
dod:
  - the tool wraps the SDK's instead of forking schema and handler
  - the divergence that motivated the fork is isolated at a single point
  - U-2 fixed upstream — DONE (`theokit-sdk`, changeset `interactive-cap-keeps-its-fields`)

## B-010 — A packaging contract that was never executed   [x]

fixed_in: 4c66742

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `tools/build-cli.mjs:46`, `packages/tui/package.json:11,18,21`, `packages/cli/package.json:11`, `packages/agent/package.json:9,15,21`, `README.md:16` (CI-004, CI-005, CI-006, CI-007, CI-008, F-tui-1, F-tui-10)
why_now: both declared bins break on first invocation, from two cumulative causes — neither entrypoint has a shebang (the shell runs it as a script and `import` resolves to the ImageMagick binary, reproduced), and even forcing `node` it is raw TypeScript (`ERR_MODULE_NOT_FOUND`). The build resolves `@theokit/sdk` without declaring it, working only via hoisting and degrading silently. `figlet` is installed with no consumer. Four subpath exports have no consumer. The README claims an enforceability that `tsconfig.json` undoes.
status: triaged
severity: HIGH (2 HIGH findings)
dod:
  - `npx theocode --help` and `npx theocode-exec --help` work from a clean checkout, OR the bins are removed while the packages remain `private`
  - `@theokit/sdk` is declared where it is resolved, or the resolution is removed
  - `figlet` is used (via `renderFigletArt`) or removed; `lowlight` stays and `preloadHighlighter` starts being called
  - subpath exports with no consumer are removed or consumed
  - the README's enforceability claim is corrected or made true (an import rule in dependency-cruiser, already installed)

## B-011 — The TUI reimplements components `@theokit/tui` already ships   [x]

domain: theocode
repo: TheoCode
suggested_mode: evolve
source: discover-review
evidence: `tui/components/Banner.tsx`, `ConversationRegion.tsx:117`, `ConversationSlot.tsx`, `InputSlot.tsx`, `commands/registry.ts`, `backtrack/BacktrackOverlay.tsx`, `consent/pending-approvals.ts` (F-tui-2, F-tui-3, F-tui-4, F-tui-5, F-tui-6, F-tui-7, F-tui-8, F-tui-9)
why_now: `Banner.tsx` rewrites the `WelcomeBanner` whose docstring **literally names** the two headings written by hand. `/diff` runs `git diff HEAD` and dumps the raw unified diff into a single `<Text>` — no color, no folding, no scroll — while `DiffViewerProps.patch` is documented as taking exactly that shape, and `Pager` exists unused. The approval ledger (97 LOC) duplicates `findPendingApproval` with divergent ordering, and the approval shape is declared in three places.
status: triaged
severity: HIGH
dod:
  - `/diff` uses `DiffViewer`; long panels use `Pager`
  - the approval shape has a single declaration, aligned with the SDK's
  - `Banner` adopts `WelcomeBanner` for what it covers; the remainder is gap U-7, reported upstream
  - `BUILTIN_COMMANDS` uses the exported `SlashCommand` type, not an anonymous shape
status_note: PARTIAL. Closed: `/diff` renders through `DiffViewer` (F-tui-3, F-tui-4), the
  slash-command list uses the SDK's `ChatComposerCommand` (F-tui-5), and the third copy of the
  approval shape is gone (F-tui-9) — commits 91a2db8, 0107f8a.
  .
  The Banner (F-tui-2) is DONE, on the third attempt. Gap U-7 was fixed upstream and released
  (`@theokit/tui@0.50.0` adds `art` to `WelcomeBanner`), but adopting it revealed the fix is
  incomplete: with an `aside` present the main column is `flexGrow={1}` with no width reserved for
  the art, so a ~38-column wordmark is compressed and the tagline/hints are pushed out of frame.
  Measured with a render probe, not guessed. `Banner.test.tsx` now locks the current output, so a
  second attempt has a baseline that fails loudly instead of degrading quietly. The remaining
  upstream work is U-7b: `WelcomeBanner` must size the art column when an aside is present.
  .
  The approval ledger (F-tui-8) and the selection windowing (F-tui-7) still wait on the timing
  question below.
resolved_uncertainty: the reviewer could not determine whether the approval ledger was load-bearing,
  since it depends on how fast the SDK mutates `thread`. Settled by test: it is. See
  `packages/tui/src/consent/pending-approvals.test.ts`.

## B-012 — Persistence: adopt the SDK primitives and clear casts and dead surface   [x]

fixed_in: 30724a2

domain: theocode
repo: TheoCode
suggested_mode: evolve
source: discover-review
evidence: `session/backtrack.ts:20,25,33,40,52`, `session/agent-list.ts:29`, `session/atomic-write-temp.ts:5`, `tui/persistence/goal-store.ts:28` (PS-003, PS-006, PS-007, PS-008, PS-009, PS-010, PS-015, PS-017)
why_now: `parseTranscript` reimplements `loadJsonl`, including the "tolerate a truncated last line" behaviour the SDK exposes as a flag, and throws a bare `SyntaxError` where the SDK throws `JsonlParseError` with a line number. Every backtrack read loads the whole transcript to show a few lines, with `readJsonlTail` available. A stale cast (PS-006) undoes the very type the SDK started declaring in order to remove it. `CursorNotDrainedError` is unreachable because the adapter drops `nextCursor` before the guard. Six exported symbols have zero call sites.
status: triaged
severity: HIGH
dod:
  - `loadJsonl` / `readJsonlTail` adopted where they fit; the triplicated `compact_boundary` scan becomes one function
  - the `message.content` cast is removed and the SDK union narrows on its own
  - `CursorNotDrainedError` observes what the SDK actually returns, or is removed
  - symbols with no call site are removed or gain the tests that justify them
  - `atomic-write-temp.ts` is wired or removed — today the safer logic is the one nobody runs

## B-013 — Floating promises with no handler can bring down the TUI   [x]

fixed_in: 0de64ef

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `tui/persistence/session-store.ts:17`, `tui/persistence/use-goal-run.ts:23`, `tui/terminal-io/write-queue.ts:5-12` (PS-011)
why_now: `enqueue` attaches `catch` to the tail it stores, not to the promise it returns — so the rejection reaches the `void` with no handler. `atomicWriteText` genuinely rejects (ENOSPC, EACCES, EROFS, EXDEV), and the declared engine is `node >=22`, whose default is `--unhandled-rejections=throw`. A failed pointer write would kill the TUI instead of degrading.
status: triaged
severity: MEDIUM
dod:
  - both sites handle the rejection, surfacing a toast/stderr line
  - a test simulates a failing write and proves the TUI survives
uncertainty: the crash claim rests on Node's default for the declared engine; the TUI was not run under a failing-write condition.

## B-014 — Sandbox mode change does not reach live PTYs   [x]

fixed_in: 4f5e1ff

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `pty/session-pty-owner.ts:44-59`, `chat.ts:102`, `tui/agent-session/composition-root.ts:75` (TIP-09)
why_now: `setMode` changes the wrap for future sessions only, and `rotate()` is called only on session reset — a `bash -i` started under `danger-full-access` survives the switch to read-only. Mitigated today by `interactive_shell`/`write_stdin` being approval-gated.
status: triaged
severity: MEDIUM
dod:
  - changing the mode terminates or re-wraps live PTYs, or the limitation is documented and surfaced to the user at switch time
  - a test covers the danger→read-only transition with a live session

## B-015 — Structural debt in `chat.ts` and in surface composition   [x]

fixed_in: 2c2d094

domain: theocode
repo: TheoCode
suggested_mode: evolve
source: discover-review
evidence: `chat.ts` (`process.cwd()` at 6 sites, `withShellAndProjectEntities`), `tui/agent-session/chat-transport.ts`, `hooks/hooks.ts:~220` (AC-05, AC-06, AC-09, AC-10)
why_now: `buildChatAgent` reads `process.cwd()` at six independent sites while the CLI composition root injects the directory — two sources of truth for one fact. Four composition sites build the agent with four different argument sets, which is the condition that produced B-001. `withShellAndProjectEntities` does far more than its name claims (SRP).
status: triaged
severity: MEDIUM
dod:
  - the working directory has a single, injected source
  - the four composition sites converge on a common path with an explicit per-surface profile
  - `withShellAndProjectEntities` is decomposed or renamed to what it does
  - `hooks.ts` imports move to the top of the file

## B-016 — Dead surface and orphan test affordances   [x]

fixed_in: 4f5e1ff

domain: theocode
repo: TheoCode
suggested_mode: evolve
source: discover-review
evidence: `hooks/hooks-test-helpers.ts`, `tools/registry.ts:53-84`, `ask/ler-ate.ts:1-34`, `ask/interactive-shell-tool.ts:8,26,45`, `config/config.ts:31`, `ask/ask-bridge.ts:22,32,41,60` (AC-08, TIP-10, TIP-11, TIP-12, TIP-13, TIP-18, TIP-19, SAC-12)
why_now: the repository ships `hooks-test-helpers.ts` and injection seams built in `session-pty-owner.ts:25-26` — fixtures for a suite that does not exist. `withDefaultGuidance`/`DEFAULT_TOOL_GUIDANCE` cover the failure codes of 6 of the registry's 9 tools and have zero consumption. `lerAte`/`Drenavel` have no caller and throw bare `Error`, contradicting the neighbouring file. TheoCode's `AgentConfig` collides by name with the SDK's exported `AgentConfig`.
status: triaged
severity: MEDIUM
dod:
  - `/code-quality` reports no `dead_code_unallowlisted_typescript` in this scope
  - symbols with no caller are removed or gain a consumer/test
  - the SDK's error guidance is consumed, or the decision not to becomes an ADR
  - the local type stops colliding by name with the SDK export

## B-017 — Repository hygiene   [x]

fixed_in: 0de64ef

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `.gitignore:62-63`, `.prettierignore:9`, `CHANGELOG.md` (CI-009, CI-010, CI-012)
why_now: `.gitignore:62-63` carries the self-cancelling pair `.theocode/` followed by `!.theocode/`; `git check-ignore -v .theocode/sessions/x.json` confirms **not ignored**, contradicting the comment right above declaring it local runtime state. `.prettierignore` ignores a non-existent file. `CHANGELOG.md` was created alongside this registry (that part is already resolved).
status: triaged
severity: MEDIUM
dod:
  - `git check-ignore` confirms `.theocode/` runtime state is ignored while preserving `config.example.toml`
  - `.prettierignore` references no non-existent files
  - `CHANGELOG.md` is maintained on every change (Unbreakable Rule 6)

---

## Upstream — gaps measured in theokit

**These are not items in this registry.** The `theokit` repo is not in this install's inventory, and a `B-NNN` whose `repo` does not route violates gate G1 (`cycle-backlog.md § Hard gates`). They live here as a queue of work against theokit, with the evidence already measured.

Ownership note: TheoCode and `theokit-framework/*` share a maintainer, so these are **fixed at the source**, not merely filed and forgotten.

| # | Gap | Evidence | Status |
|---|---|---|---|
| U-1 | No session garbage-collection or retention primitive. An exhaustive grep for `gc\|prune\|cleanup\|sweep\|purge\|retention` across both packages' public and internal `.d.ts` returns only in-memory pooling and `Task.retentionMs`. The barrel exports every ingredient and no collector; the never-delete rule `forkTranscript` internalises is re-derived by hand in the consumer | `agents/persistence.d.ts:1`, `transcript-ops.d.ts:12-19` (PS-012) | open |
| U-2 | `toErrorJson` matched the superclass first and discarded `max`/`liveSessionIds` from `MaxSessionsError` — the fields `sdk-pty`'s docblock says exist "by design" | `sdk-tools/index.js:1006`, `sdk-pty/index.d.ts:33-37` (TIP-02) | **fixed** — structural check ahead of the superclass branch (`theokit-sdk`, changeset `interactive-cap-keeps-its-fields`); **released as 0.26.2** |
| U-3 | `ToolsetError extends Error`, outside the `TheokitAgentError` hierarchy — the SDK argues against this itself elsewhere | `agents/index.d.ts:824`, `bridge-entry:2162` (TIP-15) | **fixed upstream, unreleased** — `theokit` commit `92b962ad`, changeset `toolset-error-joins-the-hierarchy`. The argument was already written in that package (M61 unified two `ConfigurationError` classes for the identical reason) and simply had not been applied. Consequence here: `translateError()` in `tools/registry.ts` exists only to bridge the gap and can be deleted on the next `@theokit/agents` bump — NOT before, since 7.4.0 predates the fix and removing it now would change which error type callers see |
| U-4 | `assertSecureModes` is private — consumers cannot apply the same permission check to their own store | (SAC-01) | open |
| U-5 | `@theokit/agents/auth` omitted the OAuth engine that `@theokit/sdk/auth` exports | (SAC-07) | **fixed and released** — `@theokit/agents@7.4.0`. The four engine symbols now cross over; `resolveCredential` deliberately stays out, locked by a test. The other half of SAC-07 (a re-declared `ResolvedCredential`) is NOT a defect: the SDK generalises to `provider: string` by design and this application narrows it to `Provider` for exhaustiveness — recorded in the type's own docstring |
| U-6 | No export answers "what may this sandbox mode write?" — hence a second oracle over the SDK's own three-mode vocabulary | (SAC-09) | open |
| U-7 | No component composes ASCII art with a right-hand aside: `WelcomeBannerProps` has no `art`, `BannerProps` has no `aside` | `tui/index.d.ts:938-945`, `:1442-1458` (F-tui-11) | open |
| U-8 | `StatusFooterProps.mode` is a closed three-value union that does not cover the consumer's real modes | (F-tui-12) | open |
| U-9 | `FreeTextInput` has no masked/secret mode, forcing 60 LOC of hand-rolled masked input | (F-tui-13) | open |
| U-10 | `WindowView` reports overflow as booleans, and `readJsonlTail` returns no absolute index — both force re-derivation in the consumer | `transcript-ops.d.ts:57-73` (F-tui-14) | open |

### Decision to record (not an item, not a gap)

**AC-13 — no guardrails wired** (`chat.ts:311`, SDK at `agents/index.d.ts:229`). The SDK offers `promptInjectionDetector`, `piiDetector`, `runInputGuards`, `outputModeration` and `costGuard`; TheoCode uses none. The reviewer measured and concluded that **for three of the five detectors, not wiring them is the correct call** in a local terminal agent — the user is the operator, not an untrusted third party.

It does not become a `B-NNN` because there is no defect to fix, and it does not become an upstream issue because the SDK ships what it should. It becomes an **ADR**: the choice is made in fact and unrecorded, so the next maintainer cannot tell decision from oversight. The ADR should name which two detectors were left out without a measured justification.

---

## B-019 — Hook-approval store is read without the permission gate B-005 installed   [x]

fixed_in: c468809
dod_verified:
  - one gated reader — `grep readFileSync packages/agent/src` shows a single read of TRUST_STORE (trust-store.ts:92); the copy in hook-trust.ts is gone
  - refusal covered — `test_a_group_or_world_writable_store_is_refused` was RED before the fix, and restoring the ungated reader turns 3 of 5 tests red (mutation)
  - directory checked — `assertNotWritableByOthers(dirname(store), 0o002, ...)`; narrowed to world-write on measurement (umask 002 yields 0775; ~/.theokit is 0775 on a real machine), covered both ways by two tests

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #68, #79 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-005
why_now: The 2026-08-08 review measured that `assertPrivate()` landed in `trust-store.ts` `lerDocumento()` while `hook-trust.ts:74` keeps its own `readStore()` on the SAME file with a bare `readFileSync`. Directory trust is gated; the hook-approval set is not — and that set decides which command lines reach `spawn(cmd, {shell:true, detached:true})` (`hook-runner.ts:39`). B-005's own docstring names hook execution as the threat it defends, and B-005's own `evidence` field already cited `hooks/hook-trust.ts:73,81`. `assertPrivate` is module-private, which is why the second consumer duplicated the read instead of reusing the gate.
status: triaged
severity: CRITICAL
dod:
  - every reader of TRUST_STORE goes through one gated reader — proven by grep returning a single `readFileSync` of that path
  - a group/world-writable store makes `loadApprovedHooks` refuse, covered by a test that fails on the current code
  - the gate validates the containing directory's mode, not only the file's

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-020 — The session collector resolves every unknown toward 'delete'   [x]

fixed_in: b1611fc
dod_verified:
  - unreadable directory / unstat-able cwd / unstat-able transcript each yield UNDETERMINED — three tests in `gc/fail-open.test.ts`, all RED before the fix
  - keepLast protects the newest N of a DEAD project — RED before the fix, with an anti-vacuity floor asserting a DEAD project still collects beyond the slice
  - a run that could not list any project reports the error — RED before the fix (`errors` was empty and the renderer printed "nothing to collect")
  - **bullet 4 REFUTED, not met.** It read "listagemPadrao forwards nextCursor". `@theokit/agents` narrows `Agent.list` to a non-paginated overload (`ListOptionsSemPaginacao`: `limit?: never; cursor?: never`) returning `Omit<ListResult, 'nextCursor'>` — the field does not exist on that surface, so forwarding it would have been fabricating one. The guard is documented as currently unreachable and kept as an SDK-upgrade tripwire, covered by two tests through the injected seam. The DoD was written from the finding's premise; the source refuted it.

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #69, #70, #71, #72, #73, #81, #85, #86 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-003, B-012
why_now: Five independent swallowed-error sites on the only code path that deletes user data all fail in the same direction. `dfsExistencia` continues past an unreadable directory and returns NAO_ACHOU -> MORTO; `ehDiretorio` maps any statSync failure to false -> MORTO; `listRealProject` maps any statSync failure to mtimeMs=0, which is infinitely old AND sorts last so `keepLast` cannot protect it; `resolverGuardas` returns an EMPTY protection set for MORTO, so `--keep-last` has no effect on exactly the projects the collector deletes from; and `listagemPadrao` drops `nextCursor` so the registry guard is page one. `classifyDirectory` already has INDETERMINADO for 'I cannot tell' and uses it on one branch only. Both existing tests force VIVO or keepLast:0, so a green suite cannot see any of it.
status: triaged
severity: HIGH
dod:
  - an unreadable directory, an unstat-able cwd and an unstat-able transcript each produce INDETERMINADO, never MORTO — one failing test per site
  - `keepLast` protects the newest N transcripts in a MORTO project, covered by a test that fails today
  - a collector run that could not list any project reports an error rather than `nada a coletar`
  - `listagemPadrao` forwards `nextCursor`, so `CursorNotDrainedError` can fire

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-021 — Three security gates are optional parameters whose default is fully open   [x]

fixed_in: 9574463
dod_verified:
  - the three parameters are required — proven by a never-invoked function whose two `@ts-expect-error` directives `tsc` must find NECESSARY; with the parameters optional again tsc reports both as unused, which was the RED
  - a matcher-scoped hook no longer fires for an empty tool name — covered by running the hook for real and checking the marker file it writes, with a floor asserting an unscoped hook still runs

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #74, #77 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-008
why_now: `buildHookHandlers(opts.approved?)` installs every parsed spec with no sha256 fingerprint check when the argument is omitted — the gate B-008 exists to enforce. `OpcoesApplyAll.hasLiveWriter?`/`readPointer?` make the apply-phase TOCTOU backstops opt-in, and `backstopRefusal` returns undefined outright when `hasLiveWriter` is absent. `resolveHeadlessApproval(policy, posture?)` returns `approved:true` for full-auto when `posture` is omitted, skipping the enforced-sandbox refusal that is its stated purpose. Callers pass them today, so nothing is broken now — the defect is that the TYPE permits the unsafe call and the default branch is the permissive one. The sibling `OpcoesPlanoAll.hasLiveWriter` is required, which shows the correct polarity was already known here. Separately, `appliesTo` returns true for an empty tool name, so a matcher-scoped hook fires out of scope.
status: triaged
severity: HIGH
dod:
  - the three parameters are required, or their absent-value branch is the refusing one — typecheck fails on the unsafe call
  - a hook with a matcher does not fire for an empty tool name, covered by a failing-first test

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-022 — Every documented CLI invocation carries an `exec` subcommand the parser never routes   [x]

fixed_in: aae39cb
dod_verified:
  - `theocode sessions gc` routes to the collector — one test per documented invocation, plus a floor asserting a bare prompt still runs a turn
  - the third test parses USAGE itself and fails on any taught token the parser does not route, so the next drift of this shape is caught by the suite

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `code-review-output/code-review.db` findings #6 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: All five USAGE lines in `args.ts:59` teach `theocode exec <sub>`; the parser has no `exec` branch, so the token becomes the PROMPT. Following the CLI's own documentation fires a billable model turn instead of running `sessions gc` / `review` / `goal`. Reproduced by running the parser: `exec sessions gc` yields `mode=run, prompt="exec sessions gc"`. `README.md:32` shows the correct form, so the drift is in the text the user is shown at the moment they are already wrong.
status: triaged
severity: HIGH
dod:
  - `theocode exec sessions gc` either runs the collector or exits with a usage error — never starts a model turn
  - a test asserts the parser's behaviour for each of the five documented invocations

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-023 — Five CLI flags are parsed and then silently discarded, and there is no --help   [x]

fixed_in: 6c0a04b, 0eb61e2
dod_verified:
  - each flag changes behaviour or is rejected — one RED test per flag (`--uncommitted` reaching the target, `--last` and `-m` rejected off-command), plus a floor asserting `--base`/`--commit` still work
  - `theocode --help` exits 0 and prints usage — `help` is its own mode; it used to be reachable only through the error path
  - the fifth finding (`-C/--cd` not reaching `.env`) shares a root cause with B-026 and was fixed there, in one commit rather than split across two

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #7, #8, #9, #10, #20 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `--uncommitted` is parsed and validated but never reaches the review target; `-m/--model` and `-o/--output-last-message` are documented globally but ignored by `review` and `sessions`; `--last` is accepted outside `resume` and ignored; `-C/--cd` does not affect .env resolution; and there is no `--help`/`-h` at all — the usage text is reachable only by triggering an error. A flag that parses and does nothing is worse than an unknown flag, which at least errors.
status: triaged
severity: MEDIUM
dod:
  - each flag either changes behaviour or is rejected where it does not apply — one test per flag
  - `theocode --help` exits 0 and prints usage

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-024 — cli/run-composition carries a dead seam, a dead parameter and a dead return field   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #11, #12, #15 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `composeRun`'s `CompositionSeams` parameter has no caller and no test — the injection seam built for testability is itself untested and unused. `baseInstructions` is accepted but no caller can supply it. `RunComposition.cfg` is computed and returned and never read. Three separate pieces of scaffolding for a use that never arrived.
status: triaged
severity: MEDIUM
dod:
  - each of the three is either exercised by a test that would fail without it, or deleted
  - `npm run lint` still passes and the CLI behaviour is unchanged (no behaviour is in scope here)

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-025 — packages/cli ships 1292 LOC and zero tests, including a 329-LOC pure parser   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #13 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: The argument parser is pure, has no I/O, and decides whether a command runs or a billable model turn starts (see the `exec` drift). It is the cheapest possible thing to test and has no test at all. DISTINCT FROM B-018, which is scoped to the 19 `packages/agent` files the TDD gate lists because they were TOUCHED during the B-001..B-017 remediation: `packages/cli` was never touched, so it is in neither the gate's list nor B-018's DoD. Working B-018 to completion leaves this untouched, and vice versa.
status: triaged
severity: MEDIUM
dod:
  - the parser has a test covering every subcommand and every documented flag
  - the suite fails if the `exec` routing regresses

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-026 — CLI bootstrap statements interleaved with ESM imports run after every import   [x]

fixed_in: 0eb61e2
dod_verified:
  - the bootstrap runs inside `main`, after `chdir` — so `.env` belongs to the directory `-C` selected
  - covered by a STRUCTURAL test that says so in its own docstring, because the end-to-end route needs a non-sovereign observable variable and none exists on a command that makes no model call. The first attempt used `THEOKIT_HOME`, which `project-env.ts:2` deliberately makes non-overridable from a project `.env`; that test could not fail and was discarded rather than kept
  - detection power verified by mutation: one bootstrap call back in the import block turns it red

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #14 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `main.ts:8` places bootstrap statements between import declarations, which reads as ordered setup but is not: ESM hoists every import and evaluates all of them before any statement runs. Any import with a side effect that depends on the bootstrap sees the pre-bootstrap state. The intent expressed by the source order is not the intent achieved.
status: triaged
severity: MEDIUM
dod:
  - bootstrap runs before any module that depends on it, proven by a test that observes the ordering
  - or the ordering dependency is removed and the source no longer implies one

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-027 — The `Blocked <cmd>` policy-veto rendering can never fire   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #2 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `vetoReason()` is unreachable on three independent counts: it bails on `'ok' in p` and every SDK tool result carries `ok`; it reads `p.exitCode` where results use `exit_code` (the sibling at `:189` gets it right); and nothing in repo or SDK produces exit code 126. The hook veto path DOES fire, so the user loses the one signal built to tell them a hook blocked their tool.
status: triaged
severity: HIGH
dod:
  - a hook-vetoed tool call renders `Blocked`, covered by a test that fails on the current code
  - or the feature is deleted along with its docstring — not left half-alive

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-028 — The `!` shell shortcut is documented in the help panel and never wired   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #24 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `ConversationSlot.tsx:150` documents `!` = 'Run a shell command'. `ChatComposer` never receives `onShellCommand`, and the SDK gates the feature on that prop, so `!npm test` is sent to the model as prose. The capability is fully present — `ptyOwner`, `run_shell`, `/ps`, `/stop` all exist — only the wiring is missing, which makes this a wire-up rather than a feature.
status: triaged
severity: HIGH
dod:
  - `!cmd` runs a shell command, covered by a test asserting the composer receives the handler
  - or the line is removed from the help panel

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-029 — Esc-rewind arms with total=0 and previews=[]: the backtrack feature is dead   [ ]

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: `code-review-output/code-review.db` findings #30, #53, #60, #65, #67 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `primeBacktrack` calls `setRewindPrimed(true)` BEFORE `setRewindCount`/`setRewindPreviews`, and the adapter builds the ladder inside `setRewindPrimed` — so it captures unset state. Verified by execution, not by reading: a probe returning 3 previews prints `{"armed":true,"nth":-1,"total":0,"previews":[]}`. The overlay returns null on the empty list so nothing draws, and the second Esc emits `reset-backtrack`. Around it: `resetBacktrack()` has no caller, `confirmBacktrack`'s post-fork statements sit in a try with no catch while the caller voids the promise, the instructions render in Portuguese and the toast for the same keypress in English, and the existing test asserts `length > 0` where the contract is 'you lose the partial line and nothing else'.
status: triaged
severity: HIGH
dod:
  - arming the rewind yields the real turn count and previews, covered by a test that fails on the current ordering
  - a failure inside `confirmBacktrack` after the fork is surfaced, not voided
  - the backtrack test asserts the exact expected turn count, not `> 0`
  - the feature's user-visible strings are in one language

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-030 — A docstring justifies an export by citing a test and an ADR that do not exist   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #1 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `coalesced-memo.ts:11` cites `test_the_clock_is_monotonic_non_decreasing` and `ADR-0023` as the reason an export must stay. Neither exists anywhere in the tree. The comment pre-emptively disarms the dead-code detector, so the export survives on the strength of an artifact nobody checked — the same shape as a fabricated citation in a plan, at the code level.
status: triaged
severity: HIGH
dod:
  - the cited test exists and fails when the export is removed, or the citation and the export are both deleted
  - a check exists that would catch the next docstring citing a non-existent test path

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-031 — B-013's fireAndForget reached 2 of 5 persist call sites   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #29 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-013
why_now: The remediation's own docstring says 'the two persistence calls'; there are five. Protected: the startup path (`session-store.ts:18`) and the goal store (`use-goal-run.ts:24`). Unprotected: `composition-root.ts:75, 84, 89`, which are `/new`, `/clear`, `/fork`, the Esc-interrupt and the backtrack confirm — the hot paths. Those hand a bare `void` to a promise whose rejection is uncaught by construction (`write-queue.ts:10` catches the stored tail, `:12` returns the uncaught one) under `node >=22`, where the default is `--unhandled-rejections=throw`. B-013's `fixed_in` commit touched none of the three files its own evidence field named.
status: triaged
severity: HIGH
dod:
  - all five persist call sites route through the reporting wrapper — proven by grep finding no bare `void persist`
  - a rejected persist on the `/new` path is reported and does not crash the process, covered by a test

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-032 — B-015's single injected working directory was applied to packages/agent only   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #27, #39, #47, #54 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-015
why_now: `squad.ts:49` still calls `resolveToolScope(..., process.cwd())` and `TeamContext` has no `cwd` field, so `delegate_to_team` escapes the injection — and `resolveToolScope` derives both `writeRoot` and the sandbox `workDir` from that argument, which makes this the one bypass with a confinement consequence. The TUI half was never done: it re-resolves config and posture ambiently at 7 sites and `TuiRoot.initialPosture`, the seam built for exactly this, has no reader. `ConsentGates.tsx:71` re-derives `process.cwd()` twice (latent — the root is itself `process.cwd()` today). `withShellAndProjectEntities` was neither decomposed nor renamed, which was also a B-015 bullet.
status: triaged
severity: HIGH
dod:
  - `delegate_to_team` confines a worker to the injected cwd, covered by a test that fails on the current code
  - `TuiRoot.initialPosture` has a reader, or is deleted
  - grep finds no `process.cwd()` in the TUI outside the composition root

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-033 — B-006's injected-env seam is unreachable from any caller   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #26, #40 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-006
why_now: The `env` parameter was added to the PRIVATE `trustOrigin`; the only exported entry calls it with two arguments, so all 10 production call sites read ambient env. The disagreement is reachable today: `run-composition.ts:38` takes the posture from ambient env while `:42` passes `seams.env` into config resolution — the same run, two sources. Adjacent and same fix unit: an injected trust posture does not reach config resolution at all, and `effectiveConfigUnderPosture`, which exists for that, is dead.
status: triaged
severity: HIGH
dod:
  - `resolveTrustPosture` accepts an injected env from its exported entry, covered by a test that fails today
  - the two reads in `run-composition.ts` come from one source
  - `effectiveConfigUnderPosture` has a caller or is deleted

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-034 — B-007's credential route still discards THEOCODE_HOME, and ensureAuthHome still mutates   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #3, #28, #31 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-007, B-004
why_now: `credentials.ts:360` forces the file store with `env: {}`, which discards THEOCODE_HOME — the variable that LOCATES that store. The result is asymmetric and user-visible: the first resolution finds the credential, the routed second one does not. `git show 47eced3 --stat` proves the commit named as the fix never touched `credentials.ts`. `ensureAuthHome` still mutates its argument, also a B-007 bullet. Same file, same class as B-004: `MissingCredentialError` is unreachable by consumers — the sibling instance of the defect B-004 fixed once.
status: triaged
severity: HIGH
dod:
  - the forced-file-store route preserves THEOCODE_HOME, covered by a test that fails on the current code
  - `ensureAuthHome` does not mutate its argument
  - `MissingCredentialError` is reachable by a consumer, or removed

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-035 — subscribe() is a single-slot setter, and the test named after that guarantee cannot fail   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #35 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-004
why_now: The B-004 bullet asked that `assinar()` either support multiple subscribers or be renamed to what it is. Neither happened. Worse, `ask-bridge.test.ts:95` — `test_a_second_subscriber_does_not_silently_replace_the_first` — asserts `first.calls + second.calls > 0` and that `second` was called. Both hold PRECISELY when the first subscriber IS silently replaced; `first` is never asserted on. The comment directly above states the intent the assertions fail to encode. A vacuous test is worse than a missing one: the missing test shows up in the gate output.
status: triaged
severity: MEDIUM
dod:
  - the test fails when a second subscribe replaces the first — verified by mutation, not by reading
  - `subscribe` supports multiple listeners or is renamed to `setListener`

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-036 — B-012: the compact_boundary window scan is still triplicated and readJsonlTail unadopted   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #36, #42 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-012
why_now: Both were explicit B-012 bullets and neither was done. `countUserTurnsInWindow` is an exported function with no caller and no test, which is the third copy still standing.
status: triaged
severity: MEDIUM
dod:
  - the window scan exists in exactly one place — proven by grep
  - `readJsonlTail` is the reader used on that path, or the plan records why it is not
  - `countUserTurnsInWindow` has a caller or is deleted

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-037 — B-003 left a dead, divergent second copy of the deletion-path pointer guard   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #41 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-003
why_now: `per-session.ts:55` `resolvePointerId` is a second copy of the pointer guard that B-003 unified — dead, and divergent from the surviving one. A dead copy that has drifted is the worst kind: the next reader cannot tell which is authoritative, and the class of bug B-003 fixed can be reintroduced by copying the wrong one.
status: triaged
severity: LOW
dod:
  - one pointer-reading implementation exists on the deletion path — proven by grep
  - the deletion path's behaviour is unchanged, covered by the existing GC tests

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-038 — B-016: hooks-test-helpers.ts is still a fixture file for a suite that does not exist   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #44 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
reopens: B-016
why_now: The B-016 bullet asked for this to be resolved. The fixture file remains and the suite it was written for was never created, so the file is dead weight that reads as coverage.
status: triaged
severity: LOW
dod:
  - the helper file supports a real suite, or is deleted
  - no test file imports a helper for a suite that does not exist

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-039 — The stderr guard can silently discard every diagnostic the TUI emits   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #58, #61, #62, #63 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `stderr-guard.ts:17` has an empty `catch` and returns true unconditionally, and `mkdirSync` failure is already commented as 'guarded writes below will no-op'. This is the SOLE output channel of the B-013 remediation (`fire-and-forget.ts:22` defaults `report` to `process.stderr.write`), of hook-approval failures, and of the backtrack fork trace. On a non-writable cwd the TUI runs with every diagnostic dead and nothing says so. `shared/diagnostic-sink.ts:24-29` already solves the identical problem by falling back to stderr, and the pre-guard writer is held at `:7` and unused for this. Around it: the log is rotated once at startup and never again so a long session grows past CAP_BYTES unbounded; `rotate()` justifies swallowing its errors by citing `stderr-guard.ts:12`, a closing brace; and `HookError` is caught and discarded with no diagnostic, so a malformed hooks config disables the consent gate silently.
status: triaged
severity: MEDIUM
dod:
  - a diagnostic that cannot be written to the log file reaches stderr, covered by a test that fails today
  - the log is rotated during a long session, not only at startup
  - a malformed hooks config produces a visible diagnostic rather than a silently disabled gate

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-040 — A failed hook approval closes the consent gate as if it had succeeded   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #38, #57 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `consent.markReviewed()` runs synchronously after `aprovarHook` is INITIATED, but `aprovarHook` is async. On a rejected approve, `hooksRevisados` is already true, `InputSlot.tsx:70` stops rendering the gate for the session, `epoca` never bumps so `pendingHooks` never recomputes, and the only report goes to the redirected log (see the stderr-guard item). On the LAST pending hook this silently closes the gate as if approval had succeeded. The sibling `TrustGate` in the same file does the opposite for the identical failure class — toast plus state revert — so the correct shape is already present five lines away. Filed independently by two reviewers (#38, #57) on adjacent lines of the same defect.
status: triaged
severity: MEDIUM
dod:
  - a rejected hook approval leaves the gate open and surfaces a toast, covered by a test that fails today
  - `markReviewed` runs only after the persist resolves

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-041 — Config: a project file replaces the user profiles table wholesale, and five drift-detectors are never called   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #32, #34, #80 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: A project `config.toml` replaces the user profiles table instead of merging it, so a project-level file silently removes user-level profiles. Five exported config drift-detectors are never called, which means the invariants they encode are documented and unenforced. `ENV_KNOBS` and `measuredPrecedenceChain` cite three source paths that do not resolve — a fabricated citation inside the config layer's own documentation of itself.
status: triaged
severity: MEDIUM
dod:
  - a project config merges into the user profiles table, covered by a test that fails today
  - each drift-detector has a caller or is deleted
  - every path cited in `env-knobs.ts` resolves — checked mechanically

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-042 — AGENTS.md import confinement is vacuous outside a git repo and ignores symlinks   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #78 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: The confinement that keeps an `AGENTS.md` import inside the project depends on a git root; outside a repo there is no boundary, and it does not resolve symlinks, so a link out of the tree is followed. The check exists, which means the threat was recognised — it just does not hold in the two cases where it matters.
status: triaged
severity: MEDIUM
dod:
  - an import outside the project is refused with no git repo present, covered by a failing-first test
  - a symlink pointing outside the project is refused

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-043 — The review tool fails open on an unparseable response, and a failed dispose leaks the reviewer   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #82, #83, #84 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `parse.ts:56` degrades an unparseable reviewer response to `{findings: [], overall_correctness: ""}` — a clean verdict and a parse failure produce identical structured data, on a tool whose entire purpose is reporting defects. `runReview` compounds it: `result.result ?? ""` sends a run that returned nothing down the same path. `create-agent.ts:78` `descartar` marks itself done BEFORE the work, so a failed dispose permanently leaks the reviewer. `squad.ts:71` uses `Promise.all` over member disposal, so one cleanup failure overwrites the delegation result the user was waiting for.
status: triaged
severity: MEDIUM
dod:
  - an unparseable response produces a typed error, not an empty finding list — covered by a failing-first test
  - a failed dispose leaves the reviewer disposable again
  - a cleanup failure does not replace the delegation's own result

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-044 — Hook output is harvested on `exit` plus a 20 ms sleep instead of `close`   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #75, #76 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `hook-runner.ts:80` settles from the `exit` event deferred by a fixed 20 ms timer. Node documents `exit` as possibly preceding stdio close; `close` is the event that guarantees drained pipes. The 20 ms is a sleep, not a synchronisation, and it is a bare literal with no name. What can be lost is the DECISION channel: `parseFeedback` reads `decision: block` and `reason` out of hook stdout, and a PreToolUse non-zero exit turns its stdout into the veto reason — so a hook writing past the 64 KiB pipe buffer, or scheduled out under load, can have its block silently downgraded to empty output. `detached:true` widens the window. Same file: `cargaDoEvento`'s PostToolUse branch is unreachable, so PostToolUse hooks never receive args.
status: triaged
severity: MEDIUM
dod:
  - hook output is harvested on `close`, covered by a test with a hook that writes more than the pipe buffer
  - a PostToolUse hook receives its args, covered by a failing-first test

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-045 — runShutdown exits 1 on every path, so a clean SIGINT looks like a failed cleanup   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #19, #66 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `shutdown.ts:44` returns exit code 1 unconditionally, so a clean Ctrl-C is indistinguishable from a cleanup that timed out — to a shell, to CI, and to anything wrapping the process. It is also on the public interface with no external caller, so the contract is both wrong and unexercised.
status: triaged
severity: MEDIUM
dod:
  - a clean shutdown exits 0 and a timed-out cleanup exits non-zero, covered by a test per path
  - `runShutdown` has an external caller or leaves the public interface

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-046 — Eleven user-visible strings cite milestones, docs and changelog entries that do not exist   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #25, #33, #49, #50 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `commands/registry.ts` renders eleven strings citing M21/M35/M39/M49/M50/M51/M55/M64 — none resolve — and one instructs the user to read a CHANGELOG entry that was never written. A rendered error directs the user to `docs/CONFIGURATION.md`, which does not exist. A deprecation promises removal in M99 and no roadmap declaring M99 exists. `SessionFooter` advertises '? for shortcuts' unconditionally, but `?` only works while the ChatComposer is mounted with an empty buffer. Every one of these is the product telling the user something untrue at the moment they are already looking for help.
status: triaged
severity: MEDIUM
dod:
  - every milestone, doc path and changelog reference in a user-visible string resolves — checked mechanically
  - the shortcut hint is shown only when the shortcut works
  - a check exists that would fail on the next unresolvable user-facing reference

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-047 — SecretInput submits a pasted API key with its trailing newline   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #64 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: `SecretInput.tsx:42` stores the raw input chunk, so a key pasted with a trailing newline is submitted un-trimmed to `login()`. The failure is remote, delayed and opaque: the credential is stored, and authentication fails later with a message that says nothing about whitespace.
status: triaged
severity: MEDIUM
dod:
  - a pasted value with a trailing newline authenticates, covered by a test that fails on the current code
  - the submitted value is trimmed at the input boundary, not at the consumer

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-048 — Banner.test.tsx leaks process.stdout.columns and never exercises the branch it exists for   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #37 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: The test sets `columns: 120` under a non-TTY and never restores it, leaking into the worker for whatever runs next. It also never exercises the narrow branch — which is the branch the test exists to keep visible, and the one that broke three times in a row during the 2026-08-07 remediation.
status: triaged
severity: MEDIUM
dod:
  - the test restores `process.stdout.columns` in a teardown
  - the narrow branch is exercised and fails when the banner overflows its border

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-049 — Dead exports across the tree: 146 of 492 exported symbols have no external reference   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #4, #16, #17, #18, #43, #45, #46 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: A deterministic scan (tests counted as referencing files, so this is not the weaker 'no test reaches it' claim) finds 146 of 492 exported symbols with no reference outside their defining file. Named instances: `teamMemberOptions`; `readSecret`, a complete echo-disabled secret reader with no caller and no CLI login command; `ToolRegistry.names()` and `ContinuationBudget.used`; three symbols in `drained-output.ts`. Also two package-surface defects: `@theocode/agent` declares a `./chat-acp` subpath with zero importers, and `@theocode/cli` exports `.` -> `main.ts`, which RUNS the CLI on import.
status: triaged
severity: LOW
dod:
  - the exported surface of each package is the surface something consumes — a dead-export scan returns zero public orphans, or each survivor is allowlisted with a reason
  - importing `@theocode/cli` does not execute the CLI

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-050 — Three workspaces declare @theokit/agents ^7.3.1 while agent declares ^7.4.0   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #21 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: A version-range floor divergence inside one repo means npm may resolve two copies, and the surface each workspace is typed against is not the surface it runs against. This is the kind of skew that produces a defect nobody can reproduce locally.
status: triaged
severity: LOW
dod:
  - all four workspaces declare the same floor for `@theokit/agents`
  - `npm ls @theokit/agents` shows one resolved version

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-051 — readImageAttachment can throw an untyped error, breaking its own typed-error contract   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `code-review-output/code-review.db` findings #87 (file:line in the `file`/`line` columns); report `code-review-output/final_report.md`
why_now: The function documents and mostly honours a typed-error contract, then has a path that throws an untyped error — so a caller written against the contract cannot handle it. A contract that holds on most paths is a contract callers will trust on all of them.
status: triaged
severity: LOW
dod:
  - every throw from `readImageAttachment` is the declared typed error, covered by a test per failure path

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-052 — Forty-five source files carry Portuguese identifiers   [x]

fixed_in: f3a9e26, 006d773
dod_verified:
  - zero Portuguese remaining — `node tools/check-english-only.mjs` exits 0; the scan is re-runnable by hand and wired into `npm run lint`
  - typecheck OK, 95 tests pass (count unchanged), lint clean
  - renames isolated — f3a9e26 is 299 insertions / 299 deletions, a symmetry that is itself the evidence it changed no behaviour; prose and the guard landed separately in 006d773
  - guard exists — `tools/check-english-only.mjs` fails the lint on the next Portuguese identifier; it caught 15 that the accent scan alone had missed
note: the measurement in `evidence` UNDERSTATED the work. It counted identifiers only; a second pass found 92 user-facing strings and 57 comments in Portuguese as well, which is a product defect rather than a style one. Scope was widened accordingly rather than reported as complete against the smaller number.

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: measured 2026-08-08 across `packages/**/*.ts{,x}` — **45 files of 185, 287 occurrences, 56 distinct tokens**. Heaviest: `session/gc/all-sessions.ts` (63), `session/liveness-oracle.ts` (26), `tui/backtrack/use-backtrack.ts` (18), `session/gc/filesystem.ts` (12), `config/trust-store.ts` (12), `config/cli-overrides.ts` (12). Most frequent tokens: `atual` (40), `proximo` (22), `janela` (21), `protegidos` (18), `ehDiretorio` (16), `arquivo` (11), `epoca` (9), `abandonar` (9), `VIVO`/`MORTO`/`NAO_ACHOU`/`INDETERMINADO` (21 combined).
why_now: the project rule is that everything written in the repository is in English; only the conversation is in Portuguese. This was never enforced mechanically, so the two languages interleave inside single functions — `resolverGuardas` returns `protegidos`, `classificar` returns `MORTO`. Finding #67 caught the user-visible half of the same problem (the backtrack feature renders its instructions in Portuguese and its toast in English) and is filed under B-029. This item is the source-identifier half. Doing it EARLY is deliberate: the six heaviest files are the ones B-020 and B-029 are about to rewrite, so renaming afterwards would touch them twice.
status: raw
severity: MEDIUM
dod:
  - zero Portuguese identifiers in `packages/**` — proven by a scan that a human can re-run, not by inspection
  - `npm run typecheck`, `npm test` and `npm run lint` all pass, and the test count does not drop
  - no behaviour change in the same commit as a rename — the diff is renames only
  - a check exists that fails on the next Portuguese identifier introduced

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-portuguese-identifiers`).

## B-053 — @theokit/agents exports Portuguese type names on its public API   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: `node_modules/@theokit/agents/dist/index.d.ts:1121` — `ListOptionsSemPaginacao`, `:1125` `AgentComListaEstreitada`, and `ToolComNome` in the export list at `:1130`. Found while measuring B-020: the SDK's own narrowing of `Agent.list` is what refuted that item's fourth DoD bullet, and reading it required parsing a Portuguese type name.
why_now: TheoCode now enforces English-only in its own source (`tools/check-english-only.mjs`, B-052), and the rule it enforces cannot hold at the boundary: a consumer writing `const o: ListOptionsSemPaginacao = …` reintroduces Portuguese into an English file, through a name it does not own. This is upstream work in `theokit-framework`, filed here because this repo is where it was measured and where it bites.
status: raw
severity: LOW
dod:
  - the three names are renamed in `@theokit/agents` with the old ones kept as deprecated aliases for one minor version
  - TheoCode's english-only guard needs no allowlist entry for an SDK type name
note: routing caveat — the fix belongs to `theokit-framework`, which `cycle-backlog.md § Domain routing` places OUTSIDE this install (a dependency, not a governed repo). Gate G1 would normally refuse it. It is registered here deliberately, marked, because the alternative is the orphaned-finding the single-registry rule exists to prevent; it must be carried to the theokit install rather than worked from this one.

> Registered 2026-08-08 by `/backlog-item` (slug: `theokit-portuguese-public-types`).

## B-054 — `sessions gc --all-projects` never returns on a real installation   [ ]

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-live-test
evidence: measured 2026-08-08 by execution, not by reading. `npx tsx packages/cli/src/main.ts sessions gc --all-projects --json` exits 124 under `timeout 25` — with and without `-C`, and identically at `b1611fc^`, so it PREDATES the B-020 work. Cause: `~/.theokit/projects` holds **13,269 project directories** on this machine (`ls ~/.theokit/projects | wc -l`); `planOneProject` calls `classify` for each, and for every project whose recorded cwd no longer resolves, `dfsExists` walks the filesystem from `/` up to `MAX_NOS_DFS = 20_000` nodes (`gc/filesystem.ts:29`). The upper bound is ~265 million readdir/stat calls for one run.
why_now: the collector exists BECAUSE that accumulation happens, and the flag that collects across all of it is the one that cannot finish. The single-project path (`sessions gc`) returns fine, which is why this survived: the documented invocation for the problem the tool was built for is the broken one. Found while testing whether `-C` reaches `.env` (B-023 / B-026); the hang is not related to `-C`.
status: triaged
severity: HIGH
dod:
  - `sessions gc --all-projects --json` completes on a home with 13,000+ projects, under a stated time budget, covered by a test that fails on the current code
  - the per-project filesystem walk is bounded by something that does not scale with the number of projects — or is not run per project at all
  - a run that hits whatever bound replaces it reports UNDETERMINED for the projects it could not classify, per B-020, rather than silently treating them as DEAD

> Registered 2026-08-08 by `/backlog-item` (slug: `sessions-gc-all-projects-never-returns`).
