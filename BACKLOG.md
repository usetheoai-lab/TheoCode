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

## Items

Next free id: **B-018**

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
| U-3 | `ToolsetError extends Error`, outside the `TheokitAgentError` hierarchy — the SDK argues against this itself elsewhere | `agents/index.d.ts:824`, `bridge-entry:2162` (TIP-15) | open |
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
