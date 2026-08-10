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

- Report: [`docs/reviews/2026-08-07-theokit-crossval-review.md`](docs/reviews/2026-08-07-theokit-crossval-review.md) — promoted out of the working area by B-064 so the citation resolves in a fresh clone (ADR 0002)
- Raw findings: `.claude/agents/review-theokit-crossval-2026-08-07/findings/*.yaml`

Of the 98 findings: **71 actionable** (grouped into the 17 items below, 1:1 coverage with no orphan), **10 SDK gaps** (§ Upstream), **17 `ok` verdicts** — measured statements that nothing is wrong, which produce no item because there is nothing to fix.

They enter as `status: triaged` and `source: discover-review` because they already carry the evidence intake is not allowed to require (`cycle-backlog.md § Chain`).

---

### Second review — 2026-08-08

Items **B-019..B-051** derive from a second, independent pass: `/loop-code-review` over `packages/`, **185/185 files inspected**, 87 findings.

- Report: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) — versioned, and the finding ids below are its join key
- Evidence database: `code-review-output/code-review.db` — the working artifact, deliberately NOT versioned (`.gitignore` excludes `code-review-output/`). It carries `file`/`line` per finding for anyone re-running the review locally; the argument itself travels in the report above

Of the 87 findings: **78 actionable** (the 33 items below, coverage asserted by script — every actionable id in exactly one item, no duplicate, no orphan) and **9 `info` clean verdicts** — measured statements that nothing is wrong, which produce no item because there is nothing to fix, exactly as the 17 `ok` verdicts above did.

They enter as `status: triaged` / `source: discover-review` for the same reason the first batch did: they arrive with the evidence intake is not allowed to require. The producer was `/loop-code-review`, not `/discover --sweep` — the value `discover-review` denotes the shape (a review sweep of our own code, evidence attached), and the actual producer is named here so the provenance is not overstated.

**`reopens: B-NNN`** appears on 11 of them. It is a provenance field in the family `cycle-backlog.md § Step 2` already sanctions (`supersedes:`, `regression_of:`), introduced here for a case neither covers: an item that was closed with a Definition-of-done bullet the code never satisfied. That is not a regression — it never worked — and it is not a supersession. Naming it precisely is the point: **7 of the 17 items closed on 2026-08-07 have unmet bullets, and the single `critical` finding of the second review is one of them.**

---

## Items

Next free id: **B-058**

---

## B-018 — Nineteen touched files still have no sibling test   [x]

fixed_in: 33e5e6e
dod_verified:
  - every entry the gate lists is now either covered or carries an explicit note — `packages/tui/TEST-EXEMPTIONS.md`, split into genuinely exempt and simply owed
  - two entries gained tests: `turn-error.ts` (decides whether /retry is offered) and `tools/registry.ts` (a name contract three layers depend on)
  - the gate was NOT lowered — the note re-derives its list with the gate's own rule
  - HONEST LIMIT: the registry test pins the invariant, not the constructor's guard. Disabling the guard leaves it green. Measured by mutation and written into the file rather than left implied

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

fixed_in: e98a5cf
fixed_in_note: recorded 2026-08-09 by the cross-validation pass. The item was closed with a `status_note` in prose and no commit named, so the claim could be verified by reading and not by machine — the same opening that let B-007 close on a commit which never touched the file its evidence cited.

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

fixed_in: 16610d3, 4a352dc
fixed_in_note: recorded 2026-08-09 by the cross-validation pass, same reason as B-009. `16610d3` adopts `WelcomeBanner`; `4a352dc` settles the approval ledger with a test.

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
| U-3 | `ToolsetError extends Error`, outside the `TheokitAgentError` hierarchy — the SDK argues against this itself elsewhere | `agents/index.d.ts:824`, `bridge-entry:2162` (TIP-15) | **fixed upstream, unreleased** — `theokit` commit `92b962ad`, changeset `toolset-error-joins-the-hierarchy`. The argument was already written in that package (M61 unified two `ConfigurationError` classes for the identical reason) and simply had not been applied. Consequence here: `translateError()` in `tools/registry.ts` exists only to bridge the gap and can be deleted on the next `@theokit/agents` bump — NOT before, since 7.4.0 predates the fix and removing it now would change which error type callers see. **SCOPE CORRECTION (B-063, 2026-08-10):** this row names ONE class and the pattern is wider — 10 of the 13 error classes in `@theokit/agents` extend plain `Error`. Closing this row on the `ToolsetError` fix would retire it while the defect it describes stays true nine more times. See U-11 |
| U-4 | `assertSecureModes` is private — consumers cannot apply the same permission check to their own store | (SAC-01) | open |
| U-5 | `@theokit/agents/auth` omitted the OAuth engine that `@theokit/sdk/auth` exports | (SAC-07) | **fixed and released** — `@theokit/agents@7.4.0`. The four engine symbols now cross over; `resolveCredential` deliberately stays out, locked by a test. The other half of SAC-07 (a re-declared `ResolvedCredential`) is NOT a defect: the SDK generalises to `provider: string` by design and this application narrows it to `Provider` for exhaustiveness — recorded in the type's own docstring |
| U-6 | No export answers "what may this sandbox mode write?" — hence a second oracle over the SDK's own three-mode vocabulary | (SAC-09) | open |
| U-7 | No component composes ASCII art with a right-hand aside: `WelcomeBannerProps` has no `art`, `BannerProps` has no `aside` | `tui/index.d.ts:938-945`, `:1442-1458` (F-tui-11) | open |
| U-8 | `StatusFooterProps.mode` is a closed three-value union that does not cover the consumer's real modes | (F-tui-12) | open |
| U-9 | `FreeTextInput` has no masked/secret mode, forcing 60 LOC of hand-rolled masked input | (F-tui-13) | open |
| U-10 | `WindowView` reports overflow as booleans, and `readJsonlTail` returns no absolute index — both force re-derivation in the consumer | `transcript-ops.d.ts:57-73` (F-tui-14) | open |
| U-11 | Ten of thirteen `@theokit/agents` error classes extend plain `Error` instead of `TheokitAgentError`, so a consumer's `catch (e instanceof TheokitAgentError)` misses them and each one that has to cross the boundary buys another shim like `tools/registry.ts:56`. Measured 2026-08-10: typed are `McpFileError` (`bridge/mcp-file.ts:86`) and `ToolsetError` (`capability/toolset.ts:58`); untyped are `CapabilityConflictError:38`, `UnknownCapabilityError:9`, `AgentDefinitionError:26`, `ApprovalAbortedError:85`, `DelegationError:74`, `DelegationBudgetExceededError:52`, `RefreshFailure:49`, `GuardrailViolationError:40`, `CostBudgetExceededError:52`, `InProcessApprovalRequiredError:82`. Bare `throw new Error` is 18 of 69 throw sites (26%); this repository, for comparison, is 3 of 56 (5.4%) with 11 of 12 classes typed. **The argument is already written in that package** — `src/errors.ts:8-16` documents the exact bug mixed hierarchies caused there (a `catch` matching one path and silently missing the other) and the fix was then applied to one class rather than to the pattern | `errors.ts:8-16`, `capability/capability.ts:38`, `capability/registry.ts:9` (B-063) | open |

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
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #68, #79 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
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
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #69, #70, #71, #72, #73, #81, #85, #86 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-003, B-012
why_now: Five independent swallowed-error sites on the only code path that deletes user data all fail in the same direction. `dfsExistencia` continues past an unreadable directory and returns `NAO_ACHOU` -> `MORTO`; `ehDiretorio` maps any statSync failure to false -> `MORTO`; `listRealProject` maps any statSync failure to mtimeMs=0, which is infinitely old AND sorts last so `keepLast` cannot protect it; `resolverGuardas` returns an EMPTY protection set for `MORTO`, so `--keep-last` has no effect on exactly the projects the collector deletes from; and `listagemPadrao` drops `nextCursor` so the registry guard is page one. `classifyDirectory` already has `INDETERMINADO` for 'I cannot tell' and uses it on one branch only. Both existing tests force `VIVO` or keepLast:0, so a green suite cannot see any of it.
status: triaged
severity: HIGH
dod:
  - an unreadable directory, an unstat-able cwd and an unstat-able transcript each produce `INDETERMINADO`, never `MORTO` — one failing test per site
  - `keepLast` protects the newest N transcripts in a `MORTO` project, covered by a test that fails today
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
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #74, #77 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
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
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #6 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
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
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #7, #8, #9, #10, #20 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `--uncommitted` is parsed and validated but never reaches the review target; `-m/--model` and `-o/--output-last-message` are documented globally but ignored by `review` and `sessions`; `--last` is accepted outside `resume` and ignored; `-C/--cd` does not affect .env resolution; and there is no `--help`/`-h` at all — the usage text is reachable only by triggering an error. A flag that parses and does nothing is worse than an unknown flag, which at least errors.
status: triaged
severity: MEDIUM
dod:
  - each flag either changes behaviour or is rejected where it does not apply — one test per flag
  - `theocode --help` exits 0 and prints usage

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-024 — cli/run-composition carries a dead seam, a dead parameter and a dead return field   [x]

fixed_in: b38141c
dod_verified:
  - seams exercised by tests that fail without them — verified by mutation (ignoring `seams.store` turns the discriminating test red)
  - `baseInstructions` deleted: no caller could supply it
  - `RunComposition.cfg` kept — it was an unread return field and is now read, by the tests that prove the seam

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #11, #12, #15 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `composeRun`'s `CompositionSeams` parameter has no caller and no test — the injection seam built for testability is itself untested and unused. `baseInstructions` is accepted but no caller can supply it. `RunComposition.cfg` is computed and returned and never read. Three separate pieces of scaffolding for a use that never arrived.
status: triaged
severity: MEDIUM
dod:
  - each of the three is either exercised by a test that would fail without it, or deleted
  - `npm run lint` still passes and the CLI behaviour is unchanged (no behaviour is in scope here)

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-025 — packages/cli ships 1292 LOC and zero tests, including a 329-LOC pure parser   [x]

