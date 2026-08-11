# Cross-validation TheoCode ↔ theokit

**Date:** 2026-08-07
**Target:** TheoCode @ `workspace` (4 commits, 12,626 LOC, 159 files)
**Ground truth:** API surface of `@theokit/agents@7.3.1`, `@theokit/tui@0.49.1`, `@theokit/sdk@4.40.0` (`.d.ts` on disk)
**Reviewers:** 6 parallel agents
**Verdict:** `NEEDS_FIXES`

---

## 1. Method note — what this report is NOT

The canonical `/review` of `cycle-review` **could not run**: `knowledge-base/{plans,audits,implementations}/` are all empty. Without a plan there is no ground truth, and the skill forbids reviewing without one ("review without plan is vibes").

What ran instead was a cross-validation against a **substitute, verifiable ground truth**: the theokit API surface on disk. This is not equivalent to a plan-based `/review` — it does not validate "what was promised vs delivered", it validates "what was written vs what the SDK already offered". That was the requested axis.

**Every claim about the SDK required an `file.d.ts:line` citation.** Each reviewer was explicitly instructed that "INFO: no problem found" is a legitimate answer and that inflating severity is a failure. The result contains **17 `ok` verdicts** — findings declaring the absence of a problem after measuring.

---

## 2. Scoreboard

| Reviewer | BLOCKER | HIGH | MEDIUM | LOW | INFO | Total |
|---|---|---|---|---|---|---|
| `agent-core` | **1** | 3 | 5 | 3 | 3 | 15 |
| `contracts-identity` | 0 | 4 | 6 | 2 | 5 | 17 |
| `persistence-session` | 0 | 4 | 9 | 1 | 3 | 17 |
| `tools-interactive-pty` | 0 | 3 | 8 | 2 | 6 | 19 |
| `sandbox-auth-config` | 0 | 3 | 6 | 3 | 2 | 14 |
| `tui-surface` | 0 | 2 | 7 | 1 | 6 | 16 |
| **Total** | **1** | **19** | **41** | **12** | **25** | **98** |

Verdicts: `non_idiomatic` 29 · `ok` 17 · `bug` 16 · `sdk_gap` 10 · `security` 7 · `reimplementation` 7 · `identity` 4 · `contract` 4 · `hygiene` 2 · `redundant_dep` 1 · `phantom_dep` 1.

**Deterministic gates:** `tsc --noEmit` PASS · `eslint .` PASS (0) · dependency cycles **0** across 184 modules / 465 edges · real orphans **0** · **tests: 0 files**.

Verdict `NEEDS_FIXES` per `cycle-review.md § Verdicts`: 1 BLOCKER (any BLOCKER blocks) and 19 HIGH (the cap is 2 with documented mitigation).

---

## 3. BLOCKER

### B-1 — The ACP surface registers a tool it cannot answer

`packages/agent/src/chat-acp.ts:25` calls `buildChatAgent()` with no argument → `declaredSurface` is `undefined` → `packages/agent/src/chat.ts:419` falls through to the `'interactive'` default → registers `request_user_input` against `AskBridge`, a module-level singleton **only the TUI subscribes to** (`packages/tui/src/agent-session/ConversationSlot.tsx:59`).

Every call stalls on the built-in's 5-minute default timeout (`sdk-tools/index.d.ts:735`).

The aggravating detail: `chat.ts:286`, **one screen above**, documents this exact defect — *"`request_user_input` is dropped in the headless profile: with no TUI subscribed, `ask()` never resolves and the tool falls into the built-in's 5-minute timeout"*. The code describes its own bug and then commits it on a different surface.

**Fix:** pass `surface: 'headless'` at `chat-acp.ts:25` — the same value `run-composition.ts:57` already uses.
**Declared limit:** proven by code path; the ACP surface was not executed.

---

## 4. HIGH by theme

### 4.1 Wrong identity exposed to the user (4 findings)

The product is called **TheoCode** everywhere that is a *contract* (`package.json:2`, `NOTICE:1`, both `bin` entries, README, commit `b0fbda1`) and **"Theokit Builder"** everywhere that is *speech*:

| Site | What the user sees |
|---|---|
| `packages/agent/src/context/instructions.ts:1` | system prompt: *"You are Theokit Builder … on `@theokit/sdk`"* |
| `packages/shared/src/agent.ts:9,12` | `name` and `greeting`, printed at session start |
| `packages/tui/src/components/Banner.tsx:9` | banner (imports `AGENT` at `:6` then shadows it with a literal) |
| `packages/tui/src/theme.ts:45`, `ConsentGates.tsx:71` | **the consent dialog** |

Measured: **82 imports of `@theokit/agents`, 0 of `@theokit/sdk`**. The agent confidently tells the user it runs on an SDK it does not use — and the dialog asking for filesystem and command-execution permission does so in the name of a product that does not exist. Six literals across five files; the fix is mechanical.

### 4.2 Security (3 findings, no BLOCKER)

Both credential leakage and sandbox bypass were searched for. **Neither exists** (SAC-13, SAC-14): all credential I/O is delegated to the SDK, which writes 0600 and chmods; error messages carry variable names and paths, never key material; terminal echo is disabled (`login.ts:46-48`); all 8 trust capabilities are wired to a gate; hook execution is fail-closed at two points; the built-in `shell` tool is vetoed; every production `ToolScope` goes through `resolveToolScope`, which always installs `createSandboxBackend`.

What remained:

- **SAC-01 — the consent store is held to a weaker standard than the credential store.** `~/.theokit/trusted-dirs.json` holds both which directories are trusted *and* which hook command lines are pre-approved — and a hook is `spawn(cmd, {shell: true, detached: true})` (`hook-runner.ts:39`). Neither reader (`trust-store.ts:19`, `hook-trust.ts:73`) checks permissions, and `mkdirSync(..., {mode: 0o700})` is a no-op on an existing directory, with no `chmodSync` to repair it. The directory is **shared** with the SDK's transcript root, created without a mode — whoever gets there first sets the permissions. The SDK does the opposite for a store of comparable sensitivity (`assertSecureModes` refuses a group/other-writable dir). That SDK gate is private — the "exportable gap" half of this finding.
- **SAC-02 — the two surfaces disagree on when to stop asking.** Headless refuses to auto-approve without an enforced sandbox, in writing (`approval-policy.ts:19-27`: *"refusing instead of claiming a confinement that does not exist"*). The TUI auto-approves every tool under `full-auto` with **no** posture check (`use-approvals.ts:44` → `approval-mode.ts:13` returns `true` unconditionally) — while the same screen renders `sandbox:<mode> ⚠ tool-gating`, telling the user confinement is absent.
- **SAC-03 — the config layer stack has no security floor.** `sandbox_mode` and `approval_policy` are last-wins scalars; `env` (50) and `project` (30) outrank the user's own file (20). The codebase **already reasoned this through once**: `ACCUMULATING_KEYS = ['hooks']` exists so a project cannot displace the user's global guard (`config.ts:202`, rationale at `:92`). The same argument applies verbatim to the two sandbox keys and was not applied.

**Escalation scenario tested and REFUTED:** cloned repo → `.theokit/config.toml` with `approval_policy: never` → auto-approval. **Does not close.** The `projectConfig` gate (`trust-posture.ts:11-16`) states literally that the project layer *"is not read: … `sandbox_mode`, `approval_policy` and hook list stop applying"*. Explicit trust is required first. Hence HIGH, not BLOCKER — but trusting a directory ≠ consenting to run without confinement.

### 4.3 Deletion paths whose guards fail open (4 findings)