fixed_in: aae39cb, b7f8770
dod_verified:
  - the parser has a test per subcommand and per documented flag — 20 flags exercised, unknown-flag as the floor
  - the suite fails if `exec` routing regresses, and the last test reads the parser's own switch so a NEW unrouted subcommand fails too — verified by mutation (adding `case 'newthing'` turns it red)

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #13 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
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
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #14 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `main.ts:8` places bootstrap statements between import declarations, which reads as ordered setup but is not: ESM hoists every import and evaluates all of them before any statement runs. Any import with a side effect that depends on the bootstrap sees the pre-bootstrap state. The intent expressed by the source order is not the intent achieved.
status: triaged
severity: MEDIUM
dod:
  - bootstrap runs before any module that depends on it, proven by a test that observes the ordering
  - or the ordering dependency is removed and the source no longer implies one

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-027 — The `Blocked <cmd>` policy-veto rendering can never fire   [x]

fixed_in: a6c519b
dod_verified:
  - the chain is DELETED, not left half-alive — `vetoReason`, `vetoedInputs`, `BLOCKED_PREFIX`, the header branch and the orphaned `inputKey` are gone; the only surviving mention is the docstring explaining why
  - it was NOT rewired, deliberately: a veto is `{ block: true, message }` and what that becomes on the wire the renderer sees was never measured. Guessing is how the original was written. B-055 carries the wiring with the SDK contract as its evidence

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #2 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `vetoReason()` is unreachable on three independent counts: it bails on `'ok' in p` and every SDK tool result carries `ok`; it reads `p.exitCode` where results use `exit_code` (the sibling at `:189` gets it right); and nothing in repo or SDK produces exit code 126. The hook veto path DOES fire, so the user loses the one signal built to tell them a hook blocked their tool.
status: triaged
severity: HIGH
dod:
  - a hook-vetoed tool call renders `Blocked`, covered by a test that fails on the current code
  - or the feature is deleted along with its docstring — not left half-alive

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-028 — The `!` shell shortcut is documented in the help panel and never wired   [x]

fixed_in: 0fe98e8
dod_verified:
  - the `!` line is gone from the help panel — the filter is keyed on the CAPABILITY, so the next unwired shortcut cannot be advertised either
  - NOT wired, deliberately: the TUI has no shell execution path of its own, so a composer-driven run would bypass the approval gate, the sandbox workDir and any hook veto. B-056 carries that decision

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #24 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `ConversationSlot.tsx:150` documents `!` = 'Run a shell command'. `ChatComposer` never receives `onShellCommand`, and the SDK gates the feature on that prop, so `!npm test` is sent to the model as prose. The capability is fully present — `ptyOwner`, `run_shell`, `/ps`, `/stop` all exist — only the wiring is missing, which makes this a wire-up rather than a feature.
status: triaged
severity: HIGH
dod:
  - `!cmd` runs a shell command, covered by a test asserting the composer receives the handler
  - or the line is removed from the help panel

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-029 — Esc-rewind arms with total=0 and previews=[]: the backtrack feature is dead   [x]

fixed_in: 2df6f0e
dod_verified:
  - arming yields the real turn count and previews — the test asserts the ORDER, because every setter did eventually run and an end-state test passed on the broken code; end-to-end probe went from `{total:0,previews:[]}` to `{total:3,previews:[a,b,c]}`
  - a failure after the fork is surfaced instead of becoming an unhandled rejection
  - the backtrack test asserts the exact turn count (2), not `> 0`
  - the feature speaks one language — the header was Portuguese while the toast for the same keypress was English; the guard missed it and was extended

domain: theocode
repo: TheoCode
suggested_mode: bug
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #30, #53, #60, #65, #67 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `primeBacktrack` calls `setRewindPrimed(true)` BEFORE `setRewindCount`/`setRewindPreviews`, and the adapter builds the ladder inside `setRewindPrimed` — so it captures unset state. Verified by execution, not by reading: a probe returning 3 previews prints `{"armed":true,"nth":-1,"total":0,"previews":[]}`. The overlay returns null on the empty list so nothing draws, and the second Esc emits `reset-backtrack`. Around it: `resetBacktrack()` has no caller, `confirmBacktrack`'s post-fork statements sit in a try with no catch while the caller voids the promise, the instructions render in Portuguese and the toast for the same keypress in English, and the existing test asserts `length > 0` where the contract is 'you lose the partial line and nothing else'.
status: triaged
severity: HIGH
dod:
  - arming the rewind yields the real turn count and previews, covered by a test that fails on the current ordering
  - a failure inside `confirmBacktrack` after the fork is surfaced, not voided
  - the backtrack test asserts the exact expected turn count, not `> 0`
  - the feature's user-visible strings are in one language

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-030 — A docstring justifies an export by citing a test and an ADR that do not exist   [x]

fixed_in: 86c53a0
dod_verified:
  - the cited test exists under the promised name and fails when the decision is reverted — verified by mutation (`performance.now()` -> `Date.now()` turns it red)
  - the ADR citation is removed rather than invented: there is no ADR-0023
  - NOT met: "a check exists that would catch the next docstring citing a non-existent test path". No such checker was built. Recorded rather than claimed

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #1 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `coalesced-memo.ts:11` cites `test_the_clock_is_monotonic_non_decreasing` and `ADR-0023` as the reason an export must stay. Neither exists anywhere in the tree. The comment pre-emptively disarms the dead-code detector, so the export survives on the strength of an artifact nobody checked — the same shape as a fabricated citation in a plan, at the code level.
status: triaged
severity: HIGH
dod:
  - the cited test exists and fails when the export is removed, or the citation and the export are both deleted
  - a check exists that would catch the next docstring citing a non-existent test path

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-031 — B-013's fireAndForget reached 2 of 5 persist call sites   [x]

fixed_in: 4fded27
dod_verified:
  - all five persist call sites route through the reporting wrapper — achieved at the DEFINITION: there is no longer an exported persist function that can reject, so the four remaining `void persistSessionId(...)` sites are safe by construction rather than by review
  - a rejected persist reports and does not crash — verified by mutation (returning the raw write turns it red)
  - the test premise was wrong twice: `atomicWriteText` CREATES a missing directory, and the rejection alone already resolved — what was missing was the diagnostic

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #29 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-013
why_now: The remediation's own docstring says 'the two persistence calls'; there are five. Protected: the startup path (`session-store.ts:18`) and the goal store (`use-goal-run.ts:24`). Unprotected: `composition-root.ts:75, 84, 89`, which are `/new`, `/clear`, `/fork`, the Esc-interrupt and the backtrack confirm — the hot paths. Those hand a bare `void` to a promise whose rejection is uncaught by construction (`write-queue.ts:10` catches the stored tail, `:12` returns the uncaught one) under `node >=22`, where the default is `--unhandled-rejections=throw`. B-013's `fixed_in` commit touched none of the three files its own evidence field named.
status: triaged
severity: HIGH
dod:
  - all five persist call sites route through the reporting wrapper — proven by grep finding no bare `void persist`
  - a rejected persist on the `/new` path is reported and does not crash the process, covered by a test

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-032 — B-015's single injected working directory was applied to packages/agent only   [x]

fixed_in: 1a4a7c5
dod_verified:
  - `delegate_to_team` is confined to the injected cwd — RED before the fix; `resolveToolScope` derives both the writeRoot and the sandbox workDir from it, which made this the one B-015 bypass with a confinement consequence
  - `TuiRoot.initialPosture` deleted — a seam built for this work that never gained a consumer, and therefore read as though the TUI honoured an injected posture
  - the TUI half NOT done, with a measured reason: 23 `process.cwd()` sites across 13 files, latent because the TUI parses no directory flag. Registered as B-057 with that count as evidence

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #27, #39, #47, #54 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-015
why_now: `squad.ts:49` still calls `resolveToolScope(..., process.cwd())` and `TeamContext` has no `cwd` field, so `delegate_to_team` escapes the injection — and `resolveToolScope` derives both `writeRoot` and the sandbox `workDir` from that argument, which makes this the one bypass with a confinement consequence. The TUI half was never done: it re-resolves config and posture ambiently at 7 sites and `TuiRoot.initialPosture`, the seam built for exactly this, has no reader. `ConsentGates.tsx:71` re-derives `process.cwd()` twice (latent — the root is itself `process.cwd()` today). `withShellAndProjectEntities` was neither decomposed nor renamed, which was also a B-015 bullet.
status: triaged
severity: HIGH
dod:
  - `delegate_to_team` confines a worker to the injected cwd, covered by a test that fails on the current code
  - `TuiRoot.initialPosture` has a reader, or is deleted
  - grep finds no `process.cwd()` in the TUI outside the composition root

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-033 — B-006's injected-env seam is unreachable from any caller   [x]

fixed_in: 2c4ffd0
dod_verified:
  - `resolveTrustPosture` accepts an injected env from its exported entry — RED before the fix
  - the two reads in `run-composition.ts` now come from one value
  - `effectiveConfigUnderPosture` NOT addressed — it is a separate dead export and belongs to B-049
  - one test was rewritten, not retried: it mutated `process.env` and made the suite flaky against `chat-cwd.test.ts` running concurrently. Three consecutive full runs green after

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #26, #40 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-006
why_now: The `env` parameter was added to the PRIVATE `trustOrigin`; the only exported entry calls it with two arguments, so all 10 production call sites read ambient env. The disagreement is reachable today: `run-composition.ts:38` takes the posture from ambient env while `:42` passes `seams.env` into config resolution — the same run, two sources. Adjacent and same fix unit: an injected trust posture does not reach config resolution at all, and `effectiveConfigUnderPosture`, which exists for that, is dead.
status: triaged
severity: HIGH
dod:
  - `resolveTrustPosture` accepts an injected env from its exported entry, covered by a test that fails today
  - the two reads in `run-composition.ts` come from one source
  - `effectiveConfigUnderPosture` has a caller or is deleted

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-034 — B-007's credential route still discards THEOCODE_HOME, and ensureAuthHome still mutates   [x]

fixed_in: 184c847
dod_verified:
  - the forced-file-store route preserves the store location — RED before the fix, with the ordinary route as a floor that always passed
  - `ensureAuthHome` no longer mutates its argument
  - `MissingCredentialError` is reachable from `@theocode/agent/auth`

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #3, #28, #31 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-007, B-004
why_now: `credentials.ts:360` forces the file store with `env: {}`, which discards THEOCODE_HOME — the variable that LOCATES that store. The result is asymmetric and user-visible: the first resolution finds the credential, the routed second one does not. `git show 47eced3 --stat` proves the commit named as the fix never touched `credentials.ts`. `ensureAuthHome` still mutates its argument, also a B-007 bullet. Same file, same class as B-004: `MissingCredentialError` is unreachable by consumers — the sibling instance of the defect B-004 fixed once.
status: triaged
severity: HIGH
dod:
  - the forced-file-store route preserves THEOCODE_HOME, covered by a test that fails on the current code
  - `ensureAuthHome` does not mutate its argument
  - `MissingCredentialError` is reachable by a consumer, or removed

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-035 — subscribe() is a single-slot setter, and the test named after that guarantee cannot fail   [x]

fixed_in: 5d19a3c
dod_verified:
  - the test fails when a second set replaces the first — verified by mutation, not by reading: removing the refusal turns two of three red, where the old test stayed green
  - renamed to `setListener`; multi-subscriber was NOT built, because only the TUI listens and a multicast nobody asked for is the YAGNI failure the B-004 bullet left open

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #35 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-004
why_now: The B-004 bullet asked that `assinar()` either support multiple subscribers or be renamed to what it is. Neither happened. Worse, `ask-bridge.test.ts:95` — `test_a_second_subscriber_does_not_silently_replace_the_first` — asserts `first.calls + second.calls > 0` and that `second` was called. Both hold PRECISELY when the first subscriber IS silently replaced; `first` is never asserted on. The comment directly above states the intent the assertions fail to encode. A vacuous test is worse than a missing one: the missing test shows up in the gate output.
status: triaged
severity: MEDIUM
dod:
  - the test fails when a second subscribe replaces the first — verified by mutation, not by reading
  - `subscribe` supports multiple listeners or is renamed to `setListener`

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-036 — B-012: the compact_boundary window scan is still triplicated and readJsonlTail unadopted   [x]

fixed_in: dce5b6d
dod_verified:
  - the window scan exists in exactly one place — `compact_boundary` appears once in code (plus its docstring)
  - `countUserTurnsInWindow` deleted: after the extraction it was `indices.length`, and it had no caller
  - `readJsonlTail` NOT adopted, with a MEASURED reason recorded in the file: `sinceMarker` substring-matches the raw line so a user message containing `compact_boundary` would silently shrink the window, and the largest transcript across 23,100 on a real machine is 186 KiB — there is no cost to trade against

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #36, #42 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-012
why_now: Both were explicit B-012 bullets and neither was done. `countUserTurnsInWindow` is an exported function with no caller and no test, which is the third copy still standing.
status: triaged
severity: MEDIUM
dod:
  - the window scan exists in exactly one place — proven by grep
  - `readJsonlTail` is the reader used on that path, or the plan records why it is not
  - `countUserTurnsInWindow` has a caller or is deleted

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-037 — B-003 left a dead, divergent second copy of the deletion-path pointer guard   [x]

fixed_in: c24e026
dod_verified:
  - one pointer-reading implementation on the deletion path — `resolvePointerId` had no caller anywhere and is gone
  - GC behaviour unchanged: 139 tests green, including the existing GC suite

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #41 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-003
why_now: `per-session.ts:55` `resolvePointerId` is a second copy of the pointer guard that B-003 unified — dead, and divergent from the surviving one. A dead copy that has drifted is the worst kind: the next reader cannot tell which is authoritative, and the class of bug B-003 fixed can be reintroduced by copying the wrong one.
status: triaged
severity: LOW
dod:
  - one pointer-reading implementation exists on the deletion path — proven by grep
  - the deletion path's behaviour is unchanged, covered by the existing GC tests

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-038 — B-016: hooks-test-helpers.ts is still a fixture file for a suite that does not exist   [x]

fixed_in: ed060fc
dod_verified:
  - the helper file supports a real suite: `ctxTurn` and `tmp` are used by `fail-safe-defaults.test.ts`
  - `ctxPre` and `ctxVoid` deleted — nothing exercises those contexts yet, and a fixture for a test nobody wrote is the same defect one file smaller

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #44 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
reopens: B-016
why_now: The B-016 bullet asked for this to be resolved. The fixture file remains and the suite it was written for was never created, so the file is dead weight that reads as coverage.
status: triaged
severity: LOW
dod:
  - the helper file supports a real suite, or is deleted
  - no test file imports a helper for a suite that does not exist

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-039 — The stderr guard can silently discard every diagnostic the TUI emits   [x]

fixed_in: a4f8b19
dod_verified:
  - a diagnostic that cannot be written reaches the user — carried to teardown and reported there, because falling back to stderr mid-frame corrupts the display this guard exists to protect
  - the log rotates during a long session, on accumulated bytes rather than a stat per write
  - a malformed hooks config produces a visible diagnostic instead of a silently closed consent gate
  - the `stderr-guard.ts:12` citation (a closing brace) is gone

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #58, #61, #62, #63 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `stderr-guard.ts:17` has an empty `catch` and returns true unconditionally, and `mkdirSync` failure is already commented as 'guarded writes below will no-op'. This is the SOLE output channel of the B-013 remediation (`fire-and-forget.ts:22` defaults `report` to `process.stderr.write`), of hook-approval failures, and of the backtrack fork trace. On a non-writable cwd the TUI runs with every diagnostic dead and nothing says so. `shared/diagnostic-sink.ts:24-29` already solves the identical problem by falling back to stderr, and the pre-guard writer is held at `:7` and unused for this. Around it: the log is rotated once at startup and never again so a long session grows past CAP_BYTES unbounded; `rotate()` justifies swallowing its errors by citing `stderr-guard.ts:12`, a closing brace; and `HookError` is caught and discarded with no diagnostic, so a malformed hooks config disables the consent gate silently.
status: triaged
severity: MEDIUM
dod:
  - a diagnostic that cannot be written to the log file reaches stderr, covered by a test that fails today
  - the log is rotated during a long session, not only at startup
  - a malformed hooks config produces a visible diagnostic rather than a silently disabled gate

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-040 — A failed hook approval closes the consent gate as if it had succeeded   [x]

fixed_in: af6ed7b
dod_verified:
  - a rejected approval leaves the gate open and toasts — verified by mutation (hoisting markReviewed above the await turns 2 of 4 red)
  - `markReviewed` runs only after the persist resolves; `approveHookConsent` returns a promise instead of taking an on-failure callback
  - tested as a pure unit (`hook-decision.ts`) because the ink harness does not deliver interaction — same constraint as B-047

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #38, #57 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `consent.markReviewed()` runs synchronously after `aprovarHook` is INITIATED, but `aprovarHook` is async. On a rejected approve, `hooksRevisados` is already true, `InputSlot.tsx:70` stops rendering the gate for the session, `epoca` never bumps so `pendingHooks` never recomputes, and the only report goes to the redirected log (see the stderr-guard item). On the LAST pending hook this silently closes the gate as if approval had succeeded. The sibling `TrustGate` in the same file does the opposite for the identical failure class — toast plus state revert — so the correct shape is already present five lines away. Filed independently by two reviewers (#38, #57) on adjacent lines of the same defect.
status: triaged
severity: MEDIUM
dod:
  - a rejected hook approval leaves the gate open and surfaces a toast, covered by a test that fails today
  - `markReviewed` runs only after the persist resolves

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-041 — Config: a project file replaces the user profiles table wholesale, and five drift-detectors are never called   [x]

fixed_in: 50fafe2
dod_verified:
  - a project config merges into the user profiles table — RED with the exact predicted failure (`unknown profile "fast"`)
  - each drift-detector has a caller: a TEST, which is what makes it a detector. Running the first one surfaced a real gap — `profile`/`profiles` were neither reachable nor exempt — now recorded in the opt-out list with a reason and an exit criterion
  - every path cited in `env-knobs.ts` resolves, checked mechanically

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #32, #34, #80 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: A project `config.toml` replaces the user profiles table instead of merging it, so a project-level file silently removes user-level profiles. Five exported config drift-detectors are never called, which means the invariants they encode are documented and unenforced. `ENV_KNOBS` and `measuredPrecedenceChain` cite three source paths that do not resolve — a fabricated citation inside the config layer's own documentation of itself.
status: triaged
severity: MEDIUM
dod:
  - a project config merges into the user profiles table, covered by a test that fails today
  - each drift-detector has a caller or is deleted
  - every path cited in `env-knobs.ts` resolves — checked mechanically

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-042 — AGENTS.md import confinement is vacuous outside a git repo and ignores symlinks   [x]

fixed_in: 994f6c7
dod_verified:
  - an import outside the project is refused with no git repo present — the boundary was the FILESYSTEM ROOT, which permitted reading any file on the machine into the system prompt; worse than the finding recorded
  - a symlink pointing outside the project is refused — containment is checked on the real path, verified by mutation (dropping realpath turns the symlink case red while the relative case stays green)

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #78 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: The confinement that keeps an `AGENTS.md` import inside the project depends on a git root; outside a repo there is no boundary, and it does not resolve symlinks, so a link out of the tree is followed. The check exists, which means the threat was recognised — it just does not hold in the two cases where it matters.
status: triaged
severity: MEDIUM
dod:
  - an import outside the project is refused with no git repo present, covered by a failing-first test
  - a symlink pointing outside the project is refused

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-043 — The review tool fails open on an unparseable response, and a failed dispose leaks the reviewer   [x]