- **PS-001 — two siblings, opposite postures.** `gc/filesystem.ts:103-110` and `:125-132` do `catch { return undefined }` when reading the live-session pointer. Its sibling `gc/per-session.ts:56-68` (`resolvePointerId`, **already exported**) treats the same condition as fail-fast: *"refusing to GC (would risk the live session)"*. An EACCES/EIO becomes "there is no live session", and **both** layers of the guard fail open together, silently.
- **PS-002 — a guard declared, wired, and never called.** `hasLiveWriter` is a **required** field of `OpcoesPlanoAll` (`all-sessions.ts:51`), wired to the SDK's `sessionHasWriter` (`filesystem.ts:102`). Its only uses are `:275`/`:277`, inside `backstopRefusal`, and `:274` short-circuits everything that is not a lock. Transcript deletion consults the lease in no phase. *A guard that is declared and never invoked is worse than an absent one — it reads as protection.*
- **PS-003** — `parseTranscript` reimplements `loadJsonl`, including the tolerate-truncated-last-line behaviour the SDK exposes as a flag (`tolerateTrailingPartialLine`), and throws a bare `SyntaxError` where the SDK throws a typed `JsonlParseError` carrying the line number.
- **PS-004** — the ~740 LoC that delete transcripts, registry entries, orphan locks and temp files have **zero tests**, even though every options interface was designed as an injectable seam. PS-002 is precisely the class of defect a single test would catch.

Honest mitigation: real data loss requires several guards to fail together (the transcript must also be past `maxAgeDays`, outside `keepLast` and absent from the registry). Hence HIGH, not BLOCKER. No live repro was constructed.

### 4.4 Ask-bridge — two defects with direct user impact

- **TIP-03** — `abandonar()` (`ask-bridge.ts:32-35`) calls `pending.delete()` and drops the promise **without settling**. The `resolve` was captured in `perguntar()`'s closure (`:26`) and is discarded; worse, `perguntar` never captures `reject` — **there is no path to reject**. ESC frees the UI and leaves the turn stalled for the 5-minute timeout.
- **TIP-04** — `createQuestionTool` only catches `err.message === "timeout"` (`sdk-tools/index.js:1787`); `ConcurrentQuestionError`'s message is a Portuguese sentence, so it hits `throw err` and escapes the handler. The `code: 'question_already_pending'` never reaches the model.

### 4.5 A packaging contract that was never executed

- **CI-007** — both declared `bin` entries **break on first invocation**, from two independent causes: neither entrypoint has a shebang (the shell runs it as a script and `import` resolves to the ImageMagick binary — reproduced), and even forcing `node` it fails with `ERR_MODULE_NOT_FOUND` because it is raw TypeScript. Mitigation: all 4 packages are `private: true` and real usage goes through `tsx`.
- **CI-004** — a real phantom dependency: `tools/build-cli.mjs:46` calls `createRequire().resolve('@theokit/sdk/package.json')`, declared in **no** `package.json`. It works only via hoisting and degrades silently (auto-compaction off) instead of failing loudly.
- **F-tui-1** — `figlet` is a **dead** dependency: its only occurrence in the repo is its own declaration line; the path that would reach it (`renderFigletArt`/`WelcomeBanner`) is never called — the logo is a literal at `theme.ts:17`.
- **F-tui-2** — `Banner.tsx` reimplements `WelcomeBanner`; the docstring of `WelcomeBannerProps.aside` (`tui/index.d.ts:938-945`) **literally names** the two headings rewritten by hand.

---

## 5. What TheoCode proved about theokit

This is the reason the product exists, and the result is good in both directions.

### 5.1 The loop has already worked — with documentary proof

The `Toolset` docstring (`agents/index.d.ts:798-801`) cites **this very file** — *"`agents/tools/registry.ts` from agent-builder, 170 LoC"* — as the reason the primitive exists in the SDK. It is now 108 LoC delegating `from/get/resolve/names`. Same for `forkTranscript`: `transcript-ops.d.ts:5-8` names *"`agents/lib/session/backtrack.ts:188` (agent-builder) wrote straight into the session store with a bare `writeFileSync`"*. That regression is closed, and the `beforeRecordIndex` index alignment was verified, including the truncated-last-line case.