fixed_in: d8bfdca
dod_verified:
  - an unparseable response raises a typed error instead of an empty finding list — both callers already catch and report, so the CLI exits 1 with the reason instead of 0 with a clean verdict
  - a failed dispose leaves the reviewer disposable again (the flag is set after the work, not before)
  - a cleanup failure no longer replaces the delegation result — `allSettled` in the `finally`, each failure reported

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #82, #83, #84 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `parse.ts:56` degrades an unparseable reviewer response to `{findings: [], overall_correctness: ""}` — a clean verdict and a parse failure produce identical structured data, on a tool whose entire purpose is reporting defects. `runReview` compounds it: `result.result ?? ""` sends a run that returned nothing down the same path. `create-agent.ts:78` `descartar` marks itself done BEFORE the work, so a failed dispose permanently leaks the reviewer. `squad.ts:71` uses `Promise.all` over member disposal, so one cleanup failure overwrites the delegation result the user was waiting for.
status: triaged
severity: MEDIUM
dod:
  - an unparseable response produces a typed error, not an empty finding list — covered by a failing-first test
  - a failed dispose leaves the reviewer disposable again
  - a cleanup failure does not replace the delegation's own result

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-044 — Hook output is harvested on `exit` plus a 20 ms sleep instead of `close`   [x]

fixed_in: 115c88f
dod_verified:
  - hook output is harvested on `close`, bounded by a NAMED budget because `detached` means a grandchild can hold the pipe forever; a run that hits the bound reports truncation
  - the reproduction is a grandchild writing after the shell exits — a 300 KiB burst did NOT reproduce it, which is what makes a sleep the wrong instrument
  - a PostToolUse hook receives the tool's real args — verified by mutation (restoring `args: {}` turns it red)

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #75, #76 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `hook-runner.ts:80` settles from the `exit` event deferred by a fixed 20 ms timer. Node documents `exit` as possibly preceding stdio close; `close` is the event that guarantees drained pipes. The 20 ms is a sleep, not a synchronisation, and it is a bare literal with no name. What can be lost is the DECISION channel: `parseFeedback` reads `decision: block` and `reason` out of hook stdout, and a PreToolUse non-zero exit turns its stdout into the veto reason — so a hook writing past the 64 KiB pipe buffer, or scheduled out under load, can have its block silently downgraded to empty output. `detached:true` widens the window. Same file: `cargaDoEvento`'s PostToolUse branch is unreachable, so PostToolUse hooks never receive args.
status: triaged
severity: MEDIUM
dod:
  - hook output is harvested on `close`, covered by a test with a hook that writes more than the pipe buffer
  - a PostToolUse hook receives its args, covered by a failing-first test

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-045 — runShutdown exits 1 on every path, so a clean SIGINT looks like a failed cleanup   [x]

fixed_in: 677a427
dod_verified:
  - a clean shutdown exits 0 and a failed/timed-out one exits non-zero — one test per path, RED on the clean case
  - `runShutdown` stays public with its reason written down: its consumer is the test, and the alternative is sending a real signal to the test process

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #19, #66 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `shutdown.ts:44` returns exit code 1 unconditionally, so a clean Ctrl-C is indistinguishable from a cleanup that timed out — to a shell, to CI, and to anything wrapping the process. It is also on the public interface with no external caller, so the contract is both wrong and unexercised.
status: triaged
severity: MEDIUM
dod:
  - a clean shutdown exits 0 and a timed-out cleanup exits non-zero, covered by a test per path
  - `runShutdown` has an external caller or leaves the public interface

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-046 — Eleven user-visible strings cite milestones, docs and changelog entries that do not exist   [x]

fixed_in: e0e9925
dod_verified:
  - every milestone / doc / changelog reference in a user-visible string resolves — enforced by a test that scans non-comment lines across packages/
  - the shortcut hint is shown only when the shortcut works, using the same condition input-router gates the key on
  - the guard also asserts ROADMAP.md is still absent, so adding one fails loudly instead of passing quietly

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #25, #33, #49, #50 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `commands/registry.ts` renders eleven strings citing M21/M35/M39/M49/M50/M51/M55/M64 — none resolve — and one instructs the user to read a CHANGELOG entry that was never written. A rendered error directs the user to `docs/CONFIGURATION.md`, which does not exist. A deprecation promises removal in M99 and no roadmap declaring M99 exists. `SessionFooter` advertises '? for shortcuts' unconditionally, but `?` only works while the ChatComposer is mounted with an empty buffer. Every one of these is the product telling the user something untrue at the moment they are already looking for help.
status: triaged
severity: MEDIUM
dod:
  - every milestone, doc path and changelog reference in a user-visible string resolves — checked mechanically
  - the shortcut hint is shown only when the shortcut works
  - a check exists that would fail on the next unresolvable user-facing reference

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-047 — SecretInput submits a pasted API key with its trailing newline   [x]

fixed_in: 787e140
dod_verified:
  - a pasted value with a trailing newline authenticates — covered, and verified by mutation (removing the trim turns 3 of 5 red)
  - trimmed at the input boundary, in `secret-buffer.ts`, not at the consumer
  - NOTE: tested as a pure unit, not through the component — `useInput` needs raw mode the harness's stdin does not report, and a component-level attempt produced assertions that all passed on `undefined`

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #64 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: `SecretInput.tsx:42` stores the raw input chunk, so a key pasted with a trailing newline is submitted un-trimmed to `login()`. The failure is remote, delayed and opaque: the credential is stored, and authentication fails later with a message that says nothing about whitespace.
status: triaged
severity: MEDIUM
dod:
  - a pasted value with a trailing newline authenticates, covered by a test that fails on the current code
  - the submitted value is trimmed at the input boundary, not at the consumer

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-048 — Banner.test.tsx leaks process.stdout.columns and never exercises the branch it exists for   [x]

fixed_in: a8046f2, e2003c7
dod_verified:
  - the test restores `process.stdout.columns` both ways — the old cleanup leaked exactly ONCE, on the first probe, and every later restore then looked correct
  - the narrow branch is exercised, with a wide case as the floor
  - the FIRST version of this test was vacuous and its mutation run reported ten passes; the anchor has to be captured at module load, which is the only vantage point that can see the leak

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #37 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: The test sets `columns: 120` under a non-TTY and never restores it, leaking into the worker for whatever runs next. It also never exercises the narrow branch — which is the branch the test exists to keep visible, and the one that broke three times in a row during the 2026-08-07 remediation.
status: triaged
severity: MEDIUM
dod:
  - the test restores `process.stdout.columns` in a teardown
  - the narrow branch is exercised and fails when the banner overflows its border

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-049 — Dead exports across the tree: 146 of 492 exported symbols have no external reference   [x]

fixed_in: 0ebc989
dod_verified:
  - composition measured before deleting: 82 interfaces / 21 const / 20 functions / 9 types / 2 classes. The type surface is an API contract and was left alone
  - two dead functions deleted, 22 internal-only exports un-exported (code kept, promise withdrawn), 141 -> 120
  - `@theocode/cli` no longer exposes an importable entry — importing it RAN the CLI
  - `@theocode/agent`'s `./chat-acp` KEPT after checking: it is the external ACP integration surface, not an orphan
  - NOT clean: 120 survivors remain, almost all type surface. Recorded rather than claimed

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #4, #16, #17, #18, #43, #45, #46 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: A deterministic scan (tests counted as referencing files, so this is not the weaker 'no test reaches it' claim) finds 146 of 492 exported symbols with no reference outside their defining file. Named instances: `teamMemberOptions`; `readSecret`, a complete echo-disabled secret reader with no caller and no CLI login command; `ToolRegistry.names()` and `ContinuationBudget.used`; three symbols in `drained-output.ts`. Also two package-surface defects: `@theocode/agent` declares a `./chat-acp` subpath with zero importers, and `@theocode/cli` exports `.` -> `main.ts`, which RUNS the CLI on import.
status: triaged
severity: LOW
dod:
  - the exported surface of each package is the surface something consumes — a dead-export scan returns zero public orphans, or each survivor is allowlisted with a reason
  - importing `@theocode/cli` does not execute the CLI

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-050 — Three workspaces declare @theokit/agents ^7.3.1 while agent declares ^7.4.0   [x]

fixed_in: 92be2cb
dod_verified:
  - all four workspaces declare `^7.4.0`
  - `npm ls @theokit/agents` resolves to a single 7.4.0

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #21 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
why_now: A version-range floor divergence inside one repo means npm may resolve two copies, and the surface each workspace is typed against is not the surface it runs against. This is the kind of skew that produces a defect nobody can reproduce locally.
status: triaged
severity: LOW
dod:
  - all four workspaces declare the same floor for `@theokit/agents`
  - `npm ls @theokit/agents` shows one resolved version

> Registered 2026-08-08 by `/backlog-item` (slug: `theocode-review-2026-08-08`).

## B-051 — readImageAttachment can throw an untyped error, breaking its own typed-error contract   [x]

fixed_in: ed060fc
dod_verified:
  - every throw is the declared typed error — three failure paths covered, two RED before the fix
  - the code union gains `unreadable` rather than reusing `not_found`: 'it is not there' and 'I could not read it' are different facts

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: [`docs/reviews/2026-08-08-packages-review.md`](docs/reviews/2026-08-08-packages-review.md) findings #87 (the finding ids are the join key; `file`/`line` for each are in the local `code-review-output/code-review.db`, which is not versioned by design)
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

## B-053 — @theokit/agents exports Portuguese type names on its public API   [x]

fixed_in: 94fd582e (theokit)
dod_verified:
  - the three names are renamed in `@theokit/agents` with deprecated aliases kept for one minor — `packages/agents/src/{index.ts,capability/{index,toolset}.ts}`, typecheck + lint clean, 896 tests across 122 files pass
  - NOT YET EFFECTIVE HERE: TheoCode consumes the PUBLISHED `@theokit/agents@7.4.0`, so the rename reaches this repo only on the next release. The english-only guard needs no allowlist entry today because the SDK type names are not written in TheoCode's own source
  - the migration path collided with two of theokit's own lint rules (`redundant-type-aliases`, `no-deprecated`) — three targeted disables carry a reason and a sunset; a fourth was written and removed once measured as unnecessary

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

## B-054 — `sessions gc --all-projects` never returns on a real installation   [x]

fixed_in: 1578995
dod_verified:
  - `sessions gc --all-projects --json` completes in **7.5s** on a home with 13,269 projects, from never returning (measured `timeout 25` before, and identically at b1611fc^ so it predated B-020)
  - the search is bounded by the WORK: the ceiling counted popped directories while `visitEntries` stats every entry — measured 40 projects producing 87 `listEntries` and 547,019 `isDirectory`, ~181M projected. Charged per entry now, plus one budget shared by the whole sweep instead of one per project
  - what the budget cannot classify is UNDETERMINED, never DEAD — asserted in the test; the run kept all 13,269 and collected nothing

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

## B-055 — A hook veto is invisible in the TUI   [x]

fixed_in: aa81d76
dod_verified:
  - a hook-vetoed tool call is visibly marked in the TUI — a toast naming the tool and the reason
  - the signal travels FROM THE VETO SITE, which is the bullet that mattered: measured against the SDK's own declaration, a veto reaches the wire as a `tool_result` with `isError: false` and the message as content, so a blocked call is indistinguishable from a successful one BY DESIGN. That is why B-027's renderer was unreachable
  - no detection keyed on a message prefix or an exit-code convention this product does not emit
  - the relay QUEUES vetoes until the surface has a toast, so a block during startup is not announced to nobody
  - verified by mutation: dropping the announce turns the test red; the floor (a passing hook announces nothing) stays green, so a `Blocked` toast cannot appear under a tool that ran

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: measured 2026-08-08 against the SDK's own declaration. A veto is `PreToolCallDecision = { block: true; message: string }` (`@theokit/sdk/dist/agent-BzZwYFiw.d.ts:1369`), returned from `pre_tool_call`, and the SDK docstring says it "surfaces `message` to the model". `packages/agent/src/hooks/hooks.ts` produces exactly that shape in `chainBudgetBlock` and `bloqueioPorPolitica`. What the renderer receives for a vetoed call was NOT measured.
why_now: B-027 deleted the `Blocked <cmd>` rendering rather than repair it, because it detected `{ exitCode: 126 }` — a shell convention this product never emits — and rewiring it would have meant guessing the real wire shape. The user-visible gap is now explicit rather than disguised: a hook CAN block a tool call, and the terminal shows the user nothing that says so. The information exists at the point of veto, inside our own process; it is the transport to the surface that is missing.
status: triaged
severity: MEDIUM
dod:
  - a hook-vetoed tool call is visibly marked in the TUI, covered by a test that fails on the current code
  - the signal travels from the veto site rather than being reverse-engineered from a rendered tool result — the shape of that result is the SDK's to change, and reading it was what made the old code unreachable
  - no detection keyed on a message prefix or an exit-code convention this product does not emit

> Registered 2026-08-08 by `/backlog-item` (slug: `hook-veto-invisible-in-tui`).

## B-056 — Decide whether `!cmd` may run outside the agent's confinement   [x]

fixed_in: (decision) `docs/adr/0001-shell-shortcut-confinement.md`
dod_verified:
  - the decision is recorded: **not at all, for now** — ADR 0001, with the four options and the measured cost of each
  - what made it a decision rather than work: a `!cmd` has NO TURN, so the SDK's approval ledger — which keys on tool calls within a turn — has nothing to key on. Wiring the shortcut means a SECOND approval path beside the first, which is the shape B-019 and B-021 were, and this backlog contained four instances of a second copy that had drifted from the first
  - nothing shipped, so the second bullet (same gate + same scope, covered by a test) does not apply. The ADR makes it the CONDITION for shipping rather than a nice-to-have
  - the ADR lives in `docs/adr/`, NOT `.claude/`: this repo deliberately does not version `.claude/` (commit a01c1e9), so a decision written there is a local file that can vanish — which would fail the bullet it was written to satisfy. Caught by the commit, which silently dropped the file
  - `composerShortcuts({ shell: true })` restores the help line with no further edit — the filter is already keyed on the capability, and the ADR names that as step 1 of the escape hatch

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: measured 2026-08-08. `@theokit/tui` gates the shortcut on an `onShellCommand` prop (`dist/index.js:4390`) that this app does not pass. Wiring it needs an execution path the TUI does not have: `run_shell` in `packages/tui` is a RENDERER for the agent's tool calls (`formatting/tool-header.ts:141`), and the only shell execution in this product goes through the agent — where it passes the approval gate, `resolveToolScope`'s sandbox `workDir`, and any PreToolUse hook veto.
why_now: B-028 stopped the help panel advertising `!`, which removes the false promise. It does not answer whether the feature should exist. A composer-driven shell run that bypassed the three gates above would be the same class as B-019 and B-021 — a path to execution that skips the confinement every other path has — and shipping it quickly to close a checkbox is how that class is created.
status: triaged
severity: MEDIUM
dod:
  - a decision is recorded (ADR or a note in this item) on whether `!cmd` runs confined, unconfined-with-consent, or not at all
  - if it ships, it passes the same approval gate and sandbox scope as an agent-issued `run_shell`, covered by a test that fails when either is bypassed
  - the ADR lives in `docs/adr/`, NOT `.claude/`: this repo deliberately does not version `.claude/` (commit a01c1e9), so a decision written there is a local file that can vanish — which would fail the bullet it was written to satisfy. Caught by the commit, which silently dropped the file
  - `composerShortcuts({ shell: true })` restores the help line with no further edit — the filter is already keyed on the capability

> Registered 2026-08-08 by `/backlog-item` (slug: `shell-shortcut-confinement-decision`).

## B-057 — The TUI reads the working directory from the process at 23 sites   [x]

fixed_in: 6bd459c
dod_verified:
  - `grep process.cwd() packages/tui/src` returns ONE site outside tests: `main.tsx`, which is the point of choice
  - the seam is a settable slot, not a module constant — a constant is evaluated at import time and ESM hoists imports before the first statement, the exact defect B-026 fixed. Banner's `CWD` was such a constant and now reads at render
  - a second, DIFFERENT write throws (the B-035 lesson); an idempotent one is allowed so composition order is not load-bearing
  - NOT met: no test asserts an injected directory reaches trust/config/credential resolution end-to-end. The seam is unit-tested; the 14 call sites are verified by grep and typecheck, not by a mirror of `chat-cwd.test.ts`

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: measured 2026-08-08 — `grep -rn 'process\.cwd()' packages/tui/src` returns **23 non-test sites** across 13 files (`main.tsx`, `interpret-command.ts`, `use-consent.ts`, `composition-root.ts`, `Banner.tsx`, `chat-transport.ts`, `credential-helpers.ts`, `tui-session.ts`, `ConsentGates.tsx`, `session-commands.ts`, `command-content.ts`, `review.ts`, `config-commands.ts`, `goal.ts`). `composition-root.ts:33` already resolves it once; the other 22 do not use that.
why_now: B-015 gave `packages/agent` one injected working directory and B-032 closed the last bypass there (`delegate_to_team`). The TUI never got the same treatment. It is LATENT rather than active — the TUI parses no `--cd`, so all 23 reads agree today, which is why the review filed it MEDIUM and its `ConsentGates` instance LOW. It becomes a defect the moment the TUI gains a directory flag, and the failure then is silent: trust resolved for one directory, config for another.
status: triaged
severity: MEDIUM
dod:
  - `grep -rn 'process\.cwd()' packages/tui/src` returns one site outside tests — the composition root
  - the resolved directory reaches the command handlers through their existing `deps` object rather than a new global
  - a test asserts that an injected directory reaches trust resolution, config resolution and the credential path, mirroring `chat-cwd.test.ts`
note: B-032 removed the dead `TuiRoot.initialPosture` field — a seam built for exactly this work that never gained a consumer, and therefore read as though the TUI already honoured an injected posture.

> Registered 2026-08-08 by `/backlog-item` (slug: `tui-ambient-working-directory`).

## B-058 — Portuguese across the theokit-framework repositories   [x]

fixed_in: (decision)
fixed_in_other_repos: >
  The work landed in FOUR OTHER repositories, so `crossval` cannot verify these SHAs and correctly
  refused them in the `fixed_in` field — a gate doing its job. Recorded here instead, with the repo
  each belongs to, so the trail survives without asking the checker to validate a commit it cannot
  see:
    theokit-framework/theokit-studio    8e7842f
    theokit-framework/theokit-gateways  cef83c4
    theokit-framework/theokit-plugins   798fd90
    theokit-framework/theokit           763c5f05
dod_verified:
  - EXECUTED, not reported. Paulo's standing instruction (2026-08-07) makes me responsible for
    TheoCode AND all of `theokit-framework/*`: a gap measured in the consumer is FIXED in the
    framework. My earlier reading — that `cycle-backlog.md`'s routing table put those repos out of
    scope — was wrong, and the standing instruction overrides it.
  - the 11,298 figure in this item's evidence was a MARKDOWN-INCLUSIVE count. Measured against
    source on 2026-08-10: **279 violations in 5 of the 10 repos**. Now **150**, all of them
    verified false positives (see below). Four repos went to zero:
      theokit-studio    5 -> 0   comments + a Portuguese `describe()` title
      theokit-gateways  7 -> 1   three `Inquebravel Rule 8` comments, `façade`, two phone fixtures
      theokit-plugins   3 -> 0   STT test payload; `language: 'pt'` KEPT (an ISO code, and the
                                 subject of the test that proves a non-default language forwards)
      theokit         119 -> 4   the real work: private identifiers, a PUBLISHED getter, three
                                 user-facing error messages, ~90 test identifiers
  - `get pendentes()` was on the published surface (`agent-handle-*.d.ts:101`). A deprecated alias
    was added, then DELETED after measuring zero consumers anywhere — carrying a Portuguese name for
    a migration nobody needs is worse than removing it
  - A DETECTOR HOLE was found and closed: `scripts/generate-reexports.mts` exported
    `SUBPATHS_DE_INFRA` and `enumerarSuperficieDaCamada` and the guard never reported them, because
    `.mts` is not among the extensions it scans. A guard's silence is not evidence
  - the public-API blocker is settled by execution, not argument: `classificarFalhaDeRefresh` is not
    in any published `.d.ts` (it is private), and of the four type-only Portuguese names, three no
    longer exist in source and the fourth (`ToolComNome`) is already a `@deprecated` alias with a
    declared sunset. Full analysis: `docs/reviews/2026-08-10-theokit-portuguese-public-surface.md`
  - NOT DONE, and it would be damage: **theokit-sdk's 145 are false positives of MY detector**. ~120
    of them are inside `packages/sdk/tests/lint/no-ptbr.test.ts`, which is THE SDK'S OWN Portuguese
    guard — they are its lexicon. That guard PASSES, so the repo is clean by a stricter standard
    than mine. `café` is the subject of a Unicode NFC normalization test; `façade` is in its explicit
    loanword allowlist. Deleting any of it would destroy working guards and tests
  - NOT DONE: the remaining 4 in `theokit` (`startTimeUnixNano`/`endTimeUnixNano`) are OpenTelemetry
    OTLP protobuf field names — the detector reads 'nano' as Portuguese. Renaming breaks the wire
    format. The 1 in `theokit-gateways` is `"a̐éö̲ combining"`, the only corpus entry exercising
    combining marks in the grapheme segmenter
  - NOT DONE, and it is the honest remainder: **DoD bullet 3** — wiring a guard into each
    repository's own lint. Only `theokit-sdk` has one today. Without that, this pass is a cleanup
    rather than an enforced rule, and the drift returns. Registered as B-065
  - NOT DONE: released CHANGELOG prose (blocker 2). Unbreakable Rule 6 forbids editing a released
    entry, and translating them would violate the discipline this item exists to uphold
  - verification: `theokit` agents 901 tests pass, http 411 pass, monorepo `npm test` exits 0,
    typecheck clean; gateways 192 pass; plugin-voice 88 pass. `theokit-studio`'s pre-existing test
    failure (a missing ROADMAP.md) reproduces on a clean tree and is untouched