**TheoCode generated primitives in theokit and then consumed them. That is validation working.**

### 5.2 SDK gaps to fix upstream (10 `sdk_gap` findings)

Ownership note: TheoCode and `theokit-framework/*` share a maintainer, so these are fixed at the source rather than merely filed.

| # | Gap | Evidence | Status |
|---|---|---|---|
| 1 | **No session GC/retention primitive.** An exhaustive grep for `gc\|prune\|cleanup\|sweep\|purge\|retention` across both packages' public and internal `.d.ts` returns only in-memory pooling and `Task.retentionMs`. The 31-line barrel exports every ingredient and no collector — and the never-delete rule `forkTranscript` already internalises is re-derived by hand in `all-sessions.ts` | `agents/persistence.d.ts:1`, `transcript-ops.d.ts:12-19` | open |
| 2 | **`toErrorJson` matches the superclass first**, discarding `max`/`liveSessionIds` from `MaxSessionsError` — the fields `sdk-pty`'s docblock says exist "by design" for the model to act on. There is no `onError` seam; changing one line requires forking schema + handler | `sdk-tools/index.js:1006`, `sdk-pty/index.d.ts:33-37` | open |
| 3 | **`ToolsetError extends Error`**, outside the `TheokitAgentError` hierarchy — the SDK argues against this itself elsewhere | `agents/index.d.ts:824`, `bridge-entry:2162` | open |
| 4 | **`assertSecureModes` is private** (absent from `sdk/auth/index.d.ts`) — consumers cannot apply the same permission check to their own store | SAC-01 | open |
| 5 | **`@theokit/agents/auth` omitted the OAuth engine** that `@theokit/sdk/auth` exports | SAC-07 | **fixed** (theokit M112) |
| 6 | **No export answers "what may this sandbox mode write?"** — hence `sandboxWritePolicy` as a second oracle over the SDK's own three-mode vocabulary | SAC-09 | open |
| 7 | **No component composes ASCII art with a right-hand aside**: `WelcomeBannerProps` has no `art`, `BannerProps` has no `aside` | `tui/index.d.ts:938-945`, `:1442-1458` | open |
| 8 | **`readJsonlTail` returns no absolute index**, so the fork path cannot migrate (the preview path can) | `transcript-ops.d.ts:57-73` | open |
| 9 | **The temp-file naming convention is private** (`${path}.${pid}.${hex}.tmp`), absent from any `.d.ts` — TheoCode's sweeper copies it via regex from a chunk file | `chunk-5XPKYDK7.js:33` | open |
| 10 | **`ToolComNome` is an exported type name in Portuguese** in a published `.d.ts`, as are the `Toolset`/`QuestionToolOptions` docblocks. Half of the naming problem is not on our side | `agents/index.d.ts:821` | open |

**U-5 fixed on 2026-08-07:** `ensureFreshCredential`, `persistOAuthTokens`, `refreshOAuthTokens` and `extractAccountId` now cross `@theokit/agents/auth` (theokit M112, changeset `tidy-doors-open-oauth-engine`, TDD: 32/32, full agents suite 895 passing). `resolveCredential` deliberately stays out — two functions share that name with divergent semantics — and is now locked by an explicit test, because opening the neighbouring subsystem creates the symmetry that would invite the mistake.

---

## 6. Premises of mine that were refuted

Recorded because the value of this report depends on it.