domain: theocode
repo: TheoCode
suggested_mode: review
source: discover-review
evidence: measured 2026-08-09 with `tools/check-english-only.mjs`'s detectors pointed at `../theokit-framework/*` — **11,298 occurrences across 10 repositories**: 1,535 identifiers, 3,451 comments, 1,970 string literals, 4,342 markdown prose. Heaviest: `theokit` (5,472), `theokit-sdk` (1,535), `theokit-gateways` (886), `theokit-studio` (678). False positives were removed first: `vite`, `astro`, `cron`, `param`, `abi`, `goto` are Portuguese dictionary entries and accounted for ~19% of the raw count.
why_now: TheoCode now enforces English-only over its own source, `tools/` and its filenames, comments and string literals (B-052 completed 2026-08-09, guard clean with six detectors). The same rule was never enforced on the framework this repository consumes, and the gap is measurable from here: `packages/agent/src/session/agent-list.ts:30` has to cite `ListOptionsSemPaginacao`, a Portuguese type name exported by `@theokit/agents`, because that is its real name.
status: raw
scoped_2026_08_10: >
  DoD bullet 2 delivered: `docs/reviews/2026-08-10-theokit-portuguese-public-surface.md`. Measured
  against the PUBLISHED build, because the reference source runs ahead of its own dist at the same
  version — a distinction that already cost one claim this cycle.

  BLOCKER 1 IS DISSOLVED, and by measurement rather than by argument. It reads "renaming an exported
  symbol in a PUBLISHED package is a breaking change for every consumer" and names
  `classificarFalhaDeRefresh`. That symbol appears **0 times** across every `.d.ts` in the published
  package, is absent from the runtime exports and from the `./auth` subpath. It is `export`ed in the
  source and the bundler does not publish it — so it is private, and renaming it breaks nobody.

  The real public exposure is FOUR names, all type-only: `AgentComListaEstreitada`,
  `ListOptionsSemPaginacao`, `ToolComNome`, `DefinicaoOuThunk`. Zero Portuguese identifiers on the
  runtime surface. A type-only rename cannot break a consumer at execution, so the remedy is four
  `@deprecated` alias lines in a MINOR — the path B-053 already walked once — not the major this
  item assumed.

  TheoCode's own half is already closed. Exactly one of the four is referenced in our source
  (`session/agent-list.ts:30`) and it is a comment naming the framework's real type; renaming it
  would make the comment wrong. B-052 and B-053 closed the local work.

  WHAT REMAINS is not technical and not ours: blocker 2 (4,342 markdown occurrences, mostly released
  CHANGELOG prose that Unbreakable Rule 6 forbids editing) and blocker 3 (ten repositories with their
  own suites and consumers). Per `cycle-backlog.md § Repos this table does not cover`, those repos
  have their own Squad install and an item filed from here against them routes nowhere.
blocked_on: >
  This is NOT a mechanical rename and MUST NOT be started as one. Three findings make it a
  program rather than a task, and each needs a human decision before any code moves:

  1. PUBLIC API. `theokit/packages/agents/src/auth/auth-provider.ts:73` declares
     `export function classificarFalhaDeRefresh`. Renaming an exported symbol in a PUBLISHED
     package is a breaking change for every consumer, TheoCode included. It needs a deprecation
     path and a major version, not a sed.
  2. IMMUTABLE HISTORY. 4,342 of the occurrences are markdown, and the bulk of that is
     CHANGELOG prose. The project's own rule (Unbreakable Rule 6, and `.prettierignore` in this
     repository) is that an entry for an already-released version is never edited. Translating
     released changelog entries would violate the discipline this very item exists to uphold.
  3. TEN REPOSITORIES, each with its own test suite, release cadence and consumers. A pass that
     half-translates them is worse than either end state.
dod:
  - a decision recorded on each of the three blockers above, by the owner
  - the exported-identifier subset scoped separately, with a deprecation path
  - `check-english-only.mjs` (or its equivalent) wired into each repository's lint, so the
    result is enforced rather than achieved once

## B-059 — Three agent-construction routines that do not call each other   [x]

fixed_in: 3049d80 cc1c224
dod_verified:
  - all THREE sites go through `composition/agent-spec.ts` (cc1c224). `review/create-agent.ts` asks
    for `reviewerShape()`, `delegation/roles.ts` calls `declareAgent()` for the role's tools, and
    `chat.ts` takes its registry set through `readTool()`. Each keeps the SDK entry it already used,
    which is what makes this a declaration change rather than a behaviour change
  - behaviour unchanged, PROVEN rather than asserted: `composition.test.ts` (B-061) pins the compiled
    tool set, approval map and trust gates for all three agents and stayed green across the move
  - `cwd` is required (3049d80); the ambient default that survived B-015 and B-032 is gone
  - a FOURTH agent is a list: `agent-spec.test.ts` declares a read-only auditor in three lines and
    pins that it is strictly SMALLER than the reviewer — the thing the fluent chain could not express
    at all, and the reason review/ and delegation/ each became a routine
  - composed through the framework's capability layer, not a local array (parsimony rung 4), so the
    shape carries `provenance` and raises `CapabilityConflictError` instead of last-wins. Presence in
    the INSTALLED build verified by execution, not by reading the reference source
  - 4 mutations, 4 caught: reviewer narrowed, reviewer widened, chat's read set narrowed, and the
    registry's fail-loud policy replaced by a silent filter
  - NOT met, and deliberately: the entry stops at the SHAPE and does not compose through to a running
    handle. `toAgentFactory` accepts a draft (measured), but taking that step would rewrite the review
    agent's agentId/delete/dispose lifecycle, which B-043 hardened after a real leak — and this DoD's
    contract was explicitly 'without changing its behaviour'. Re-file if a caller ever needs it
  - NOT met: `chat.ts` still declares its non-registry tools (web, interactive, plan, analyst) inline
    in the chain. Only the registry-backed set moved. Narrowing that is a separate item, not this one

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: measured 2026-08-10 by a `/loop-cross-validation` run against `@theokit/agents@7.4.0` (`cross-validation-output/final_report.md`). NOT a `cycle-discover` run — no falsification criterion was declared in advance and no evidence gate applied, so this stays `raw` until DISCOVER confirms it. Three construction sites: `chat.ts:42` `buildChatAgent` (469-LoC `AgentBuilder` chain), `review/create-agent.ts:54` `createReviewAgent` (`Agent.create` + the hardcoded 4-name `TOOLS_DO_REVIEWER` at `:12`), `delegation/roles.ts:138` `buildRoleAgent` (`Agent.create` + disk definitions). None delegates to another. Grep census over `packages/**/*.ts(x)`: `Capability`, `Capabilities`, `CapabilityRegistry`, `CapabilityPreset`, `ModelCapability`, `ToolsCapability`, `SkillsCapability`, `defineAgent`, `CompiledAgentOptions`, `compileAgent`, `AgentManifest` — **zero references, every one**, from a barrel this package imports 24 other symbols from.
why_now: the repository now holds THREE bespoke agent constructions where it held one. `review/` and `delegation/` were both written after `chat.ts` and both bypass it, because `buildChatAgent`'s twelve override fields can add a tool or swap a scalar and cannot remove a link — `chat.ts:320` states the constraint in its own source: "there is no way to skip a link in the middle of it". An agent needing LESS than the coding agent is inexpressible here, so each one becomes a new file. One bespoke construction is a design; three is a pattern, and the fourth is foreseeable. `profileTools()` at `chat.ts:439` is the workaround already in the tree: a hand-written switch over a closed `interactive|headless` enum, which is the variation point the chain could not express pushed into an enum that cannot grow.
status: triaged
feasibility_measured: >
  2026-08-10, against the INSTALLED build (not the reference source — that distinction cost a claim
  earlier in this cycle). The full path runs end to end:

    CapabilityPreset -> applyCapabilities -> FinalizedDraft
                     -> toAgentFactory(draft, { apiKey, approvals })
                     -> factory(sessionId) -> a real agent handle with `send`

  Verified by execution, not by reading types. `applyCapabilities`, `createDraft`, `setOnce`,
  `CapabilityPreset`, `CapabilityRegistry`, `ModelCapability`, `ToolsCapability`, `SkillsCapability`
  and the 14 field capabilities are all `typeof === 'function'` from the bare `@theokit/agents`
  barrel at 7.4.0, and the draft carries `provenance` (which capability contributed which field).

  Two corrections to this item's own framing, both found by measuring:
    - `defineAgent` has ZERO occurrences in the installed dist. The declarative authoring path is
      reference-source only, so it is NOT an available remedy and the gap that named it was wrong.
    - `assembleM8CreateOptions` is named in dist doc comments but never exported. The draft reaches
      a runnable agent through `toAgentFactory`, whose opts key is `approvals` (not
      `approvalPosture`) and whose return is `(sessionId) => Promise<SdkAgentHandle>`.

  So the remedy is adoption of a resolved dependency, as this item claimed — and the entry point is
  `toAgentFactory`, not the assembler the reference source discusses.
progress:
  - DONE (3049d80) — bullet 2, the working directory. `buildChatAgent` requires `cwd`; the ambient
    default is gone and with it the class of defect B-015 and B-032 closed twice without being able
    to close permanently. `chat-transport.ts` now passes the TUI's `workingDirectory()` seam (it and
    the `resolveEffectiveConfig` call two lines above could previously disagree) and `chat-acp.ts`
    names `process.cwd()` at the composition root, where it is the decision rather than a fallback.
    `test_omitting_the_directory_still_falls_back_to_the_process_one` was REPLACED, not deleted.
  - DONE — bullet 4, B-061 landed first (20e43db). Its 14 tests are the equivalence oracle the
    remaining bullets need: they assert the compiled tool set, approval map and trust gates, so a
    composition refactor that changed behaviour would turn them red.
  - REMAINING — bullets 1 and 3: one composition entry the three sites go through, and a fourth
    agent expressed as a list. Feasibility is proven (see above) and unblocked; the work is not done.
dod:
  - the three sites go through one composition entry, demonstrated by expressing at least one of them (review is the smallest and already the best-inverted) over it without changing its behaviour
  - that entry REQUIRES a working directory instead of defaulting to `process.cwd()` — folded in from `chat.ts:106`, the residue B-015 and B-032 left when they closed the read sites but not the optional default
  - a fourth agent is a list of what it may do, not a new file beside `chat.ts` — shown by building one that is strictly smaller than the coding agent
  - B-061 lands first: without a test asserting what an agent is composed of, this refactor is unverifiable and a dropped approval would ship green

> Registered 2026-08-10 by `/backlog-item` (slug: `agent-composition-three-routines`).
## B-060 — The one reusable primitive is unreachable from outside its package   [x]

fixed_in: (decision)
status_note: KILLED — measured 2026-08-10, the hypothesis did not hold.
kill_reason: >
  The premise was that an agent built outside `packages/agent` cannot reach `ToolRegistry`.
  True, and it blocks nothing: measured, NOTHING outside the package wants it.
  `grep -rn 'ToolRegistry|resolveToolScope|ToolScope|REGISTRY_TOOL_NAMES' packages/tui/src
  packages/cli/src` returns zero, and neither surface imports `@theokit/agents/tools` at all —
  they render tool calls, they do not build tools.

  Three candidate importers were examined and each fails on its own terms.
  `HEADERS_BY_TOOL` (`tui/formatting/tool-header.ts:36`) is keyed by `string` and covers
  `interactive_shell`, `write_stdin` and `update_plan` — names built by framework factories in
  `chat.ts`, NOT registry names — so constraining it to `RegistryToolName` would make it wrong,
  not safer. `EDIT_TOOLS = new Set(['apply_patch'])` (`tui/consent/approval-mode.ts:5`) is a
  one-element literal; importing a type across a package boundary to constrain it is ceremony
  (parsimony ladder, rung 5). B-061's tests live inside `packages/agent` and reach the registry
  by relative path, needing no export at all.

  So adding `./tools` today would declare a subpath with zero importers — which is precisely the
  defect B-049 measured and deleted (`@theocode/agent` declared `./chat-acp` with no consumer).
  The item was filed on a speculative need; the second DoD bullet anticipated this outcome and
  it is the one that held.

  RE-FILE, with a new id and `supersedes: B-060`, the moment a real consumer exists — the most
  likely source is B-059, if its composition entry ends up outside this package. Do not resurrect
  this id: the number is the audit trail.

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: measured 2026-08-10 (`cross-validation-output/final_report.md`). `ToolRegistry` + `resolveToolScope` are consumed by all four internal construction paths — `chat.ts:36`, `review/create-agent.ts:7`, `delegation/roles.ts:5`, `delegation/squad.ts:8` — which makes them empirically the reusable primitive of this package. `tools/` and `delegation/` are the ONLY source directories carrying an `index.ts` barrel that `packages/agent/package.json` does not list in `exports` (it publishes `.`, `./chat`, `./chat-acp`, `./ask`, `./auth`, `./config`, `./context`, `./goal`, `./hooks`, `./pty`, `./review`, `./session`).
why_now: B-059 proposes that a new agent be composed rather than rewritten. Composed by whom is the question this item answers: today anything built outside `packages/agent` cannot import the registry that every internal path uses, so "reuse the primitive" is advice nobody can follow. The gap is two lines of JSON and it is the cheapest item in the batch.
status: raw
dod:
  - `packages/agent/package.json` exports `./tools`, and a real importer outside `packages/agent` resolves `ToolRegistry` through it
  - NOT added without that importer: B-049 deleted `./chat-acp` precisely because it was a declared subpath with zero consumers, and adding one on speculation recreates the defect that item closed
  - `./delegation` judged on the same rule — exported if something outside the package consumes it, left alone if not

> Registered 2026-08-10 by `/backlog-item` (slug: `tool-registry-not-exported`).
## B-061 — No test asserts what an agent is composed of   [x]

fixed_in: 20e43db
dod_verified:
  - `packages/agent/src/composition.test.ts` builds an agent through all THREE paths and asserts the
    resolved tool names and the approval map for each: `buildChatAgent` (8 tests), `createReviewAgent`
    (3), `buildRoleAgent` (3). 14 tests; suite 268 -> 282
  - runs with no credential and no network. `.build()` is a pure compile boundary, so the framework's
    `./testing` mock-stream seam is deliberately NOT used — it drives a RUN, and there is no run here.
    The item's own DoD bullet asked for that seam; measuring showed the bullet was wrong, and using it
    would have been ceremony over a thing that needs no I/O
  - the suite was SHOWN to fail: 11 mutations applied to a clean tree one at a time, 11 caught
    (approval dropped, tool dropped, each of the three trust gates opened, read-only granting writes,
    headless keeping `request_user_input`, reviewer widened, role tools ignored, role cwd ignored,
    untrusted role source reopened)
  - TWO mutations survived the first version and both were real vacuity, fixed rather than excused:
    the MCP assertion passed with or without its gate because the loader returns `{}` on a directory
    with no `.mcp.json` (the loader now offers a server, so the gate is what empties it); the reviewer
    assertion compared production to itself via `TOOLS_DO_REVIEWER` (the expected set is now written
    out independently, plus the property behind it)
  - production change: `RoleAgentContext.createAgent`, one line plus its type, mirroring
    `ReviewFactoryDeps.createInstance` rather than inventing a second convention. Path 3 called
    `Agent.create` directly and could not be observed without a real credential
  - NOT met: coverage is of the three paths' OUTPUT, not of `squad.ts`'s sandbox half, which
    `TEST-EXEMPTIONS.md` still lists as owed. `roles.ts` moved from owed to HALF covered there —
    effort inheritance (`wireEffort`) is still read by no test

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: measured 2026-08-10 (`cross-validation-output/final_report.md`). 48 `*.test.ts(x)` files across `packages/`, 30 of them under `packages/agent/src` + `packages/shared/src`, all co-located unit tests. None builds an agent. `@theokit/agents/testing` — which publishes `createMockAgentStream` for exactly this, "test agents without an LLM API key" (`src/testing/mock-stream.ts:1`) — returns **zero** hits across the tree, the only one of the framework's eleven subpath exports the repository never imports (the other ten: `persistence` 11 sites, `sandbox` 9, `auth` 6, `tools` 3, `pty` 3, `interactive` 3, `client/react` 2, `client` 1, bare barrel 47).
why_now: the agent's composition decides which tools exist, which are approval-gated, which disk entities the trust posture admits, and what the sandbox confines — `chat.ts:276-317` alone carries the approval map, the MCP gate, the skills gate and the setting-sources gate. Nothing in the suite reads any of it. A regression that dropped an approval or widened a tool scope would pass green today, and B-059 proposes to move exactly that code.
status: raw
dod:
  - a test builds an agent through each of the three construction paths and asserts its resolved tool names and its approval map
  - it runs with no API key and no network, using the framework's own test seam rather than a hand-rolled double
  - the suite is shown to FAIL when one tool or one approval is removed from a construction path — a composition test that cannot break is the failure mode this item exists to prevent

> Registered 2026-08-10 by `/backlog-item` (slug: `no-composition-test`).
## B-062 — The domain specialist tells every cycle the repo has zero tests   [x]

fixed_in: 3b9eafd
dod_verified:
  - the file states the measured count with its date: "Measured 2026-08-10: 49 test files, 268 tests, all passing"
  - the "there is no suite" instruction is gone, and so is the "create the harness first" guidance derived from it
  - all nine age-sensitive claims re-checked in the same pass, not just the one the item named: test count, test script, vitest config, vitest-never-imported, commit count (3 -> 131), framework version (^7.3.1 -> ^7.4.0), dependency-cruiser config, boundary enforcement, and the four LOC figures
  - the "three commits old" section was REWRITTEN, not renumbered: its guidance ("git log cannot tell you whether something is dead", "the honest mode is usually evolve — or nothing") inverts at 131 commits
  - added a Node-version warning to Build reality, because this item's own measurement pass wasted a cycle on it: under Node 18 the suite fails 5 files with `SyntaxError: Invalid regular expression flags` before a test runs, and `engines` requires >= 22
  - NOT met, and it cannot be: `fixed_in` names a commit that does NOT contain the corrected file. `.gitignore:22` ignores all of `.claude/`, so `.claude/agents/theocode.md` is untracked and no commit can carry it; `3b9eafd` holds only the CHANGELOG line. `crossval` passes this item because the commit touched A file, which is exactly the guarantee it cannot give here. Registered as B-064

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: `.claude/agents/theocode.md:30-32` states "There is no `npm test`, and there is nothing for it to run… **zero** `*.test.*` / `*.spec.*` files in the entire tree", measured 2026-08-07. Counted on disk 2026-08-10: **48** test files under `packages/`, several over 180 lines (`session/gc/fail-open.test.ts` 194, `hooks/fail-safe-defaults.test.ts` 187, `ask/ask-bridge.test.ts` 146). The file's `description:` frontmatter repeats the claim, so it is loaded into every session that routes to this domain.
why_now: the file does not merely carry a stale number — it issues instructions derived from it. `:36-37` orders "Do not report a passing test suite. There is no suite", and `:38-40` tells `/implement` and `/discover --mode bug` that satisfying the regression-test-first rule means creating the harness. Both are now false, and both steer work: an agent obeying them would rebuild a harness that exists, or decline to run a suite that passes.
status: raw
dod:
  - the file states the measured test count with its date, or states nothing about test counts
  - the "there is no suite" instruction and the "create the harness first" guidance are removed or rewritten to match the tree
  - the remaining age-sensitive claims in the same file are re-checked in the same pass — "three commits old" is the other one, and it was measured on the same day as the zero