1. **"TheoCode imports 3 symbols from `@theokit/tui` out of 145+"** — wrong, it is **34**. My grep only captured single-line imports. Consumption is substantial.
2. **"24 SDK Capabilities ignored ⇒ reimplementation, HIGH"** — wrong. The SDK docstring settles it (`index.d.ts:472-475`): the layer produces *"the EXISTING narrow waist (`CompiledAgentOptions`)… No new spec and no new adapter were invented"*, and the registry serves **file-based** authoring, a case TheoCode does not have. The 12 relevant capabilities have `AgentBuilder` twins, which TheoCode uses. **Zero reimplementation findings in the core.**
3. **"`atomic-write-temp.ts` reimplements `atomicWriteJson`"** — wrong. It is a janitor for the temp files `replaceFileAtomic` abandons on crash; the SDK does fsync + rename correctly, with no divergence in guarantees. The real defects are elsewhere (dead code, coupling to a private format, and the *safer* logic being the one nobody runs).
4. **"`figlet`/`lowlight` are redundant deps"** — partly wrong. Both are **optional** `peerDependencies` of `@theokit/tui`; declaring them is the correct mechanism. Only `figlet` is a defect, and a narrower one: the switch was flipped and nothing was plugged in.

---

## 7. What is right

Not only problems — 17 measured `ok` verdicts:

- **Exemplary Apache-2.0 provenance.** `NOTICE` + `licenses/` + README satisfy §4(a) and §4(d); all 4 adapted components resolve on disk; `NOTICE:43-48` even **narrows** its own claim by measuring that two upstream components are absent from this tree. **Zero licence findings.**
- **Zero `public-copy.md` violations** in the README, which self-declares as "unverified".
- **No committed secret**; the 4 hits in `.env.example` are format strings and prefix constants.
- **No phantom dependency in `src/`** — all 4 workspaces declare what they import; the 5 undeclared `@theokit/*` are legitimate transitives (except `tools/build-cli.mjs`).
- **Correct concurrency posture:** the SDK takes the lease internally, `sessionHasWriter` is used as an advisory check, and the plan/apply TOCTOU window is explicitly re-checked.
- **`ToolScope` is not a gap** — `index.d.ts:807-809` delegates scope to the consumer on purpose.
- **0 dependency cycles.**

---

## 8. The denominator: zero tests

`find packages -name "*.test.*"` → **0**, with vitest `^3.0.0` installed, no `test` script, no config. 12,626 LOC.

Without moralising, just the measured cost: each of these would die in a single smoke test — the two broken `bin` entries, `hasLiveWriter` never called, `abandonar()` without settling, ACP without a surface. The repository still ships `hooks-test-helpers.ts` and injection seams built at `session-pty-owner.ts:25-26` — fixtures for a suite that does not exist.

---

## 9. Suggested fix order

1. **B-1** — `surface: 'headless'` at `chat-acp.ts:25` (one line).
2. **Identity** — 6 literals across 5 files (mechanical, and it is what the user sees).
3. **TIP-03** — settle the promise in `abandonar()`.
4. **PS-001/PS-002** — use `resolvePointerId` in both readers; call or remove `hasLiveWriter`. **Write the tests first** (`rules/testing.md § 3`: business rules on a deletion path).
5. **SAC-02/SAC-03** — posture check in the TUI; security floor on the two sandbox keys.
6. **SAC-01** — `chmodSync` plus a permission check on the consent store.
7. `CHANGELOG.md` (Unbreakable Rule 6, done), `.gitignore:62-63`, `figlet`, the phantom in `build-cli.mjs`.

## 10. Limits of what was verified

- Nothing was **executed** beyond `tsc`, `eslint`, `depcruise` and invoking the two `bin` entries. The runtime findings (ACP, GC, unhandled rejection) are proven by code path.
- Gap #1 (no GC in the SDK) comes from an exhaustive `.d.ts` grep; a runtime export without typings would escape it.
- SAC-01 rests on the SDK's security docstring; if that is stale, the finding degrades to a documentation defect.
- `agent-core.yaml` was written with invalid YAML by its reviewer (the only one that did not self-validate) and was mechanically repaired here; content preserved.

**Audit trail:** `.claude/agents/review-theokit-crossval-2026-08-07/findings/*.yaml` (98 findings with evidence on both sides).