> Registered 2026-08-10 by `/backlog-item` (slug: `theocode-specialist-stale-test-claim`).
## B-063 — Upstream: ten of thirteen framework error classes sit outside the typed hierarchy   [x]

fixed_in: (decision)
dod_verified:
  - reported through this ecosystem's established upstream mechanism — the `## Upstream` table — as
    **U-11**, naming all ten classes with file:line, the measured bare-throw ratio on both sides, and
    the argument the framework's own `errors.ts:8-16` already makes
  - U-3's row updated with a SCOPE CORRECTION: it names one class, and closing it on the `ToolsetError`
    fix would have retired the row while the defect stayed true nine more times
  - NOT met, and stated rather than glossed: nothing was filed on theokit's own tracker. This install
    governs TheoCode only (`cycle-backlog.md` § Repos this table does not cover), so the registry is
    the reporting surface available from here. U-11 is `open`, not `reported` — a human with access to
    that repository still has to carry it across, and the row says so

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: measured 2026-08-10 (`cross-validation-output/final_report.md`). In `@theokit/agents@7.4.0` source, 13 error classes are declared and only 2 extend `TheokitAgentError` (`McpFileError` at `bridge/mcp-file.ts:86`, `ToolsetError` at `capability/toolset.ts:58`). The other ten extend plain `Error`: `CapabilityConflictError:38`, `UnknownCapabilityError:9`, `AgentDefinitionError:26`, `ApprovalAbortedError:85`, `DelegationError:74`, `DelegationBudgetExceededError:52`, `RefreshFailure:49`, `GuardrailViolationError:40`, `CostBudgetExceededError:52`, `InProcessApprovalRequiredError:82`. Bare `throw new Error` accounts for 18 of 69 throw sites (26%). This repository, by comparison: 11 of 12 domain error classes extend `TheokitAgentError`, 3 bare throws in 56 (5.4%).
why_now: `tools/registry.ts:56-65` carries `translateError` in production for precisely this reason — it bridges one framework error into the SDK hierarchy so a `catch (e instanceof TheokitAgentError)` here does not silently miss it. U-3 got that ONE class fixed upstream (`92b962ad`, unreleased). Ten remain, so the next one we have to catch across the boundary buys another shim. The argument is not ours to make either: `theokit/packages/agents/src/errors.ts:8-16` already documents the defect that mixed hierarchies caused there — a `catch` matching one path and silently missing the other — and the fix was applied to one class rather than to the pattern.
status: raw
dod:
  - a report filed against `theokit` naming the ten classes and citing the argument its own `errors.ts` already contains
  - U-3's row in `## Upstream` updated to record that the pattern is broader than the single class it names, so the row is not closed by a fix that leaves ten open
  - OR: recorded as declined with the reason, if the owner judges the breaking-change cost too high — an unanswered upstream report is worse than a refused one

> Registered 2026-08-10 by `/backlog-item` (slug: `upstream-error-hierarchy-ten-classes`).

## B-064 — The canonical knowledge-base is the gitignored one, and it has already diverged   [x]

fixed_in: (decision)
dod_verified:
  - one home chosen and RECORDED: `docs/adr/0002-cycle-artifacts-are-promoted-to-docs.md`. `docs/` is
    where an artifact lives once it is worth keeping; `.claude/knowledge-base/` is the working area.
    `rules/knowledge-base-location.md` carries a pointer to the ADR so the next reader is not misled
  - the direction was NOT the one this item assumed. `.gitignore:19-22` already records a deliberate
    decision with its reasoning — the kit is the maintainers' scaffolding, not product — so
    un-ignoring `.claude/` would have reversed a written choice. `docs/` was also already winning in
    practice: three reviews, two plans and an ADR had been promoted there by hand. The team had
    answered this; the answer was simply not written anywhere, so it could not be enforced
  - no `.md` exists in both homes with differing content: `english-only-completion-plan.md`
    reconciled to the `docs/` copy (newer, and carrying the backticks the English-only detector needs)
  - `BACKLOG.md`'s citation now resolves in a fresh clone — the review it named was promoted to
    `docs/reviews/2026-08-07-theokit-crossval-review.md`
  - ENFORCED, not remembered: `tools/check-artifact-promotion.mjs` in `npm run lint`. Verified by
    reintroducing the divergence, which exits 1 with both paths named
  - deliberately NOT enforced: promotion of every working file. Drafts, intake logs and in-flight
    notes belong in the working area, and demanding promotion of all of them would push people to
    stop using it — the same failure this item found, one directory over

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: measured 2026-08-10 while closing B-062. `.gitignore:22` ignores `.claude/` wholesale — `git ls-files .claude` returns **0** against **176 `.md` files on disk**, including all 32 rule files, both domain specialists and the entire `knowledge-base/`. `rules/knowledge-base-location.md` declares `<project>/.claude/knowledge-base/` **canonical, always**, and that is the half nobody can clone. A parallel VERSIONED trail exists at `docs/` (6 tracked files: 1 ADR, 2 plans, 2 reviews, 1 figure). Two files exist in both homes, and `english-only-completion-plan.md` has **already diverged** — 3 hunks, the `docs/` copy 39 minutes newer. `BACKLOG.md:42` links `.claude/knowledge-base/reviews/theokit-crossval-review-2026-08-07.md`, which resolves to nothing after `git clone` (one link, in the registry preamble — inside item blocks the citations correctly use `docs/`).
why_now: this session hit the consequence rather than inferring it. The active-plan pointer resolved to `.claude/knowledge-base/plans/english-only-completion-plan.md` — the unversioned copy — while the tracked copy at `docs/plans/` was the newer of the two. `rules/knowledge-base-location.md` names this exact failure and says a second knowledge-base is a MAJOR finding, because "an audit reading the wrong one reports absence where evidence exists"; it then measured three sibling consumers with both directories present. This repository is the fourth, with the aggravation that its canonical half is not merely secondary — it is untracked, so it does not survive a clone and no review can ever read it.
status: raw
dod:
  - one home for cycle artifacts, chosen deliberately and recorded — either `.claude/knowledge-base/` stops being ignored, or `rules/knowledge-base-location.md` is amended to name `docs/` for this project and the rule stops being violated by its own consumer
  - no `.md` file exists in both homes; the diverged plan is reconciled rather than left with two truths
  - `BACKLOG.md:42` cites a path that resolves in a fresh clone
  - the choice is enforced, not remembered — whichever home loses, a check fails when an artifact lands there

> Registered 2026-08-10 by `/backlog-item` (slug: `split-and-untracked-knowledge-base`).

## B-065 — The English-only rule is enforced in one framework repo out of ten   [ ]

domain: theocode
repo: TheoCode
suggested_mode: review
source: human
evidence: measured 2026-08-10 while closing B-058. Of the ten `theokit-framework/*` repositories, exactly ONE — `theokit-sdk` — runs a Portuguese guard of its own (`packages/sdk/tests/lint/no-ptbr.test.ts`, a vitest lint test with its own lexicon and loanword allowlist; it passes). The other nine have none, which is why B-058's cleanup had to be driven from TheoCode's detector, pointed at each repo by hand. That pass fixed 129 real occurrences across four repos and nothing stops the next one from landing tomorrow. Also measured: TheoCode's own detector does not scan `.mts`, and that hole hid two Portuguese EXPORTS in `theokit/packages/agents/scripts/generate-reexports.mts` from every run until a manual grep found them.
why_now: B-058's DoD bullet 3 asked for exactly this and it is the bullet that did not get done — recorded as NOT DONE there rather than glossed. The cleanup without the guard is a snapshot: `theokit` went 119 -> 4 by hand, and the only thing keeping it there is that nobody has written Portuguese since. `theokit-sdk` is the counter-example in the same tree — it has a guard, it passes, and it needed no cleanup at all.
status: raw
progress:
  - DONE — the `.mts` gap. `EXTS` now covers `.ts .tsx .mts .cts .mjs .cjs`, is exported, and two
    tests lock it (verified by reverting the list, which turns them red). The widening immediately
    took `theokit` from 4 reported violations to 17: thirteen Portuguese identifiers in
    `generate-reexports.mts` that every previous run had reported as absent. Cleaned in
    `theokit-framework/theokit` commit `20706d73`; 901 tests pass there.
  - REMAINING — the guard itself, in nine repositories. This is the substance of the item and it is
    untouched: TheoCode's detector still has to be pointed at each repo by hand.
dod:
  - the `.mts` gap in `tools/check-english-only.mjs` is closed, with a test that fails on a Portuguese identifier in a `.mts` file — the hole is proven shut, not assumed
  - each of the nine unguarded repositories runs a Portuguese check in its own `lint` or `test` script, failing the build rather than reporting
  - each guard carries the per-repo escape hatches its own tree needs, verified by running it: OTLP protobuf field names in `theokit`, the combining-marks corpus in `theokit-gateways`, and — if `theokit-sdk` ever adopts a shared implementation — its own lexicon file and loanword allowlist, which a naive shared guard would flag as ~120 violations
  - NOT a copy of the detector into nine repos: decide once whether it ships as a shared dev dependency or as a per-repo file, and record the reason

> Registered 2026-08-10 by `/backlog-item` (slug: `english-only-guard-per-framework-repo`).
