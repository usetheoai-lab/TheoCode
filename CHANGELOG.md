# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **The transcript collapses by default, and ctrl+o expands it** — the resting state Claude Code shows. A run of adjacent tool calls renders as one dim count line (`Used 1 tool`, `Ran 2 shell commands`) instead of a stack of cards, so a long turn no longer pushes the answer off the screen; ctrl+o flips to the full cards and puts `Showing detailed transcript · ctrl+o to toggle` under them. Built on `AgentTimeline`'s `verbose` and `footer` (usetheokit/theokit-tui#61), so the collapsing is the toolkit's and only the key binding is ours — which is the split the toolkit asks for: it exposes the flag and names ctrl+o in its own docblock, the app decides which key flips it. A reading gesture gets a key rather than a slash command because it is reached mid-answer, with the eye on the output. The router puts it after the ctrl+c branch and the surface guards, so it cannot shadow the interrupt or steal a key from a prompt that is waiting for an answer — both pinned by tests, since a shortcut that swallows ctrl+c is worse than no shortcut. It is listed in `?` too: a shortcut absent from the help panel is a shortcut nobody finds.

### Changed

- **Four tools stopped rendering as their raw snake_case names.** `git_diff`, `grep`, `list_dir` and `read_file` are in this product's registry and were never in its header table, so they reached the timeline as `git_diff` rather than `Diffed`. `defaultToolHeader` (usetheokit/theokit-tui#53) answers all four, and is now composed *after* our own table rather than replacing it. The order is the point: the toolkit's default is deliberately tool-agnostic — it answers `run_shell` with a bare `Ran`, no target and no tense, because "guessing which input key holds the file is exactly the app-specific knowledge the seam exists to keep out". Swapping our seven entries for it would trade `Running echo hi` for `Ran` and call it an upgrade. `view_image` gets an entry of its own, since neither table had one.

- **Dependencies taken to their published latest, across a MAJOR.** `@theokit/agents` 11.0.0 → 12.1.0, `@theokit/tui` 0.78.0 → 0.79.0, and the transitive `@theokit/sdk` to 4.63.3. Two migrations were required and both are behaviour, not types — the type checker was green before and after each one.

  **`@theokit/agents/pty` moved to `@theokit/agents-pty`** (the 12.0.0 break). Installing `@theokit/agents` no longer compiles a terminal: `@theokit/sdk-pty` carries a native postinstall that every consumer paid for, measured upstream at 6.7 s against 1.4 s without it. Two imports here move and `@theokit/agents-pty@^0.2.1` is declared where the backend is actually used, in `packages/agent`. The old subpath still resolves and throws a sentence naming its replacement, so this was never going to fail as a missing module.

  **Transcript filenames became UUIDs**, and that one had to be found by running the suite. Eight tests across two files failed as *empty results* — `expected [] to have a length of 2` — because both fixtures composed `<base>/projects/<encoded-cwd>/<id>.jsonl` by hand and the reader now looks for `<uuid>.jsonl`. The SDK documents this exact failure beside `projectsRoot`: a consumer's enumeration is guarded with `existsSync(root) ? readdir(root) : []`, so a path that no longer matches *returns nothing instead of throwing* — "a wrong path that throws is a bug report; a wrong path that returns nothing is a collector that quietly stopped collecting". Both fixtures now ask `transcriptPath(base, cwd, id)` for the path, and the assertions compare against the path they were given rather than against a filename they expected the layout to produce. Production code never built these paths by hand; only the fixtures did, which is why nothing but the tests moved.

- **`@theokit/sdk` is pinned in `pnpm-workspace.yaml`, because three sources disagreed about which version was installed.** `pnpm-lock.yaml` said 4.53.1, `node_modules/@theokit/sdk/package.json` said 4.54.0, and the bytes on disk contained `prompt_cache_key` — which only exists from 4.55.0. The tree was a stale lock entry overlaid with a local tarball installed during the Codex cost measurement, plus a flat `node_modules/@theokit/` directory left by an `npm install` in a pnpm workspace, which won resolution over pnpm's own links. An `overrides` floor of `^4.63.3` makes the resolution answer to something a reader can check, and the transitive SDK now genuinely carries the cache fixes (`prompt_cache_key` in 11 files, `input_tokens_details` in 8, against 4 before).

### Added

- **Every Codex command name is answered instead of refused.** Measured against `codex-rs/tui/src/slash_command.rs`, which declares 58: `unknown command` was the reply to about thirty of them — accurate and useless, since more than half have an equivalent here under a different name. Five became real commands (`/theme`, `/agents`, `/permissions`, `/exit`, `/pwd`); the remaining 24 answer with the equivalent (`/permissions` → "split in two here: /approval … /sandbox …") or say plainly that there is none. The ones pointing at a real feature are in the `/` menu, because that is where a person discovers `/approval` exists; the ones that only report an absence answer when typed but stay out of it — a menu where a third of the entries say "we don't have that" is worse than a shorter menu. Three upstream debug hooks (`debug-m-drop`, `debug-m-update`, `test-approval`) are deliberately not mirrored. Own verbs are matched first, so implementing one of these for real takes over from its pointer automatically.

- **`/title` sets the terminal window title, and chooses what it carries** — product, working directory, model, session; `app dir` by default. It updates when the underlying fact changes rather than once at startup, so `/model` and `/fork` repaint the tab, and it restores the terminal's own title on exit using xterm's title stack rather than blanking it (an empty tab is not what the user had). Nothing animates during a stream: a tab bar repainting mid-turn is what makes people switch the feature off. Sanitisation is load-bearing, not decorative — the toolkit THROWS on a control byte and `/model` accepts any word.

- **`/statusline` chooses which facts the footer carries** — model, effort, approval, sandbox, goal, auth, context; all of them by default, because nobody asked for fewer facts, they asked to be able to choose. `/statusline default` restores. The separator is not a `join`: `model` and `effort` stay one phrase (`gpt-5.6-terra medium`), so turning the feature on changes WHICH items appear without redesigning how the rest look.

- **`/raw` prints the last reply — or `/raw all`, the whole conversation — into the terminal's own scrollback**, so it can be selected with the mouse without box borders or hard-wrapped lines. It is deliberately NOT a mode, and is named accordingly everywhere it appears. Two measurements say a mode is unreachable: `AgentTimeline` takes no render-mode prop, and Ink's `textWrap` admits only `wrap | hard | truncate-*` — there is no "leave the line alone", so any text inside Ink's layout is hard-wrapped with real newlines. Copy-friendliness is a property of text that never entered the layout, which is what printing to scrollback gives.

- **`/exit` and `/pwd`, the two names Codex answers to and this build did not.** Codex routes both `/quit` and `/exit` to the same verb; here `/exit` was an unknown-command error, raised on the way OUT of a session — the least forgiving moment to be pedantic about a synonym. `/pwd` answers "which directory is this session in" without opening the status panel to read one row of it.

- **`pnpm dev:banner [columns]` prints the welcome banner at a chosen width (#61).** Every layout change to it previously had to be verified by launching the TUI, authenticating, and trusting a directory — so it usually was not verified at all, which is how a wordmark that truncated the working directory shipped. `pnpm dev:banner 80` renders the narrow branch in under a second. (#61)

- **`pnpm deps:theokit` reports what is out of date in the `@theokit/*` dependencies.** `pnpm outdated` cannot answer this: measured on pnpm 11.22.0, it reports only root `devDependencies`, so `--prod` comes back empty and every `@theokit/*` package — all of them `dependencies` of the four workspace packages — is invisible. `@theokit/agents` sat at 10.1.0 with 11.0.0 published and the command reported the tree as current. The new check enumerates every manifest, delegates the registry lookup to `pnpm view`, flags majors, and exits non-zero when something is behind. (#59)


- **`/status` reports the `AGENTS.md` chain (#61).** It was the one trust-gated INSTRUCTION source with no listing anywhere: `/skills`, `/mcp` and `/hooks` each report what survived the gate, and the file that most directly steers the model reported nothing. The case that matters is the silent one — an untrusted directory drops it, so the agent runs without the rules the repository wrote for it and no screen says so. The row distinguishes three states that are not interchangeable: no agent built yet, a chain REFUSED by trust (with the count of files ignored), and a repository that genuinely has none. Codex reports the same fact on its own status panel (`Agents.md: <none>`). The listing and the loader share one traversal, so they cannot name different files.

- **`npm ci` could not install this repository, and `npm install` installed the wrong `@theokit/agents`.** Two failures with one cause: the lockfile was never regenerated after the manifests moved. `npm ci` refused outright — `lock file's eslint@9.39.5 does not satisfy eslint@10.9.1` — which is every CI job, since all five run it. And `npm install` succeeded while pinning `@theokit/agents@10.1.0` against a `^11.0.0` manifest, marking its own output `invalid` and carrying on; the tree then failed `typecheck` on `onError`, a field only 11.0.0 has. Both were invisible in development because the working tree is installed by **pnpm**, which reads `pnpm-lock.yaml` and resolves correctly. `npm install --package-lock-only` does NOT fix it — it reconciles a lockfile, it never reconsiders a resolution already pinned there, so it corrected the eslint range and left `agents` at 10.1.0 through repeated runs. Regenerating from scratch does (`rm package-lock.json && npm install`), which is how the current lockfile was produced: `eslint@10.9.1`, `@theokit/agents@11.0.0`, and `npm ci` clean. The underlying condition — two lockfiles for one repository — is unchanged and will do this again the next time a manifest moves without one of them being regenerated.

- **Dependencies brought to their published latest.** `@theokit/agents` 10.1.0 → 11.0.0, `@theokit/presenter` 0.7.0 → 0.8.0 (11.0.0 requires exactly 0.8.0, so the root override moved with it), ESLint 9.39.5 → 10.9.0, Vitest 3.2.7 → 4.1.11, `dependency-cruiser` 18.1.1 → 18.2.0, `typescript-eslint` 8.67.0 → 8.68.0, esbuild 0.28.1 → 0.28.2, TypeScript 5.9.3 → 6.0.3. All five CI gates green afterwards. (#59)

- **TypeScript stays on 6.0.3 rather than the published 7.0.2, and the reason is a gate that went quiet.** Under TS 7 the lint job dies outright (`typescript-eslint does not support TS 7.0`), which is loud and fine. `depcruise` is the problem: it reported **`✔ no dependency violations found (0 modules, 0 dependencies cruised)`** and exited 0. The gate that enforces the direction of dependency — `tui`/`cli` consume `agent`, `agent` consumes neither, which `README.md` calls "the whole design" — passed green having read nothing, because `dependency-cruiser` declares `typescript: >=2.0.0 <7.0.0` and degrades to a warning instead of a failure. On 6.0.3 it cruises 215 modules and 545 dependencies. Revisit when both tools publish TS 7 support. (#59)

- **`@types/node` stays on the 22 line.** 26.2.0 is published, `engines` declares `node >=22` and the runtime here is 22.22.2. Typing the code against APIs the runtime does not have trades a real guarantee for a version number. 22.20.1 is the newest 22.x. (#59)

- **`pnpm` installs this repository again.** `pnpm-workspace.yaml` held only the `allowBuilds` prompt pnpm writes when it needs a decision — no `packages:` key, so pnpm saw no workspaces at all. It now declares the roots, sets `linkWorkspacePackages` so pnpm reads the internal `"*"` ranges the way npm workspaces already does (the CI runs `npm ci` in all five jobs and had to keep working), and approves the two builds that are load-bearing: esbuild, which the bundler needs, and `node-pty`, the native addon behind `interactive_shell` and `write_stdin`. (#59)

### Changed

- **The agent reaches the same result in half the rounds — and, on one task, a materially BETTER one (#63).** Measured against Codex on identical tasks, same model (`gpt-5.6-terra`) and effort: on a four-requirement spec task we spent 50,315 tokens over 10 tool calls where Codex spent 18,084, and we produced a WRONG answer that passed its own tests. The spec said "`balance()` must not accumulate floating point error" and illustrated it with `0.1 + 0.2`; the agent hard-coded two decimal places, satisfied the one example, and violated the rule — `0.005 + 0.005` returned `0.02`, double, in a money type. It then wrote its own tests choosing cases its implementation already passed. `BASE_INSTRUCTIONS` now carries a section saying an example ILLUSTRATES a rule and never defines it, and that self-written tests must include cases you did not already know the code handles. Alongside it, a round-economy section: do not explore for files the task already named, do not re-read a file `apply_patch` just wrote (it is atomic and reports what it wrote), and run the exact command the task names. Two instructions that CAUSED the waste were removed — the coding loop opened with "plan first, then loop" on exactly the linear tasks rule 1 forbids a plan for, and told the agent to spend a call ticking the last box when green. Re-measured on the same task: 5 tool calls instead of 10, 24,914 tokens instead of 50,315, zero `update_plan` calls, and all four precision cases correct — byte-comparable with Codex. On an RFC 4180 CSV task both agents now agree on all nine probes, including the five the spec never mentions.

- **`/theme dark|light|no-color` switches the colour theme live.** It could only REPORT: the theme was a module constant handed to the provider as a fixed prop, so the resolved value could be described and never changed, and a user on a light terminal had to set `THEOCODE_THEME` and relaunch. The provider now subscribes to a one-slot session override through `useSyncExternalStore`, so a pick repaints the mounted frame. The environment stays the DEFAULT and the override is deliberately not persisted, for the reason `/memory off` is not either — a durable preference belongs in config where it can be reviewed, not in a switch someone flipped once and forgot. It outranks `NO_COLOR` on purpose: an ambient accessibility signal loses to one typed just now by the person watching the screen. `/status` says which of the two is in force, because "light, because you asked" and "light, because the environment says so" are different facts.

- **`/cd` stays unimplemented, and the reason is now recorded in the code.** Codex has it; making it work here is not a matter of relaxing the second-write refusal in `working-directory.ts`. Only the agent would follow the move — the composition root reads the directory once and memoises, so the session pointer, the PTY owner, and the custom commands loaded at the FIRST directory's trust level all stay behind, and `reloadConfig()` re-reads the directory the session has left. The security shape is the decisive one: consent state is seeded once, so moving into an untrusted directory would not raise the trust gate, and approving a gate raised for the old directory persists trust for the new one. A `/cd` that moves the path and leaves the posture is worse than no `/cd`. The finding travels as a docblock in `working-directory.ts` rather than only in a report.

- **The agent comments non-obvious code again, as the reference does.** Measured across three benchmark tasks: Codex added 5 explanatory comments, we added 0. The rule existed — "Comment only ahead of non-obvious code, never trivial assignments. Comments are rare and explain WHY" — and the model read the prohibition, because two restrictions and the word "rare" arrived before the permission did. Codex frames the same rule the other way up: "Add succinct code comments that explain what is going on if code is not self-explanatory", with "should be rare" at the end. Ours now leads with the action too. Re-measured on the parser task: same one-line fix as before, now carrying `// Equal-precedence operators group from the left.` — the reason a reader would otherwise have to derive.

- **The Apache-2.0 persona attribution left the prompt and became a docblock.** It was the second line of `BASE_INSTRUCTIONS`, so it was sent to the model on every round of every turn — and the model is not the party a licence notice is for. It reads the same in the source and in `NOTICE`, where a person actually looks, and stops costing 48 characters a round.

- **`web_search` is only declared when a search provider is configured.** `createGenericHttpSearchAdapter` degrades gracefully — unconfigured, it returns `[]` and never throws. Graceful for the run and wrong for the prompt: with no `THEOKIT_SEARCH_API_URL`, which is the default, the tool was still declared on every round and still approval-gated, so the user could be shown a consent card for a search that had nothing to search. Its approval entry is conditional with it, because the framework refuses an approval map naming a tool the agent does not have.

- **`view_image` reaches the model.** It was built by the registry and handed to no agent, so the capability the item exists for did not exist — and the test guarding it asserted only that the registry could resolve the name, which stayed green the whole time. Ungated, matching `read_file`: same root, same containment rule, and `read_file` can already return any workspace file's bytes, so a card there would gate the rendering rather than the access.

- **Durable memory is OFF by default and is now a config key (`memory`).** It was on for every trusted directory, with no key in `config.toml` — the only way off was a session switch that reset on the next launch. Codex ships the same capability as a feature with `default_enabled: false` (`codex-rs/features/src/lib.rs`, `key: "memories"`, `Stage::Stable`), so this is not a matter of taste: the agent we are measured against does not turn it on either. Measured 2026-08-25, it costs three things. It WRITES — a summary of every session lands in `<cwd>/.theokit/memory/sessions/`, so running the agent in someone's repository leaves files there nobody asked for (35 transcripts, 332 KB, accumulated in this checkout alone; a fresh benchmark directory grew one on its first turn). It READS BACK — recall from earlier sessions enters later turns, so two identical runs of the same task can diverge because the second one saw the first, which is the one property a benchmark against another agent must not have. And it declares `memory_search` + `memory_get`, 1,462 chars of tool schema re-sent on every round of every turn (17 tools in a directory with no store, 19 with one). Set `memory = true` to have it back. The three gates are ANDed — trust decides whether it is possible, config whether it was asked for, `/memory off` can only restrict further.

- **The default model is `gpt-5.6-terra`, up from `gpt-5.4`.** The comparison this product is measured against runs the 5.6 family, and a harness comparing two different models cannot isolate harness behaviour — which is the whole reason the default is pinned rather than left to the provider. `terra` is the middle tier of the three (`sol` > `terra` > `luna`); `-m/--model` and `model` in config override it as before.


- **The welcome banner reads like the reference it is measured against (#61).** Four differences from Claude Code, all visible side by side in a terminal: the wordmark is centred rather than left-aligned; the identity lines (model, cwd) are centred under it; a rule now separates the two columns, running the full height of the box, and another separates "Tips for getting started" from "What's new", spanning the panel at every width. The wordmark itself is unchanged — what changed is the column it sits in: the left column is sized deliberately (`LOGO_COLUMNS`) instead of by whatever the art happened to measure, because the art DEFINED that column and a 34-wide wordmark was what truncated the working directory.

- **The banner says which build it is (#61).** It said nowhere. Both references print it — Codex in its header (`>_ OpenAI Codex (v0.147.0)`), Claude Code in the top border (`╭─── Claude Code v2.1.236 ───`) — and the only way to answer the question here was to leave the TUI. `AGENT.version` is a literal with a test that reads the root manifest and fails when the two disagree, so a release that bumps one and forgets the other goes red.

- **The working directory is shortened from the LEFT (#61).** `truncate-end` dropped the tail, which is the half that answers the question: on this repository the banner read `cwd: ~/Projetos/theo/theokit-fram…` — four levels of ancestry and no way to tell which of five sibling checkouts you were in. It now reads `cwd: …/theokit-framework/usetheo-labs/TheoCode`.

### Fixed

- **Stdout carried every message the turn emitted, joined without a separator (#62).** `--help` states the contract it broke: "Stdout carries ONLY the final message". A turn emits text more than once — a preamble before each burst of tool calls, a recap after the last one — and the processors concatenated all of it, so on a two-step task stdout read ``I'll read `duration.mjs` and report its contents briefly.`duration.mjs:2` defines …`` with nothing between the two messages, because nothing was ever meant to join them. `-o/--output-last-message` wrote that same run-on string to a file a script then reads. The boundary is the tool call: text buffered when one starts was a preamble by definition, since the answer cannot precede the tool that establishes it. Preambles now go to stderr, in order, before the call they announce; stdout carries the closing message alone, as Codex's does.

- **A ChatGPT sign-in worked in the TUI and failed in the CLI — the same credential, the same second (#62).** `theocode run` reported `rate_limit (HTTP 429)`, which reads as a quota problem and is not one. Two defects stacked, both measured on 2026-08-25 by posting the stored token to each endpoint. First, headless built on the CONFIGURED model id: a ChatGPT sign-in stores an OAuth token, `openai/…` selects the API-key provider, and `api.openai.com` refuses that token outright (`401 Missing scopes: api.responses.write`). The TUI re-points the id at `openai-chatgpt/…` before resolving anything; the CLI did not. Second, even routed, the SDK's `openai-chatgpt` provider reads `<home>/.theokit/auth.json` while this product writes `<home>/.theocode/auth.json`, and the only bridge is `THEOKIT_AUTH_HOME`. The TUI set it with a hand-rolled `??=`; the CLI called `ensureAuthHome` and **discarded the return** — B-034 had correctly stopped that function mutating its argument, and the one call site whose entire purpose was the mutation was never updated. Both surfaces now call `installAuthHome`, which is named for the half that writes, and headless routes the id before it resolves a credential for it. `theocode run` completes a tool-calling turn again.


- **Consent cards say what the answer DOES, not which key to press (#61).** `PermissionPrompt` defaults to a bare `Yes` / `No`. Both references name the consequence — Codex: `1. Yes, continue` / `2. No, quit`; Claude Code: `1. Yes, I trust this folder` / `2. No, exit`. Each gate now supplies its own refusal label, because the three refuse into different outcomes: a tool call is rejected, a hook is left inert, and the trust gate QUITS the session — which the button never said. The deny choice stays LAST by contract, not by style: `PermissionPrompt` yields the last choice's value on Esc, so reordering them would make Esc approve a shell command. (#61)

- **The approval card says which keys settle it (#61).** It showed `❯ 1. Yes / 2. No` and nothing else, leaving the user to guess between typing the digit, pressing Enter, and pressing Esc — on a card that is blocking a shell command, which is the worst moment to guess. Both references print it: Claude Code ends with `Enter to confirm · Esc to cancel`, Codex with `Press enter to continue`. Ours reads `Enter to confirm · Esc to reject`, and says *reject* rather than *cancel* because that is what Esc does — the tool call is refused, the question does not go away. Applied to the trust gate and the hook-review gate as well as tool approvals. (#61)

- **Every failed turn rendered as "An error occurred." on both surfaces (#62).** The framework masks by default — `presentUIMessageStream` uses `opts.onError ?? MASK_ERROR` — and neither surface passed `onError`, so every failure in this product printed three words and nothing else. Measured 2026-08-25: a rate-limited account produced `ERROR: An error occurred.`, and the cause (`RateLimitError`, already retried twice) was reachable only through `THEOCODE_DIAGNOSTICS=stderr`, an environment variable the message does not mention. The default is right for the transport it was written for — a public HTTP endpoint must not leak server internals to a caller who is not the operator — and wrong here, where the caller IS the operator, on their own machine, against their own credential. One policy in `@theocode/shared/turn-error` now serves both surfaces, so they cannot describe the same failure differently. It reports the message and code, and adds a next step for four common failures. The same run now reads: `ERROR: openai API error: rate_limit (HTTP 429) [AGENT_ERROR] — the provider is rate-limiting this account — wait and retry, or switch model with /model`. (#62)

- **`/status` answered `<unknown>` about `AGENTS.md` at the only moment anyone asks (#61).** The row reported what the last build wired, and `/status` is what a person runs BEFORE the first turn — so the line that says which rules the agent is about to follow read `<unknown — no agent has been built yet>` precisely when it was needed. The walk behind it is a pure read of the disk, so the question always had an answer. It now names the files it finds, labelled `(on disk — not loaded yet)` because the trust gate has not run at that point: reporting them as loaded would be the overstatement `<unknown>` was avoiding.

- **`/status` reported the sandbox twice and aligned its values raggedly (#61).** The panel rendered `sandbox:    sandbox:workspace-write` — it filled a column already labelled `sandbox:` with `sandboxLabel`, which carries that prefix for the FOOTER, where it sits in a `·`-joined run of bare values and has to say which knob it is. The getter is now split (`sandboxLabel` / `sandboxDetail`), so neither consumer has to strip a prefix back off. The column padding was typed into eight template literals by hand and was already wrong on arrival — `model:` sat one column left of the other seven. It is computed from the widest label now, which makes that class of defect unrepresentable rather than merely fixed.

- **`theocode doctor` reported a green tick for an expired credential (#61).** `credentialState` checked that the file existed and parsed, never that it was still valid, so an OAuth token ten days past its expiry produced `✓ credential: present` — a diagnostic whose whole job is to answer "is this ready to run?" saying yes about the first thing that would fail. `expired` is now a state of its own and reports as a WARNING, not a failure: a refresh token may still renew it, so "you will probably be asked to log in" is the honest strength of the claim. A credential with no `expires` at all (an API key) is unaffected — a missing field is not an expiry. `collectChecks`'s docstring had claimed since it was written that the tests could "drive an expired credential"; they could not, because the state did not exist. (#61)

- **The Codex study clone can no longer be committed.** `codex/` — 99 MB of Apache-2.0 source — was present in the working tree, untracked and **not** gitignored, in a repository that is public. `README.md` states the rule it violated: the clone "lived outside the tree, gitignored, read-only", because "a literal copy would carry the upstream licence into this repository, which is a legal problem and not a stylistic one." A single `git add -A` would have done it, and nothing warned: `git status` showed one untracked directory line like any other. It is now gitignored, and ESLint ignores it too — from v10 ESLint descends into it and tries to load `codex/sdk/typescript/eslint.config.js`, which aborted the entire lint run before one file of ours was checked. (#60)

- **Three defects ESLint 10's new `recommended` rules surfaced.** A live-session pointer that could not be read threw a symptom error with no `cause`, discarding the errno and the stack for a failure whose whole job is to say which syscall on which path refused (`session/gc/pointer.ts`). Two dead initialisers (`config/trust-store.ts`, `tui/backtrack/backtrack.ts`) read as fallbacks that no path can ever reach. (#59)


- **Test runs no longer claim every core on the host.** `vitest.config.ts` capped nothing, so the default applied — `os.availableParallelism()`, one fork per core, each booting a full test environment. On a 12-thread machine a single `vitest run` therefore took the whole box, and anything else running alongside it (a second suite, a typecheck, the desktop) competed for what was left. The cap now leaves 4 cores free (`Math.max(2, cpus().length - 4)`), scaling with the runner instead of hard-coding one machine's core count. It costs no wall-clock — measured in `theokit-ui`, the full suite ran 73.96s at 4 workers against 74.36s at 12. (usetheokit/theokit-ui#51)

## [0.4.7] - 2026-08-20

### Changed

- **`InputSlot`'s approval surface no longer casts what its own predicate already proved (B-107).**

  `@theokit/tui` moved from `^0.67.0` to `^0.76.1`. Under 0.x the caret pins the MINOR, so
  `^0.67.0` was `>=0.67.0 <0.68.0` — this package could not reach anything published after 0.67,
  and `@theokit/tui` was not in `node_modules` at all.

  The version that mattered is 0.76.0, which added `narrowingLayer`: a `SurfaceLayer` whose `when`
  is a type predicate, so the narrowing survives into `render`. It was extracted **because of the
  cast in this file** — `approval={p.pendingApproval as PendingApproval}`, three lines below the
  `when` that had already proved it. That cast is gone.

  Nine minors were crossed with no breakage: 42 distinct symbols across 21 files, all present in
  both published artifacts, and typecheck / 555 tests / lint / depcruise identical to the
  pre-bump baseline.

## [0.4.6] - 2026-08-19

### Changed

- **CI's five checks are documented as NOT required, with the measurement that proves it (B-062).**
  The workflow header said the five jobs were "every one of them blocking". That is true in a
  narrow sense — no job reports a failure as a pass — and it reads as the broad one: that GitHub
  refuses the merge. It does not, and cannot at this tier.

  Measured with a token holding `permissions.admin: true`: branch protection is a 403 on `develop`
  AND on `main`, repository rulesets are a 403, and organisation rulesets are a 403 naming GitHub
  Team. Rulesets were checked rather than assumed — they are the newer mechanism and the obvious
  escape hatch, and there is no free-tier route to a required check on a private repository. It is
  a billing wall.

  What holds the line today is a person waiting for five green ticks — usually. 25 merged PRs
  surveyed (#25 through #49), none merged with a red rollup, the six most recent merged 20-49
  seconds after the last check completed. But PR #33 merged **one second after its checks started,
  with zero completed**; it went green afterwards, so it is not a red merge, and nothing gated it.
  That is B-070 in the umbrella backlog (not this file's own B-070), and it is why "correct
  practice" is not the same as a control.

  **No decision was made, and this entry is not an approval of the gap.** Three ways out, each with
  its consequence and none recommended: buying GitHub Team costs money this measurement did not
  price; making the repository public removes the wall for free and discloses the full history
  irreversibly; leaving it as it is keeps merges ungated by anything but attention. The choice
  belongs to the account owner. The record states where the decision stands and embeds a one-line falsifier
  (`gh api .../branches --jq '.[] | {name, protected}'`) that goes false the moment protection is
  configured. It does NOT prove the billing wall on its own: a paid tier where nobody configured
  protection prints the same result, so the four API calls are what establish that, and the record
  says so.

  No job, step, trigger or product file changed. This buys traceability, not enforcement.



## [0.4.5] - 2026-08-19

### Changed

- **The clear-screen sequence comes from `@theokit/tui/terminal` (B-014).** `terminal-io/clear-screen.ts`
  — a single-line constant — is deleted, and both call sites import `CLEAR_SCREEN_AND_SCROLLBACK`.

  **The bytes are unchanged**, and saying so matters: the two declarations were identical, so this
  ships no behaviour change. What it buys is the name and the tests. `CLEAR_SCREEN` did not say it
  clears the scrollback, so shortening it would have silently left the history on screen — and the
  local constant had no test at all, while the library's pins all three parts of the sequence.

## [0.4.4] - 2026-08-19

### Changed

- **The context warning's rise detection comes from `@theokit/tui` (B-012).** `useContextWarning`
  now calls `useRisingEdge`; the eight hand-written lines it replaces had two failure modes the
  library's docstring enumerates, both of which show up as *the warning does not appear*.

  Three owners, one fact each: `@theokit/agents/config` classifies the pressure,
  `@theokit/tui` detects the rise, and `contextWarning` — which names `/compact` and says what
  compaction costs — stays here, because a framework that wrote it would be putting words in this
  product's mouth.

  **An absent usage reading now explicitly HOLDS the last level.** The tempting adoption maps it
  to `ok`, and `ok` is a fall, which re-arms the detector — so the next reading would warn a second
  time for a level the user had already been told about. The existing test drove an absent reading
  only at the start and would have stayed green through exactly that. The new one drives it
  mid-stream, and it is the only test that fails against the wrong version.

## [0.4.3] - 2026-08-19

### Changed

- **The frame budget comes from `@theokit/tui` (B-010).** `rendering/coalesced-memo.ts` (79 lines)
  and its test (60 lines) are deleted; `use-timeline.ts` consumes `useCoalesced`, whose suite
  covers every assertion the local test pinned plus four the local suite never had — a backward
  clock jump, a zero window, screen-reader passthrough, and the trailing update.

  The deleted `test_the_clock_is_monotonic_non_decreasing`, whose detection power was
  mutation-verified under B-030, is replaced by
  `src/renderer/frame-budget.test.ts` `test_the_default_clock_is_performance_now_and_not_Date_now`
  upstream. It is named here so the question "what happened to that assertion?" has an answer.

  **`frame-budget.ts` survives, and that is the point of the change.** The library's default window
  is 34ms, which equals `ceil(1000 / 30)` — but only while `TUI_MAX_FPS` is 30. Taking the default
  would convert one derived pair into two constants that agree by coincidence, and `TUI_MAX_FPS` is
  also what ink receives as `maxFps`. The window is now computed by `coalesceWindowMs(TUI_MAX_FPS)`
  and passed explicitly, with three tests pinning the derivation — including one that fails for a
  hardcoded 34.

## [0.4.2] - 2026-08-19

### Changed

- **The input row's precedence is a declared list, and it is asserted for the first time (B-008).**
  Two nested ternaries decided which of seven surfaces owns the row — four branches in `InputSlot`,
  four more in `ConversationSlot` — and neither file had a test. They are now two layer lists
  consumed by `@theokit/tui`'s `selectSurface`, read top to bottom, with nine tests: eight ask a
  plain state object which surface wins, one mounts to prove the names are wired to real surfaces.

  Precedence is unchanged. The overlapping cases were found by measuring which conditions can hold
  at once — the pair the work item's own wording suggested turned out to be the one pair that
  cannot overlap, so a test written from that phrasing would have asserted an unreachable state.

## [0.4.1] - 2026-08-19

### Changed

- **Both advertising channels are derived by `@theokit/tui` from one declaration (B-006).**
  `components/composer-shortcuts.ts` (72 lines) is deleted; `composerShortcutsFor` and
  `footerHintFor` — the derivation the library extracted in B-005 — replace it, reading a single
  `THIS_BUILD` declaration in `components/composer-capabilities.ts`.

  **The adoption was not a pure deletion, and that is the finding.** The library gates four keys
  where the local filter gated one, so a minimal declaration would have silently dropped the `?`,
  `/` and `@` rows. Each was measured at the app's `<ChatComposer/>` instead of assumed.

  **`mentions` is declared `true` although this app passes no `fileSearch`.** `ChatComposer`
  declares `fileSearch = defaultFileSearch`, so omitting the prop installs a `.gitignore`-aware cwd
  walk rather than disabling mentions — the `@` menu works. The library's own field docstring says
  "a mention provider is passed", which is the predicate the code does not use; following it
  literally would hide a working affordance, the inverse of the defect this model exists to
  prevent. The upstream correction is tracked separately.

  `!` stays unadvertised (ADR 0001) and `← for agents` stays unadvertised (B-067). The three B-028
  tests changed only their CALL, never an assertion, and the `SessionFooter` tests were not touched
  at all — they assert the rendered frame, which is what makes them the migration's proof.


### Fixed

- **CI could hang indefinitely on one network step, and now cannot (B-073).** The word-list
  install had no time ceiling anywhere in the workflow; measured on run `32269423670` it sat
  in-progress for 21 minutes with zero output and did not respond to a cancel, while the other
  four jobs finished green in under two. Every job now declares a ceiling, and the install
  retries three bounded attempts with backoff — the stall is silent, so a whole-step timeout
  could only report the death, never recover from it. If all three attempts fail the job is RED:
  the language gate fails closed by design and is never silently skipped.

## [0.4.0] - 2026-08-19

### Changed

- **The backtrack overlay windows through `@theokit/tui`'s `WindowedList` (B-004).**
  `windowAroundSelection` — 25 lines of hand-rolled centred windowing — is deleted, and
  `BacktrackOverlay` goes from 91 lines to 45.

  The fork was deliberate and its own test recorded the two conditions under which it would end:
  the library's `windowFor` was a trailing window, and it reported overflow as booleans where the
  overlay needs counts. Both now hold, so the record's expiry arrived.

  **The hidden-row markers now read `▲ 8` / `▼ 7` instead of `… 8 older` / `… 7 newer`** — a
  deliberate, user-visible change, not a side effect: the arrows are the compact conventional form
  and this overlay already carries a wordy header. What the overlay needed and the library does not
  draw is kept rather than lost: the rounded border (the consumer's own `Box`), the per-row numbers
  the header's "message 11/20" refers to (formatted into the rows), and the header's own gesture
  words (the `header` slot, which exists so the library never puts them in its mouth).

- **The usage panel comes from `@theokit/tui` instead of a local copy (B-002).** The 31-line
  `components/UsagePanel.tsx` composed three primitives it already imported from the library — which
  is exactly the composition the library extracted and published. It is deleted, and
  `ConversationRegion` imports the published component.

  `@theokit/tui` moves `^0.53.0` → `^0.67.0`. That bump is the substance rather than a detail:
  under npm's semver `^0.x` is pinned to the same minor, so `^0.53.0` could never reach the version
  that ships the component.

  The render was proven identical before the deletion — both components drawn with a turn carrying
  input, output, cached, reasoning and cost, and the full frames compared — rather than assumed from
  the two files composing the same primitives.

## [0.3.1] - 2026-08-19

### Fixed

- **The session GC's refusal to delete a live session is now covered by a test that can fail
  (B-017).** Neutralising the guard used to leave all 534 tests green, while
  `theocode sessions --apply` reaches it and deleting a user's live pointer is unrecoverable. The
  tests assert the delete seam is never CALLED for a protected id — asserting only that an error is
  reported passes against a version that deletes the session and complains about it.
- **The veto that keeps the agent off the unsandboxed builtin shell is now covered (B-017).** It is
  wired at `chat.ts:245` and no test imported it; a regression would have surfaced as a write that
  ignored `--sandbox read-only`, in the field. The pass-through case asserts the previous handler's
  return VALUE, so a wrapper that calls the chain and discards its decision is caught.

  Both suites were verified by mutation rather than by existing: 11 mutants, 11 detected.

## [0.3.0] - 2026-08-19

### Added

- **The five declared gates now run on every pull request (B-015).** `typecheck`, `test`, `lint`,
  `depcruise` and `crossval` each run as their own job, so a failure names which gate broke instead
  of stopping at the first one. None of them is allowed to report a failure as a pass. Before this,
  `.github` had never existed across 383 commits and every gate passed only when a human remembered.

### Fixed

- **The 31 closed items that recorded no commit now say who closed them (B-016).** `crossval` was
  reporting `31 problems` to nobody. Each value was read off the commit that recorded the closure,
  not chosen to satisfy the check — 30 of the 31 name another repository's release
  (`@theokit/sdk`, `@theokit/tui`, `@theokit/presenter`, `@theokit/agents`) and one names two local
  commits. That distribution is the explanation for the lapse: the registry had become a tracker for
  framework work, and a `fixed_in` field that assumes a local commit has nothing true to say about it.

## [0.2.1] - 2026-08-17

### Added

- **A dead-export gate runs in `npm run lint`, and `knip.jsonc` is committed with it (B-049).** The
  configuration is the point, not the tool: under knip's defaults every `exports` subpath counts as
  an entry, so every barrel is reachable by definition — measured on this tree, the default config
  reported **1** issue and this one reported **28**. `includeEntryExports` is on for the same
  reason, since every `index.ts` here is an entry and that is precisely where dead surface collects.
  The gate was verified by injecting a dead export in an entry file and in a non-entry file and
  confirming a non-zero exit for both; a gate nobody has seen fail is not known to work.

### Removed

- **Three functions nobody called, with their re-exports (B-033, B-049).** `mutateConsentStore`
  (`config/trust-store.ts`), `measuredPrecedenceChain` (`config/layers.ts`) and
  `effectiveConfigUnderPosture` (`config/effective-config.ts`). Each appeared exactly twice in the
  repository — its definition and its barrel line — and in no test. `effectiveConfigUnderPosture` is
  not a new find: B-033 shipped with the DoD bullet "has a caller or is deleted" and its own
  `dod_verified` says "NOT addressed — belongs to B-049"; B-049 then shipped without addressing it.
  Deleting `mutateConsentStore` cascaded into `ensurePrivateDir` and four now-unused imports, which
  is the usual shape: dead code hides more of itself behind itself.
- **Twelve barrel re-exports with no consumer, and four `export` keywords that widened nothing
  (B-049).** The implementations stay — they are used inside their own packages — so this narrows
  the declared surface without touching behaviour. `CONFIG_SCHEMA_KEYS`, `MissingCredentialError`
  and `BackendComPosse` lost the `export` keyword itself, and the `Check` / `CheckStatus` /
  `Diagnosis` type surface left the entrypoints; `doctor.ts`'s `CheckStatus` turned out to be unused
  even in-module, contradicting the comment that claimed it was "retained because this module's own
  checks are written in terms of it".
- **`figlet` from `packages/tui`, closing a B-010 DoD bullet that shipped unmet (B-010).** That
  bullet read "`figlet` is used (via `renderFigletArt`) or removed". `renderFigletArt` belongs to
  `@theokit/tui`, and it is never called: it appears in that package only at its definition and in
  its export list, `WelcomeBanner` does not produce art, and `Banner.tsx` passes a literal `LOGO`.
  So the "or removed" branch is the true one. `lowlight`, the other half of the same bullet, STAYS —
  see Fixed below.
- **The `./chat-acp` subpath and the whole `exports` map of `packages/tui` (B-049).** Both are
  reached by file path instead: `scripts.build:acp` runs esbuild against
  `packages/agent/src/chat-acp.ts`, and `scripts.dev` starts the TUI with `tsx`. B-049 kept
  `./chat-acp` deliberately, calling it "the external ACP integration surface"; the rationale does
  not survive re-examination, because every package here is `private: true` and the external ACP
  client consumes the `dist/acp-entry.mjs` bundle, never the subpath.
- **`packages/agent/tests/`, an empty directory outside the test-discovery patterns.** It matched
  neither `packages/*/src/**/*.test.{ts,tsx}` nor `tools/**/*.test.mjs`, so a test placed there
  would have silently never run — a trap rather than clutter.
- **`hooks/hook-runner.ts` and its test — 140 lines that no production code reached.** The wrapper
  around the framework's `runHookCommand` lost its last caller when the whole builder moved upstream:
  `build-handlers.ts` bridges to `buildHookHandlers`, which owns the result transform, so nothing
  regresses. Its only importer was its own test, which is why neither the dead-export gate nor the
  reference graph reported it — **a test is a consumer**. Found by asking a different question:
  which production symbols have consumers, but only test ones. The stale citation of
  `hook-runner.ts:39` in `hook-trust.test.ts` was repointed at the real path.
- **The `REVIEWER_TOOLS` re-export in `review/create-agent.ts` (B-084).** Its own comment set the
  sunset — "delete once nothing outside this file reads it" — and the one reader was
  `composition.test.ts`. That test now imports the name from `composition/agent-spec.ts`, where it
  is declared and where `reviewerShape` reads it. A re-export whose only consumer is the test that
  consumes it is surface the product does not have.

### Fixed

- **`lowlight` was almost deleted as dead, and is not (B-010).** No file in this repository imports
  it, which is why a repo-wide search calls it unused. It is reached at runtime through
  `AgentTimeline` → `ChatMessage` → `MarkdownText` → `CodeBlock` → `import("lowlight")`, so every
  assistant reply containing a fenced code block goes through it; without the declaration the
  framework warns `code renders unhighlighted` and the TUI loses syntax highlighting silently.
  Caught by reading `@theokit/tui`'s own loaders after the removal, not by any tool: `knip` and
  `depcheck` both reported the dependencies clean, and on this one they were right. Recorded here
  because "no import site" and "no consumer" are different claims, and the gate added above cannot
  tell them apart.
- **`vitest.config.ts` is inside the type program.** `tsconfig.json` included
  `packages/*/src/**/*` and `tools/**/*`, which matched 258 of the repository's 259 TypeScript
  files. The one exception was the test configuration itself, so a type error there survived
  `npm run typecheck`. Now covered by a `*.config.ts` entry.
- **The `check-english-only` allowlist citation, again.** The entry moved 76 → 156 when the `ask`
  module was migrated, and 156 → 166 when this cleanup added an import above it. The comment now
  records both moves and why the entry stays line-numbered: keying it by file alone would exempt the
  whole file.
- **A test that pinned a public export was invisible to static analysis (B-004).**
  `ask-bridge.test.ts` asserted the entrypoint exports `ConcurrentQuestionError` by importing the
  namespace and indexing it with a string, so the dead-export analysis read that export as
  unconsumed and the cleanup removed it — only the assertion failing caught the mistake. The export
  is restored, now re-exported straight from `@theokit/agents/ask` rather than through
  `ask-bridge.ts` (that middle hop had no consumer of its own), and the test reaches it by a static
  named import. Its two siblings, `ConcurrentListenerError` and `QuestionAbandonedError`, stay
  removed: nothing imports them and nothing tests them.

### Fixed

- **A fase CODE-QUALITY, rodada pela primeira vez nesta sequencia, achou quatro coisas — todas
  minhas, todas desta sessao.**
  - Tres imports orfaos em `session/session-ops.ts`, sobra da migracao de `protectedTranscripts`.
  - `buildChatAgent` passou de 10 para 11 de complexidade ciclomatica. Os dois gates de CONFIANCA
    que estavam em ternarios inline — quais raizes de config ler, e se os servidores MCP sobem —
    viraram `settingSourcesFor` e `mcpServersFor`. Um gate de confianca enterrado numa expressao
    dentro de uma funcao de 60 linhas e onde ninguem o procura.
  - 63 comentarios em portugues em `packages/`, que e English-only.
  - Uma entrada do allowlist do `check-english-only` apontando para `ask-bridge.test.ts:76` — a linha
    tinha ido para 156 quando o modulo `ask` foi migrado. Um allowlist por NUMERO DE LINHA e uma
    citacao que apodrece a qualquer edicao acima dela, e esta parou de cobrir o que devia sem dizer
    nada.

  Os tres gates (`lint`, `typecheck`, suite) ficam verdes ao mesmo tempo.

### Fixed

- **`tsc` fica limpo: 6 erros -> 0.** Os seis nao eram ruido herdado — eram seis chamadas de
  `processor.finish('ok')` num teste, contra uma assinatura que aceita `'finished' | 'error'`. `'ok'`
  e o vocabulario INTERNO (`outcome.status`), nao o da API.

  Passavam porque a implementacao so pergunta `status === 'error'`, entao `'ok'` caia no mesmo ramo
  de `'finished'`: comportamento acidentalmente correto sobre uma chamada invalida.

- **Oito `as never` removidos do mesmo arquivo.** Nao eram necessarios: `ChunkLike` e estrutural e
  frouxa, e cada literal ja a satisfazia.

  A relacao entre os dois defeitos e o que vale registrar. Os casts **anestesiavam o arquivo**: com
  `as never` espalhado, ninguem olha os erros que sobram. Foi por isso que esses seis atravessaram
  uma sessao inteira sendo chamados de "linha de base pre-existente" sem que ninguem lesse o que
  diziam.

### Changed

- O registry de tools passa a LIGAR o escopo uma vez, via `bindToolScope` de
  `@theokit/agents/tool-scope`, em vez de repetir `projectRoot: scope.cwd` em sete entradas e
  `sandbox` em uma.

  Cada repeticao era um lugar onde se pode esquecer — e esquecer o `sandbox` no `createShellTool`
  produz um shell NAO CONFINADO sem erro e sem aviso, que e o defeito que o B-006 documentou aqui.

  As duas tools de ESCRITA passam `projectRoot: scope.writeRoot` explicitamente, com override. Nao e
  detalhe: para elas a raiz do projeto E a raiz de escrita, e deixar o bind aplicar o `cwd`
  ESTREITARIA o escopo de escrita em silencio quando os dois divergem — o caso de
  `danger-full-access`. Ha teste sobre exatamente essa divergencia.

### Removed

- **331 linhas mortas em `hooks/hooks.ts`** — `preToolUseVeto`, `transformResult`,
  `fireObservational`, `appendOneHookFeedback`, `policyBlock`, `chainBudgetBlock`, `decideBudget` e o
  resto do motor antigo. Estavam inalcancaveis desde que o `buildHookHandlers` local foi deletado: o
  unico chamador delas era ele.

  O arquivo caiu de **423 para 78 linhas** e agora e o que o nome sempre deveria ter dito: o PARSER
  de `.theokit/hooks.json`, e so ele. O motor e do framework.

  Deletar so o ponto de entrada e deixar o corpo para tras e como duplicacao sobrevive a uma
  migracao: nada quebra, nada aponta para la, e o proximo leitor encontra dois motores. Foi
  exatamente o que eu tinha feito.

- `hooks/continuation-budget.ts` — ficou orfao quando o motor saiu. O framework tem o orcamento de
  continuacao desde o `@theokit/agents@8.5.x`, e ele e o que de fato roda.

### Changed

- O motor de hooks passa a ser o do framework. `buildHookHandlers` local (486 LOC) deletado; ficou um
  adaptador que faz as duas coisas que o framework nao pode saber: traduz os NOMES DE EVENTO deste
  produto (`PreToolUse`/`PostToolUse`/`Stop`/`SessionStart`, que os usuarios escrevem em
  `.theokit/hooks.json`) e injeta o NOSSO fingerprint, para que nenhuma aprovacao ja em disco perca a
  validade.
- `hook-runner.ts`: 164 -> 83 linhas. O spawn, o grupo de processo, o teto de saida e o drain budget
  sairam para `@theokit/agents/hooks`.


### Added
- **theokit-sdk 4.51.0: the session, approval and credential rules the framework now owns (B-096, B-098, B-099).** Refusing to destroy a session another process is writing — with "could not determine" kept apart from "nothing is open", because the second is the input that would disable the guard. A veto as a typed decision rather than a tool result the model retries around. And a credential reported by presence and a hashed fingerprint, never by value.
- **theokit-tui:** backlog B-126 — SonarCloud's *analysis* has failed on every PR in that repo (not its quality gate), so the check has been red for at least three PRs and reads as noise.
- **theokit-tui:** backlog B-125 — a rendering test fails about one run in four; the rate and the limits of the evidence are recorded, including that it was not established whether the flake pre-existed.
- **The slash-command router's dispatch is covered, and the test says what it actually pins (B-116, second slice).** The obvious property to assert was precedence — the chain of responsibility over seven capability groups, first-to-claim wins. Measured, precedence is NOT observable: the 38 actions partition cleanly across the seven switches, so reordering `GROUPS` changes nothing. Three mutations proved it — reordering the chain, removing the early return, making `noop` stop claiming — and none turned a case red. The first version of this test claimed to pin precedence and was therefore vacuous for its own stated purpose. What replaced it pins the invariant the chain actually rests on: no action is claimed by two groups, read from the source rather than from a hand-kept list, because a list would need updating by the same person who broke the invariant at the same moment. Duplicating one action across groups turns it red. The behavioural cases stay, asserting that each group's actions reach it and that an unclaimed action is inert — where a registry entry added without a handler lands.
- **`rules.ts` is characterized — 157 LoC that had no test at all (B-103, B-116).** It is consumed by `config/trust-posture.ts`, which decides whether a project's `[[hooks]]` are honoured, and a hook is arbitrary command execution on every tool call (B-086) — so migrating it onto `@theokit/sdk/context` without a safety net would be a security change wearing a refactor's clothes. The 22 cases pin what the module DOES today rather than what it should do, concentrating on the product policy the SDK's `runDiscovery` may not carry: the traversal budget and its two typed refusals, the 64 000-char truncation and its warning, the injected `readFile`/`warn` seams, the frontmatter `paths:` scoping that decides whether a rule applies everywhere or to a subset, and the inode-keyed cycle guard. Six mutations turn the covering cases red (join separator 3, budget guard 3, character ceiling 1, cycle guard 1, unclosed frontmatter 2, scope prefix 2). A seventh is recorded as NOT detected and the test says so in place: deleting the explicit `.sort()` leaves every case green, because `readdirSync` on this filesystem already returns sorted entries at 3 and at 40 entries — the assertion pins the output contract, not the sort call.
- **`routeKey` now has a test per surface state (B-116, first of two slices).** The 115-LoC modal state machine that decides what Ctrl-C, Esc and Enter mean across seven surface states — open question, demo, consent gate, login, backtrack ladder, streaming turn, composer — had no direct test. Its failures are the silent kind: the key appears to do nothing, or it does the other thing, and B-029 is the record of exactly that shipping (Esc-rewind was dead because a flag was raised before the data it announced). 26 cases assert the ACTIONS returned rather than the effect of applying them, which is possible because the function is pure and returns its actions instead of performing them — asserting effects would test `applyKeyAction` instead, and would pass on a router returning the wrong action whenever two actions converge on the same effect. Escape's six-way priority gets its own block, each case setting every lower-priority trigger as well, because the real defect here is usually not a broken branch but a right branch that never runs. Shown to detect rather than assumed to: six mutations — reordering the goal/streaming precedence, dropping the composer-text guard, widening `Ctrl-C` to any `ctrl` key, not stacking `reset-backtrack`, making a demo `Ctrl-C` quit on the first press, and dropping `interrupt-turn` from question abandonment — each turn the covering cases red. The slash-command router's dispatch, the item's second bullet, is not covered yet.
- **The goal refusal in `sendMessage` now has a test (B-116).** Two refusals protect a running turn from being disturbed; the `streaming` one in `resume-command.ts` was already covered, and this one was not. It is the more dangerous of the two to lose, because losing it neither throws nor looks broken — the message simply reaches the agent while a goal is driving it, interleaving a human turn with the goal's own, and the operator sees their message accepted. Three cases assert the refusal, the wording that tells the operator both ways out, and (anti-vacuity) that an ordinary message still goes through. `lastSentMessage` is asserted alongside, because a refusal that still recorded the message would make the next `/retry` replay something the agent never received — a worse failure than the one being refused. Deleting the guard turns two of the three red.
- **A `theokit` routing domain, so a gap that belongs upstream can be filed against the repo that owns it.** Items for the framework previously routed nowhere — correct while this install governed one product, and increasingly untrue once three consumer-measured gaps in one day turned out to be framework bugs. Ships with `agents/theokit.md` so the routing resolves to a named owner rather than to nobody.
- **Seven backlog items scoping what would make a second agent product nearly free to build (B-096..B-102),** derived from measuring which subsystems this repo had to write itself.
- **theokit-sdk:** backlog B-103 — context assembly exists in the SDK and no consumer can reach it.
- **theokit-tui:** backlog B-104 — terminal-surface primitives are rebuilt by every agent CLI.
- **theokit:** backlog B-105 — `@theokit/presenter` is pinned, imported nowhere, and its job is done by hand.
- **theokit-sdk:** backlog B-106 — the framework creates session artifacts and leaves the reaping to the consumer.
- **theokit-sdk:** backlog B-107 — the two invariants that keep a trust posture honest live only in the consumer.
- **theokit:** backlog B-108 — what an agent actually wired is not observable from the framework.
- **theokit-sdk:** backlog B-109 — every release leaves `develop` behind `main`, and the next release PR would re-publish shipped work.
- **theocode:** backlog B-110 — the README tells every reader this repository has no test suite (it has 67 files, 427 cases).
- **theokit-sdk:** backlog B-111 — the tarball guard covers one publishing repo, and today's release came from the other.
- **theokit-sdk:** backlog B-112 — the release workflow disables provenance citing a repository privacy that no longer holds.
- **theokit-sdk:** backlog B-113 — the pre-push gate re-runs the full validate for a push that introduces no commits.
- **theokit-sdk:** backlog B-114 — a tag push reported success and transferred nothing.
- **theokit-sdk:** backlog B-115 — nothing tests what the SDK does with a file the repository controls.
- **theocode:** backlog B-116 — the most stateful surface subsystems are the least tested.
- **theokit-sdk:** backlog B-117 — two containment guards judge a path by its name, so a symlink out of the root is judged by where it sits rather than where it points.
- **theokit-sdk:** backlog B-118 — the repo `.npmrc` makes every local publish fail as a 404, sending the diagnosis to token permissions.
- **theokit-sdk:** backlog B-119 — `globbed` discovery cannot see a nested rule, and a pattern written to say so matches nothing at all.
- **theokit-sdk:** backlog B-120 — the re-release guard answers "all clear" for a ref it cannot read.
- **theokit-sdk:** backlog B-121 — six publishable packages cannot publish with provenance because `repository.url` is empty.
- **theokit-tui:** backlog B-122 — CI has been red on `develop` for at least 8 runs, and the cause is step order.
- **theokit:** backlog B-123 — `@theokit/presenter` has no lifecycle surface, so a Codex-shaped consumer cannot use it.
- **theokit:** backlog B-124 — `create-theokit`'s TUI template loads a project `.env` with no guard, so every scaffolded product starts exposed.

### Changed
- **The JSONL emitter projects the framework lifecycle fold (B-123).** `createJsonlProcessor` composes `foldTurnLifecycle` from `@theokit/presenter@0.6.0`. The LoC delta is **+13, not a shrink** — recorded as measured. What the migration exposed matters more: three mutations survived the entire CLI suite because nothing covered the emitter, which is the contract every consumer of `--json` reads.
- **B-106 closes: the framework decides what may be reaped, and deletes nothing (B-106).** `planReaping` ships in `@theokit/sdk@4.50.0`. The severity that deferred it — this is the path that deletes user data — is answered by the design rather than waived: planning is separated from deleting, so the dry run is structural and the dangerous case ("could not determine whether this session is live") is asserted rather than simulated.
- **B-103 is killed on evidence, and its one surviving finding registered as B-127.** Measured against `@theokit/sdk@4.49.0` in a clean project: a consumer both reaches context assembly and registers its own discovery source. What survives is that a spec's `priority` is a raw position in a list the consumer does not own — placing a source between two defaults means picking 25 by reading them.
- **B-104 closes: all three terminal primitives ship (B-104).** The keypress router joins the stderr guard and the serialised writes at `@theokit/tui@0.52.0`. The deferral is answered rather than waived — what is published is the ordering rule, not one product's key vocabulary.
- **The keypress router declares its layers instead of nesting ifs (B-104).** The ordering rule is `@theokit/tui@0.52.0`'s `./keys`; the layers — `open-question`, `demo`, `gated`, `composer` — and every word in them stay here. Precedence is now readable in one place and enforced: moving `gated` ahead of `open-question` turns tests red. The file grew by four lines of code, which is the honest number — the value is that the contract is declared rather than implied by nesting.
- **B-107 closes, in a narrower form than it asked (B-107).** The bullet expected config-key reachability to be checkable *in* the framework; measured after B-097 shipped, the framework has no config-key registry and by design will not have one — the keys are the consumer's vocabulary. So `auditEnvReachability` (`@theokit/sdk@4.49.0`) owns the rule and TheoCode ranges over its own keys with it. The failure still surfaces in this repo's suite; what this repo no longer writes is the detector, including the half everyone forgets — an opt-out that no longer exempts anything.
- **B-116 closes: the two most stateful surface subsystems now have tests that detect (B-116).** `routeKey` has a case per surface state and the slash-command router a case per capability group — all seven, after a first pass with four read as done. The router's precedence turns out not to be observable at all (the actions partition cleanly across the switches), so the tests pin the disjointness the chain actually rests on, which nothing enforced. One refusal is asserted through dispatch; the other is recorded as a known gap rather than proven with a test that would await disk to make a routing claim.
- **B-108 closes: the framework reports what it wired (B-108).** All three bullets hold — the record is derived from the values handed to the builder rather than from a second read of configuration, "withheld because untrusted" is distinguishable from "none configured", and TheoCode's `wired-capabilities.ts` is now a projection. Measured on the projection: one of eight wiring mutations found a real hole and closed it — `projectSources` pinned to `true` passed the whole suite, and it gates whether an untrusted repository may redirect a squad member's model.
- **`wiredCapabilities` becomes a projection of the framework's record (B-108).** The derivation moved to `@theokit/sdk@4.48.0`'s `recordWiring`, which takes the trust posture as its gate; what stays here is this product's shape — which three capabilities are lists of names, plus the two fields that are not entities at all. Behaviour is unchanged and the framework version adds a guard this one never had: recording a capability the posture does not gate now throws instead of quietly reporting it as suppressed.
- **B-097 closes: the config layer's rules are the framework's, its words are its own.** All three DoD bullets hold — the framework provides layered resolution with declared precedence, the floor rule and a trust posture; a consumer adds a layer without reimplementing precedence; and TheoCode's `config/` shrank to its keys plus composition (212 -> 172 lines of code). Measured, not asserted: 14 wiring mutations on the migrated code are all detected, including trust granted by the store — the normal path, which had no test before this.
- **TheoCode's config layer now consumes the framework's rules instead of restating them (B-097).** `security-floor`, `layers` and `trust-posture` keep this product's vocabulary — the sandbox and approval orderings, the six-layer chain with its precedences, the eight capabilities and what withholding each one costs — and delegate the rules that every layered-config product rebuilds identically to `@theokit/sdk@4.47.0`. Code shrinks 212 → 172 lines, and the rules now live where they are tested for: the framework's suite pins the ceiling that only descends, hooks accumulating across layers, and untrusted denying every declared capability.
- **`terminal-io/` now consumes `@theokit/tui/terminal` instead of owning it (B-104, third DoD bullet).** 387 → 308 production LoC, delta −79, measured rather than estimated: `log-rotation.ts` deleted outright (33 → 0), `stderr-guard.ts` reduced to binding this product's `[theocode]` label (66 → 17). `write-queue.ts` GREW by three lines (21 → 24) and that is the correct trade — the framework ships a factory rather than module state, because two library consumers in one process must not serialise against each other, so the application has to own the single instance explicitly. That single instance is the whole reason the file still exists: two queues over one file would interleave writes and nothing would fail loudly. The input router stays, as B-104's measurement said it would — its mechanism generalises, its vocabulary does not. 71 files / 487 cases green, typecheck clean, 216 modules cruised with no dependency violation.
- **B-107's second invariant is blocked on B-097, measured (B-107).** The mechanism checks that every config key is either env-reachable or carries a documented opt-out — and it needs a set of config keys to range over. The framework has none: no `config` subpath, no `configSchema` / `layeredConfig` / `loadConfig` anywhere in the source, and the only enumerable key list in the package is the `SOVEREIGN_ENV_KEYS` that bullet (a) just added. Implementing it would mean inventing the config-key registry first, which is B-097 — and inventing it inside a lint would fix the shape of the framework's config surface as a side effect. B-097 is now the keystone for three items: this bullet, B-108, and the harder half of B-106.
- **B-108 measured: blocked on B-097, structurally (B-108).** The evidence holds exactly — zero occurrences of `onWired` / `wiredCapabilities` / `suppressedBy` across both framework trees, against 72 LoC in the consumer. But the second DoD bullet requires the framework to KNOW about directory trust, and it does not: B-097, which moves the trust gate upstream, is still `raw`, and the SDK's 23 hits for "posture" are all SANDBOX posture, a different concept sharing a word. A framework cannot report a decision it does not make. Implementing the first bullet alone would be worse than waiting: a listing without the trust dimension cannot distinguish suppression from absence, which is exactly the defect B-071 was REOPENED for — and shipping it upstream would hand that defect to every consumer. Moved to `triaged` with the three properties the implementation must preserve recorded on the item.
- **B-106 measured: the SDK ships no collector for the artifacts it creates, and the item's own grep claim needed correcting (B-106).** Every pointer in the evidence resolves — file, line, and the symbol on that line. The item said `grep -rlniE "garbage|retention|prune|reap"` finds nothing; it finds five files, none of which reap session artifacts (compaction prunes message history, `session-scope` documents state *a consumer* prunes, `task.ts` has `retentionMs` for the task registry, two are false positives). The definitive measurement is different and stronger: the SDK unlinks only what is in flight in the operation doing it — a lock it just released, a `.tmp` from a failed atomic write — and the built barrel exposes ZERO symbols matching gc / collect / reap / prune / retention / sweep. Moved to `triaged` and deliberately NOT implemented in this pass: this is the path that deletes user data, the consumer's version is 1 402 LoC, and a half-correct data-deleting API is worse than the duplication it removes. The three constraints the consumer paid to learn — B-020's `mtimeMs = 0` aging to 20 000 days, the sweep-wide rather than per-directory budget, the TOCTOU re-check of the writer lease — are recorded on the item so the implementation starts from them.
- **The `@theokit/presenter` override is justified, and the justification is written down (B-105).** It is not an orphan pin: it forces a TRANSITIVE dependency (`@theokit/agents` → `@theokit/presenter`), and it entered to carry the fix where `readMessageStream` dropped the whole `finish` chunk — and with it the `messageMetadata` that makes the real token readout possible (B-090, B-080). Measured now, it changes nothing: `@theokit/agents@7.5.0` declares presenter as exactly `0.5.1`, and removing the override resolves to 0.5.1 anyway, verified by regenerating the lock and reading it. KEPT anyway, because agents pins exactly rather than by range — a future agents declaring 0.4.0 would silently reintroduce the dropped-token bug, and this is the floor that prevents it. The justification lives here because package.json admits no comments.
- **B-104 is measured and split in two, and the split is the finding (B-104).** The intake evidence — "0 of 8 files import `@theokit/*`" — reads as *all of it is transferable*; per-file measurement says coupling is not uniform. `write-queue.ts` (21 LoC), `log-rotation.ts` (33) and `stderr-guard.ts` (66) are generic and extractable now. `input-router.ts` (115) is the trap: zero references to this product, so it looks portable, while its entire contract is this surface's vocabulary — `KeyboardState` declares `hasOpenQuestion`, `inDemoInput`, `emLogin`, `backtrackArmed` and `KeyAction` returns `prime-backtrack`, `pause-goal`, `close-demo`. A second agent CLI has none of those. A public API is semver-bound, so a keypress router with the wrong state vocabulary is worse than none — the second consumer routes around it instead of around nothing. Item moved to `triaged` with the design pass named as its own slice.
- **B-103's consumer migration is decided against, on evidence (B-103).** With `@theokit/sdk@4.43.0` reachable and the recursion blocker gone, the question became answerable per capability rather than per file: the SDK covers 2 of 9 — the recursive rules walk and `@import` expansion — and does not carry the traversal budget and its typed refusal, the inode cycle guard, the character-ceiling truncation and its warning, the injected `readFile`/`warn` seams, `AGENTS.local.md`, or the tail-truncation that keeps the nearest instructions. The one equivalent piece would be a downgrade: TheoCode's containment guard refuses a path it cannot resolve, while the SDK's falls back to the lexical path. The item's "~430 LoC could be returned" came from file sizes, and file size is not capability. What survives is the gap restated — not "no consumer can reach context assembly" but "what it reaches is the easy half", one upstream item per missing capability, which is what B-119 already was.
- **`ehRotaChatGPT` is now `isRouteChatGPT`.** The last Portuguese identifier in the auth routing path; the project's convention is that code is English and only the conversation is not. Private to `model-route.ts`, so no caller changed and no public surface moved.
- **The README's test count was re-measured (B-110, B-116).** B-110 replaced a false claim ("this repository holds no test suite") with a measured one; the same day's work made the measured one stale, as 67 files / 427 cases became 69 / 456 once `routeKey` and the `sendMessage` refusal got their tests. A number that ages silently is B-110's defect one step removed — a reader cannot tell a stale measurement from a current one, and both read as authoritative. Re-measured with `npm test`, not incremented by arithmetic.
- **`@theokit/sdk/context` exists upstream (B-103).** Discovery, rule activation and `@path` import resolution are now a semver-covered public surface of the SDK instead of code every consumer re-derives. TheoCode has not migrated yet — its `packages/agent/src/context/` still carries all 602 LoC, and the ~430 that could be returned is consumer-side work the upstream plan deliberately left out of scope.
- **`theokit-tui` joins the `theokit` routing domain.** A measured item (B-104) belongs to that repo and to no other, which is the trigger `cycle-backlog.md § Domain routing` names for extending the table. It routes to the existing `agents/theokit.md` specialist rather than to a new one, so the resolution names an owner.

### Fixed
- **theokit-tui 0.52.1: the suite stops failing about one run in twenty (B-125).** Two timing assumptions replaced by waits on the actual signal — a fixed 50ms sleep per keystroke, and "two ticks are enough for useInput to subscribe". Twenty consecutive full-suite runs: 20 green.
- **theokit-sdk 4.51.1: a user-visible failure is never the message nobody receives (B-102).** `diagFailure` falls back to stderr when no sink is installed, while ordinary chatter stays silent. A corrupted frame is visible and recoverable; a dropped failure is neither.
- **The README no longer tells readers this repository has no test suite (B-110).** It stated "`npm test` does not exist here. Any claim about this code's behaviour is currently unverified in this repository" — false on all three counts: `npm test` runs 67 files and 427 cases. The sentence did not merely age, it instructed: a contributor arriving at a repo whose README says the tests are absent does not run them. Sibling of B-062, which found the same disease in the domain specialist file.

### Security
- **theokit-sdk:** a tool now declares the scope it reaches and whether its action is reversible, and the approval layer gates on those rather than on the tool name (B-101, and B-100's structural bullet). A sandbox answers which files a process may touch; it cannot answer what an action reaches. Refusal outranks approval, an empty grant refuses, and an undeclared scope refuses.
- **theokit-sdk:** the last two lexical containment guards now resolve symlinks (B-117), and the re-release guard refuses an unreadable ref instead of reporting a clean release (B-120). Both were failures whose symptom was a green tick.
- **theokit:** scaffolded products no longer load a project `.env` unguarded (B-124). The framework was handing every new product the unguarded loader as its starting point — a cloned repository could redirect the credential store through `THEOKIT_AUTH_HOME` before any trust prompt. The guard walks every template file, not the one path the defect was found in.
- **`resolveTrustPosture` shipped in `@theokit/sdk@4.47.0`, and B-108 is no longer blocked (B-097, B-108).** A framework cannot report a decision it does not make; now it makes one. Verified against the registry: untrusted denies every declared capability, the gate covers every capability declared, a trusted store grants and says `store`, and a blanket environment switch is reported as `env` rather than hidden behind the same word. The invariant is the point — `allows` is built FROM the declared list, so a product adding a ninth capability cannot forget to gate it, and that failure is invisible when it happens. What remains in B-097 is the consumer migration and the wiring from posture to withheld loaders.
- **B-097's two slices are live in `@theokit/sdk@4.46.0`, verified against the registry.** Installed into a clean project and exercised: a project layer cannot loosen the operator's sandbox, the operator's explicit flag still wins, `hooks` accumulate across layers instead of being displaced, and a chain that is not strictly ascending is refused. The release also validated the B-114 correction in production — the ref verifier ran at its new position, after the action pushes tags, and reported `✓ all 1 release tag(s) at HEAD are on origin` instead of the false negative it produced when wired inside the publish.
- **`foldLayers` moved upstream — B-097's second slice (B-097).** Later layers win, `undefined` never overwrites, and named keys ACCUMULATE. That last rule is the security-relevant one: with plain last-wins a project file DISPLACES the user's entries for a list-valued key rather than adding to them, and for `hooks` — arbitrary command execution on every tool call — that is the difference between a repository adding a hook and a repository removing yours. Layer names are the caller's data, so `profile` never reaches the framework. 15 cases; five mutations, four detected, and the fifth recorded as unobservable in both the source and the test rather than left to look covered. The TRUST POSTURE is still not extracted, which is what B-107(b) and B-108 actually wait on.
- **The release-ref verifier moved to run AFTER the tags are pushed (B-114, correction).** It caught a failure on its first CI release and the failure was the wiring: `changeset publish` creates the tags, the changesets action pushes them in a later step, so checking inside `pnpm release` asked before the pusher ran. 4.45.0 published successfully, the check reported its tag missing, and `git ls-remote` showed it there moments later. A gate that fails every release is worse than no gate — it is how a red check stops being read, which B-122 measured happening for eight consecutive runs on the sibling repo. Now its own workflow step, guarded on `published == 'true'`, with `pnpm verify:refs` for the local path where it can legitimately fail.
- **`applySecurityFloor` moved upstream — the first slice of B-097, chosen by measurement (B-097).** Layered config resolves last-wins, and for the keys that decide confinement that is a hole: a project layer outranks the user's own file, so a cloned repository can hand itself the most permissive sandbox and the operator's global choice loses silently, at the moment the directory is opened. Which slice to extract was decided by measuring, not by file size: across the consumer's 12 config files coupling count does NOT predict genericity — `env-knobs.ts` has zero framework references and is entirely this product's key names, the same trap as B-104's keypress router. The floor rule was extractable because its vocabulary is DATA (a permissiveness ordering, the restricted layer names, the override name), so a second product supplies its own. 16 cases; four mutations detected, one of which found a real coverage gap first — `ceiling = level` versus `Math.max` differs only when a restricted layer HARDENS and a later one offers a value in between. The precedence chain, the trust posture and the consumer migration are NOT done, so B-097 is still the keystone for B-107(b), B-108 and the harder half of B-106.
- **The release path now verifies its tags reached the remote (B-114, closed).** `changeset publish` reports success on its own exit code, and an exit code is not evidence a ref transferred: git contacts the remote BEFORE `pre-push` runs, the hook takes ~11 minutes, and the idle connection is dropped before the transfer — git dies of SIGPIPE (141) with no message and output ending in a green gate line. Both hypotheses filed at intake are refuted (it reproduces on a plain branch name, and the process dies before any transfer). A second defect compounded it: `git push … | tail -N` reports the pipeline's last status, hiding the 141 behind `tail`'s 0. `scripts/verify-release-refs.mjs` is wired into `pnpm release` after the publish, with three distinct exit codes — verified, a tag never arrived, could not check — because collapsing the third into the first is the defect. Its own first draft had exactly that flaw and was caught before shipping.
- **The trust invariant moved upstream: `@theokit/sdk` now guards a project `.env` (B-107).** `process.loadEnvFile()` reads the PROJECT's `.env` into `process.env` — right for a provider key, a hole for the variables that decide where credentials live and what is trusted. Without a guard, a cloned repository shipping `THEOKIT_AUTH_HOME=/tmp/attacker-store` redirects the credential store at startup, before any trust prompt, because locating the store is what happens first. The new `loadProjectEnv` captures a NAMED set of sovereign keys before the load and restores them after, including restoring "was not set" by deleting the key. The measurement was worse than B-107 claimed: the framework's own scaffolder ships the unguarded version, so every product generated from `create-theokit` starts exposed — filed as B-124. TheoCode's own 38-line version stays until the published release lands.
- **`@theokit/tui@0.51.0` ships the terminal loop primitives, and fixes a CI gate that had been red for 8 runs (B-104 slice 1, B-122).** The new `./terminal` subpath carries `installStderrGuard`, `createWriteQueue` and `rotateLog` — verified against the REGISTRY: installed into a clean project, the queue serialises per key, the guard redirects stderr to its log, and rotation refuses a nonsense argument with a typed RangeError. The keypress router stays out, deliberately. Along the way, `gates` on that repo turned out to have been failing on `develop` for at least 8 consecutive runs — `publint --strict` resolves `exports` against a `dist/` that `build` had not yet produced, so it reported every entry as missing including the two that predate all recent work. Reproduced on a worktree of the earlier commit, so it was not caused by the change it blocked, and now green on both Node versions.
- **B-119 and B-121 shipped in `@theokit/sdk@4.43.0` and the 3.0.2 line, both verified against the registry.** `globbed` discovery understands `**`: installing 4.43.0 into a clean project and running `runDiscovery` with `.theokit/rules/**/*.md` surfaces a nested rule, while `.theokit/rules/*.md` still surfaces only the top level — the capability is new, the shipped default is unchanged. And the six packages that could not publish with provenance at all now do: `@theokit/acp`, `@theokit/cli`, the three memory adapters and `@theokit/sdk-pty` each carry a SLSA attestation, which is B-121's third bullet met by a release rather than by reading manifests.
- **B-112 is closed, and the last third was proven on the registry (provenance).** `NPM_CONFIG_PROVENANCE` is back in `release.yml` and the obsolete header is gone; the third bullet asked for an attestation verified on the REGISTRY rather than asserted from a green job, and `@theokit/sdk@4.43.0` — cut through the workflow — answers with a SLSA provenance predicate. The distinction the bullet drew earned itself: the run that produced it reported FAILURE, because a different package was refused with E422 for an empty `repository.url` (B-121). A green job would have been the wrong thing to trust in both directions.
- **B-109, B-111, B-113 and B-115 are shipped and released upstream.** `@theokit/sdk@4.42.1` carries the containment fix; the release-hygiene guards (workspace-protocol publish guard, the re-release refusal, the automatic back-merge, the pre-push skip) are on `main`. The back-merge workflow proved itself on the release that carried it — it fired on the push to `main`, saw `develop` one commit behind, and opened the PR without anyone remembering to. B-114 stays open: two of its three DoD bullets are met (cause established, remedy in the rule) and the third, a release path that verifies a pushed ref rather than trusting an exit code, is not built.
- **`@theokit/sdk@4.42.1` is published, and the context-manager containment fix is live (B-115).** The guard was `absolute.startsWith(resolvePath(cwd))` — no separator boundary and lexical, so it admitted a sibling directory whose name extends the project's (`<cwd>-evil`) and any symlink resolving outside the root. Verified against the REGISTRY rather than the source tree: installed 4.42.1 into a clean project, a sibling-directory escape is refused and a legitimate in-root import is still inlined.
- **Upgraded to `@theokit/sdk@4.41.1`,** which confines `@path` context imports to the repository that declares them. Before it, a repository this agent was pointed at could inline any file readable by the process — an SSH key, a `.env` — into the system prompt via a `CLAUDE.md` line that was exactly `@~/.ssh/id_rsa`. Found and fixed upstream from here; TheoCode's own `AGENTS.md` loader was already contained (B-042), but the SDK's discovery path runs whenever the `project` setting source is enabled for a trusted directory.

## [0.2.0] - 2026-08-10

### Added
- **`/mcp` reports a server that was started and did not answer (#188).** Its tools silently vanish from the session, and the panel previously could only say whether each server answered was "not reported here" — true while no layer below knew. `@theokit/sdk@4.41.0` now emits that failure per server with its reason, and the panel names it, distinct from a server withheld by trust. Absence of a failure is still not reported as health: the turn may not have run yet, and a server that recovers stops being reported as failed on the next turn. Requires `@theokit/agents` 7.5.0, which forwards the run-event sink through the in-process turn. Verified live against a real MCP server: a configured server that never completes its handshake is named in the panel with its reason.

### Fixed
- **An MCP server that fails to start is no longer silent (#188).** Its failure was caught per server and written only to the SDK's stderr, which this product never reads — so `/mcp` could list a configured server while every tool it provides had vanished. Fixed at the source in `@theokit/sdk` as an additive typed event; the panel reports it once the release reaches here through CI.

### Added

- The interface now knows when the conversation is filling up and says so before it runs out, naming `/compact` and what compacting costs, once per level rather than every turn. KNOWN GAP: it cannot fire yet — the token reading it depends on is not reaching the status bar, which also means the "live token usage" the welcome screen advertises is not appearing at all (B-080, B-090)

- `/resume <id>` opens a session from the terminal interface. It listed your sessions and gave you no way to open one, while the command line could resume all along. It refuses while a turn is still running, names the session you are leaving — which stays listed — and tells you an unsent draft was discarded rather than letting you find out (B-087)

- `/sandbox` changes what the agent is allowed to do to your disk without restarting. Only the approval mode could be changed mid-session; the sandbox was a label in the status bar, so realising the posture was wrong meant quitting. Tightening applies immediately; loosening asks you to confirm, because granting the agent more of your disk should be something you meant to do. The status bar follows it from the next turn, reading the mode the agent was actually built with rather than resolving the configuration a second time (B-076)

- `theocode doctor` reports what your installation will actually do: whether you are logged in, which directory it trusts, the model, sandbox and approval it resolved, and which MCP servers, skills and hooks an agent built here would really get. It reports the RESOLVED state rather than re-printing your config, because the gap between the two is the thing that goes wrong. It exits non-zero when something is broken so it can be used in a script, and it never prints a credential — presence only, since a diagnostic is what people paste into an issue (B-081)

- `/memory` now shows what it remembers and lets you change it. It reported that a store existed, where it was and how many facts it held — and nothing else, so watching the count climb left you editing files outside the product to do anything about it. It now lists the facts by number, `/memory forget <n>` removes one from disk, and `/memory off` stops it generating more for this session. The switch says when it applies and that it is not saved, because a preference you flipped once and forgot is worse than one you have to set deliberately (B-077)

- `/hooks` now reports the hooks the agent is actually running, with the command each one executes — not what the configuration file asks for. Those two can disagree, and the disagreement is the thing worth catching: an untrusted directory wires none of them, and the panel says so before listing anything, so a list of hooks can never read as protection you do not have (B-071)

- `/mcp` shows which external tool servers the agent started. They are spawned as real processes when the directory is trusted, and until now nothing told you which ones had loaded — or that an untrusted directory had refused to start them at all. The untrusted case names the servers and says why they are gated: they run before any per-tool approval (B-069)

- `/skills` shows which skills the agent actually loaded. They are read from disk and can be removed entirely when the directory is untrusted, and both states were invisible: a skill that was not taking effect gave you no way to tell whether you had misnamed the directory, never listed it, or had it dropped on purpose. When trust removed them the list names them and says they were not loaded, because "no skills" and "your skills were dropped" send you to opposite places (B-070)

- The agent now records what it actually wired — which MCP servers, skills and hooks reached it, and which ones the directory's trust posture removed. It is built from the same values the agent was constructed with, at the moment it was constructed, so a surface reporting it can no longer disagree with what is running. Nothing user-visible yet; it is the foundation the `/mcp`, `/skills` and `/hooks` listings need, and building it once is what stops four commands from each growing their own version (B-069, B-070, B-071)

- The command line can now list, archive, rename, delete and fork sessions. It could only collect garbage and resume one, while the terminal interface could do everything else — so scripting anything about sessions meant driving the interactive app. Every operation calls the same code the interface calls, rather than a second copy, which is how the two halves drifted apart in the first place. Actions that name a session require the id: headless there is no "current session", and guessing would let `delete` remove whichever transcript happened to be newest (B-074)

### Changed

- Twenty identifiers written in Portuguese are now English, and the guard that is supposed to catch them can finally see that shape. It could not before: names like `pluginDeHooks` are built from words that are each valid English — `do` the verb, `de` a prefix — so every part was checked, cleared, and the Portuguese construction passed whole. The check now recognises the construction itself, was scored against real English names before it landed, and was proven by planting a violation and watching the build fail (B-084)

### Added

- The agent can look at an image in your repository. Attaching one with `/image` still works, but that requires you to anticipate that a picture matters — a design mock, an architecture diagram or a screenshot of a failing test was invisible to it otherwise. It reads only inside the workspace: a path pointing outside is refused and said so, never quietly redirected somewhere allowed (B-082)

- The README now says where configuration actually lives. There are two directories — `.theocode/` for the product's own settings and `.theokit/` for subagents, skills and rules — and putting a setting in the wrong one is ignored with no error at all. That matters most for hooks, which run a command of your choosing on every tool call: a block in the wrong file protects nothing and says nothing. The valid hook event names are written down for the same reason (B-086)

### Removed

- A planned "ask something without keeping the conversation" feature was dropped before it was built. It existed because a side question forced you to fork a session that could never be removed; now that sessions can be deleted, the cost is one command rather than a permanent entry, and building a second kind of session to avoid it would have added more than it saved (B-079)

### Added

- `/hooks` shows which lifecycle hooks are registered for the directory you are in, with the event each is bound to and whether it has been approved. Hooks can block a tool call, and until now the only way to learn one existed was to have it stop you. When the directory is untrusted the list says so first and in full — those hooks are declared and are not running, and a reader who skimmed the list could otherwise believe they were protected (B-071)

- `/subagents` lists the specialised agents a project defines. Until now the only way to find out which ones existed was to name one that did not and read the error — the set was discoverable exclusively through failure. When a project defines none, it says where it looked, because someone who put them elsewhere needs the path rather than the word "none" (B-072)

- A reply can finally leave the terminal. `/copy` puts the last answer on the clipboard as markdown and `/export [path]` writes the whole conversation to a file — until now the only way out was selecting text with the mouse from a bordered box that wraps every line, which mangles exactly the code and commands people want to paste. Both read the conversation data rather than the drawn screen, so a long line inside a code block survives at its original width. Where there is no clipboard at all — over ssh, in a container, in CI — it says so and points at `/export`, instead of quietly doing nothing (B-075)

### Changed

- The screen's wiring was split into three files instead of one. Everything that assembles the terminal interface lived together, and it had grown to the point where adding a single new piece of information for a command to read broke two size limits at once — a feature was written, tested, and thrown away because of it. The parts that build the session and the parts that hand dependencies to the input box now live on their own, the behaviour is identical, and the whole test suite passes untouched, which is what makes that claim checkable (B-085)

### Added

- A session can now be deleted, not just archived. Archiving only hid a conversation behind an `(archived)` label — the transcript stayed on disk and stayed listed — so a session that captured a pasted credential could not be removed through the product at all. `/delete <id>` removes both the entry and the file. It always requires the id: archiving defaults to the current session because it can be undone, and this cannot. It also refuses to delete a session something is still writing to (B-078)

- The colour scheme is no longer fixed to dark. `THEOCODE_THEME=light` switches it, and a terminal that cannot render colour at all — piped output, a log, a screen reader — is served by `no-color`, which was previously unreachable from outside the source. `NO_COLOR` is honoured too, so anyone who already sets that convention for other tools gets it here for free, and it wins over the product's own setting because it is an accessibility signal rather than a preference. A value that is not one of the three falls back to dark and SAYS so in `/status`, which also now answers the only question anyone asks about a theme: why is it this colour (B-073)

### Fixed

- Asking for the current model no longer answers half in Portuguese. `/model` with no argument said `(use /model <name> para trocar)`, and the guard that is supposed to catch exactly this reported the file clean — every word in that sentence is also an English word, including `para` and `trocar`, so it was declined one word at a time and passed as a whole. The text is now English, a test pins it, and the guard's blind spot is written down where the next person editing it will see it (B-083)

- The status bar no longer offers you an agents panel that does not exist. Opening the command menu replaced the `? for shortcuts` hint with `? for shortcuts · ← for agents`, and pressing the left arrow did nothing, because asking the toolkit to show no hint is what made it show its own — which lists everything the toolkit can do rather than what this build wires. The hint is now assembled from the capabilities that are actually present, so an unbuilt feature cannot be advertised by omission (B-067)

### Added

- **TheoCode:** backlog B-080..B-082 — three further items from widening that comparison past the command menu, to the CLI subcommands and the tools the model itself can call. Summarizing a long conversation is entirely manual and nothing warns you before the context runs out, so the failure lands mid-task; nothing diagnoses an installation, so when a setting does not take effect the only recourse is reading source; and the agent cannot open an image in the repository, which makes a diagram or a screenshot invisible to it unless you attach one by hand (B-080)

- **TheoCode:** backlog B-067..B-079 — thirteen maintenance items from the first side-by-side run of this product against the terminal agent it was adapted from. Two are defects you can reproduce today: the footer names an agents panel that was never built, and the composer ignores Home and End, so correcting a long prompt is one arrow key at a time. The rest are capabilities that exist in the engine and have no surface — MCP servers are spawned and a failed one is silent, skills can be removed by trust-gating with no way to tell, hooks can block a tool call and cannot be listed — plus three absences a user meets directly: a reply cannot be copied or exported out of the terminal, the sandbox posture is displayed but not changeable, and a session can be archived but never deleted. Five further differences were deliberately NOT filed, because the only argument for them was that the other product ships them (B-067)

- What the agent is allowed to do is now checked automatically. The set of tools it can reach, which of them stop and ask you first, and which files a cloned repository is permitted to influence were all decided in code that no test read — so a change that quietly removed an approval prompt, or let an untrusted project's configuration through, would have shipped with every test still passing. Fourteen tests now assert those decisions for all three agents the product builds, and each one was verified by breaking the product on purpose and confirming the test caught it (B-061)
- **TheoCode:** backlog B-059..B-063 — five maintenance items from a cross-validation of `packages/{agent,shared}` against the framework it consumes. The repository now holds three agent-construction routines that do not call each other, so building a fourth agent means writing a fourth one; the primitive all three share is not exported from the package; nothing in the suite asserts what an agent is composed of; the domain specialist still tells every cycle the repo has zero tests, against 48 on disk; and ten of the framework's thirteen error classes sit outside the typed hierarchy the product catches on (#B-059)
- `npm run crossval` checks that every closed backlog item names a commit which actually touches the code the item is about. It exists because the 2026-08-08 review found an item closed against a commit that never touched the file its own evidence cited — and on its first run it found two more items closed with no commit recorded at all (B-018..B-057)
- **TheoCode:** backlog B-019..B-051 — 33 maintenance items covering all 78 actionable findings of the 2026-08-08 `packages/` review; 11 of them reopen an item closed on 2026-08-07 whose Definition-of-done bullet the code never satisfied, including the review's single `critical` finding (B-019)
- The welcome banner has a test suite locking what it renders — the ASCII wordmark, the product name, the model, and both right-hand panels (B-011)
- `BACKLOG.md` — the single maintenance registry for TheoCode, seeded with 17 items derived from the TheoCode ↔ theokit cross-validation of 2026-08-07 (`docs/reviews/2026-08-07-theokit-crossval-review.md`)
- `CHANGELOG.md` — this file, required by Unbreakable Rule 6 and recorded as finding CI-010 in that same review
- The manual test runbook for the Telegram example reads in English, and the bot handle it tells you to talk to is now marked as illustrative — it belonged to one developer and exists nowhere in the example code, so anyone following the steps literally was messaging nothing (B-066)
- Every repository in the framework this product is built on now checks its own English-only rule as part of its test suite. Only one of the ten did before, and it was the only one that had needed no cleanup — the other nine relied on someone remembering to look. Installing the check found the last Portuguese identifiers and one error message a user could see, and each repository's exemptions are written down with the reason: a prompt whose Portuguese is the behaviour being taught, a Unicode test corpus, and release notes that are a record of what shipped rather than prose to rewrite (B-065)
- Portuguese was removed from the framework this product is built on, not just reported. Four of the ten framework repositories carried it in source — comments, error messages the user could see, and identifiers including one on the published interface; 129 occurrences are now English and four repositories are clean. What remains is verified false positives: OpenTelemetry field names, a Unicode test corpus, and the word list belonging to another repository's own Portuguese guard (B-058)
- The Portuguese names still on the framework's public interface were measured precisely, and the answer is much smaller than assumed: four type names, none of them reachable at runtime, one of which this project mentions once in a comment. The change that had been treated as needing a major version needs four deprecation aliases in a minor — and the specific function the concern named turns out never to have been published at all (B-058)

### Changed
- The project's written record now has one home. Plans and reviews were being kept in two places at once — one of them not part of the repository, so it never reached anyone who cloned it — and the two copies of the same plan had already drifted apart, with the stale one being the copy a working session picked up. Durable documents live in `docs/`, the reasoning is written down in an architecture decision record, and a check now fails the build if the same document ever exists in two versions again (B-064)
- Building a new kind of agent no longer means writing a new routine to build it. The product ships three agents — the one you chat with, the code reviewer, and the members of a delegated team — and each was assembled by its own separate piece of code, so a fourth would have been a fourth. What an agent is allowed to do is now declared as a list in one place, and all three read from it; a new agent that needs *less* than the coding one is three lines, which the old assembly could not express at all (B-059)
- The agent can no longer resolve its own project directory. Whoever builds it must say which directory it is for, so the trust decision, the configuration, the tools' write scope and the project instructions cannot end up describing two different folders — a disagreement that was previously one forgotten argument away, and silent when it happened (B-059)
- The TheoCode domain specialist describes the repository as it is now. Nine of its calibration facts had gone false in three days — it told every cycle the repo had zero tests and no way to run them (there are 268, all passing), that the history was three commits long (131), that the layering was enforced by nobody (dependency-cruiser now checks five named rules over 190 modules), and it named a framework version the workspaces had already moved past. It now carries the date on every measured figure, and a note that the tree wins when the two disagree (B-062)
- `.gitignore` and `.prettierignore` are written in English; their comments carried the reasoning behind a dozen ignore rules and were the last Portuguese prose in a versioned file (#B-058)
- The English-only guard now covers `tools/` as well as `packages/`, and reads comment prose — a seven-line Portuguese comment in the build script was invisible to every previous detector (#B-058)
- English-only guard rebuilt on dictionary lookup instead of a word denylist: it now flags a word a Portuguese dictionary knows and an English one does not, so an unforeseen Portuguese term is caught rather than silently passed (#B-058)
- Portuguese identifiers renamed to English across the agent package, including a Portuguese source filename (#B-058)

- Running a shell command straight from the composer with `!` is deliberately not implemented, and the reasoning is written down in `docs/adr/0001-shell-shortcut-confinement.md`. The terminal toolkit offers the shortcut, so anyone reading its documentation will expect it here: every command this product runs passes an approval prompt, a sandbox scope and any policy hook, and a composer shortcut has no turn for the approval to attach to — wiring it would mean a second, separate path to running commands on your machine. Ask the agent to run the command instead, or use `/ps` and `/stop` for background shells (B-056)
- Every message the product shows is in English. Ninety-two strings were in Portuguese, among them the login and goal toasts, the background-shell summary, the config and delegation errors, and the deprecation warning for a trust environment variable (B-052)
- The tool-registry error bridge now states that it is temporary and what removes it: the upstream defect it works around is fixed and awaiting release (B-016)
- The credential module states up front that it reads credentials and contains none, so the repository's secret gate flagging it by filename is answered in place instead of re-investigated each time (B-007)
- The OAuth credential type documents why it is narrower than the SDK's, so a surface review stops reading the two shapes as the same fact written twice (B-007)
- The approval ledger is documented and covered by tests as deliberate, not duplicated: it suppresses an approval the user already answered during the window before the agent's thread reflects it, which a stateless lookup cannot do (B-011)
- The backtrack overlay's windowing is now documented and pinned by tests as a deliberate divergence from the toolkit's own: it centres the selection (a history scrubber) rather than trailing it (a menu), and reports how many entries are hidden rather than merely that some are (B-011)
- The welcome banner is now the terminal-UI toolkit's own component instead of a hand-rebuilt copy of it. Same layout, one place to maintain — and the three upstream defects that blocked the switch are fixed at the source (B-011)
- The agent is now built against one working directory, supplied by whoever composes it. It used to read the process directory at six independent points while two of the four call sites had already resolved a directory and passed only part of it — so a run could be configured for one directory and have its trust, tools and project instructions resolved for another (B-015)
- The approval prompt, the slash-command list and the tree-diff panel now use the terminal-UI toolkit's own types instead of local copies of the same shapes. No behaviour changes; a field added upstream now reaches these call sites instead of silently missing them (B-011)
- The hook module declares all its imports in its header. Four of them sat past line 220, so the module's dependency surface was invisible from the top of the file. No behaviour changes (B-015)

### Removed

- `@theocode/cli` no longer offers an importable entry point. Importing it ran the command-line interface as a side effect, because the package exported the file that starts it (B-049)
- An echo-disabled secret reader and a team-member options builder, both of which had no caller and no test. They belong to features that were never built (B-049)
- The `Blocked <command>` marker in the tool header. It could never appear: it keyed on an exit code this product does not emit, so it read as protection while providing none. A hook veto is still invisible in the terminal, which is now tracked openly rather than disguised by dead code (B-027)
- The forked copy of the interactive-shell tool: 48 lines that existed only to recover the session-limit details the SDK used to discard. Fixed upstream and released, so the tool is now the SDK's own (B-009)
- Two package entry points nobody imported, and the two broken `bin` declarations (B-010)
- Dead surface: an unused drain helper, an orphan temp-file sweeper that hard-coded a private SDK naming convention, a statically unreachable assertion, and four exported readers with no callers — 174 lines (B-016)
- The unused `apiKey()` accessor and the transport dependency it fed: it was threaded through two modules and never read (B-007)

### Fixed
- A goal run no longer dies when the agent SDK emits an event type this build does not recognise; the unknown event renders as nothing and the loop keeps going (#B-058)
- Error messages, toasts and CLI output that were still in Portuguese are now English — the sandbox-mode error, the session-GC summary line, the goal toasts, the log-rotation and approval-ledger range errors, and the collapsed-continuation row in the timeline (#B-058)
- Three Portuguese identifiers no dictionary contains — `THREAD_PADRAO`, `semEspaco`, `indice` — were still in the agent package after it was declared clean; the guard now carries a measured list of the eight such words found by reading every entry of `--list-unknown` (#B-058)

- Command descriptions no longer carry milestone identifiers. Ten of them cited milestones this repository has no roadmap for, and the deprecation warning for a trust variable promised removal at one that does not exist (B-046)
- The configuration error for an untrusted project role points at the environment-knob registry instead of `docs/CONFIGURATION.md`, which was never written (B-046)
- The footer offers `? for shortcuts` only when pressing it does something (B-046)
- A hook approval that fails to persist leaves the consent gate open and shows a toast. It used to close the gate as if the approval had succeeded, so the hook was never approved, the user was never asked again that session, and the only report went to a log file (B-040)
- Diagnostics that could not be written to the terminal UI's log are counted and reported when the session ends. On a non-writable path the interface ran with every diagnostic dead and nothing said so (B-039)
- The terminal UI's log is rotated during a long session, not only at startup, so it no longer grows past its cap unbounded (B-039)
- A malformed `hooks` block is now reported. It disabled the hook consent gate silently, so no hook ran and nothing said why (B-039)
- A clean shutdown exits 0. Ctrl-C, a cleanup that failed, and a cleanup that timed out all returned the same failure code, so nothing wrapping the process could tell them apart (B-045)
- Attaching an image that cannot be read now fails with the same typed error as every other image failure, instead of an untyped one a caller written against the contract would let through (B-051)
- The keyboard help no longer advertises `!` for running a shell command. The shortcut was never wired, so `!npm test` was sent to the model as prose (B-028)
- Esc-rewind works. Arming the ladder read the turn count and previews before they were set, so the overlay drew nothing and a second Esc cancelled instead of stepping back — the feature was unreachable (B-029)
- The backtrack overlay speaks one language. Its header was in Portuguese while the toast for the same keypress was in English (B-029)
- A failure after the backtrack fork is now reported instead of becoming an unhandled rejection. The session had already moved, and the terminal said nothing (B-029)
- A custom `THEOCODE_HOME` is now honoured when resolving an `openai-chatgpt/*` credential. That route looked in the default home while every other route looked in the overridden one, so the same credential was found by one and missed by the other (B-034)
- `ensureAuthHome` no longer writes into the environment it was given. Asking where the auth home is had the side effect of changing the caller's environment (B-034)
- A caller that resolves configuration from an explicit environment now gets its trust decision from that same environment. The seam existed but was unreachable, so a single run could take the posture from the ambient environment and the configuration from an injected one (B-033)
- A session pointer that cannot be written degrades with a diagnostic instead of terminating the terminal UI. Three of the five paths that write it — `/new`, `/clear`, `/fork`, the Esc interrupt and the backtrack confirm — were still unprotected (B-031)
- A pasted API key is no longer submitted with its trailing newline. The credential was stored as-is and authentication failed later with a provider message that said nothing about whitespace (B-047)
- Setting a second listener on the ask bridge now fails with a typed error instead of silently replacing the first. A surface could stop receiving questions with no error and no warning (B-035)
- `-C/--cd` now selects the directory whose `.env` is loaded. The project environment was read before the working directory changed, so it came from the directory the user was leaving (B-026)
- `theocode --help` prints the usage text and exits successfully. It used to be reachable only by triggering an error, so asking for help returned a failure and a complaint about a mistake the user had not made (B-023)
- `theocode review --uncommitted` now reviews the uncommitted changes. The flag was parsed and checked for conflicts with `--base`/`--commit`, then never read, so it selected nothing (B-023)
- `--last`, `-m/--model` and `-o/--output-last-message` are now rejected on the commands that cannot honour them, instead of being accepted and ignored (B-023)
- The CLI usage text no longer teaches an `exec` subcommand that does not exist. Every documented invocation (`sessions gc`, `review`, `goal`, `resume`) was written with a prefix the parser does not route, so following the help text sent the whole command to the model as a prompt — starting a billable turn instead of running the command (B-022)
- A hook scoped with a `matcher` no longer runs against a tool result that carries no tool name. The matcher is a tool-name scope, and a hook written for `run_shell` was running with an empty one (B-021)
- The session collector no longer treats "I could not check" as "it is gone". A directory it cannot read, a working directory it cannot stat, and a transcript whose timestamp it cannot read now each leave the project untouched instead of clearing every retention guard (B-020)
- `--keep-last` now applies to projects whose working directory no longer exists — the only projects the collector actually deletes from. It previously had no effect there (B-020)
- A collector run that could not list any project reports the failure instead of "nothing to collect" (B-020)
- Custom commands now appear in the `/` menu as you type. They were routable and listed in the `?` help panel, but were never handed to the composer — so the only way to discover one was to open the help (B-011)
- The agent now introduces itself as TheoCode, on the SDK it actually runs on. It was calling itself "Theokit Builder" in the system prompt, the greeting, the banner, the composer placeholder and the directory-trust dialog — the last of which asked for filesystem and command-execution permission in the name of a product that does not exist (B-002)
- Pressing ESC on a pending question now unblocks the turn immediately. The question was removed from the screen but never withdrawn from the agent, so the model kept waiting on it for five minutes while the interface showed it as gone (B-004)
- The "a question is already pending" error now reads in English and can be caught by type from the package entrypoint, instead of being reachable only by matching its message (B-004)
- `/diff` now renders as a real diff — coloured, with a line-number gutter and unchanged runs folded — instead of one undifferentiated block of text that the terminal cut off (B-011)
- Trusting a repository's subagents no longer silently trusts its hooks. The setting source that enables one enables both, and repository hooks loaded that way skipped the per-hook fingerprint check that exists to catch a command changed after approval (B-008)
- `theocode` now points at the built artifact, so it runs. Both declared entry points pointed at raw TypeScript with no shebang and failed on first invocation — one of them by handing the file to ImageMagick's `import` (B-010)
- The dependency direction the README promised was enforceable now actually is, via `npm run depcruise`. The `exports` map alone never enforced it, because TypeScript resolves through a `tsconfig` wildcard that reaches past the declared entries (B-010)
- A corrupt transcript now reports which line is broken instead of just "transcript unreadable", and the reader is the SDK's own — the truncated-last-line tolerance is now a declared option rather than a re-derived index check (B-012)
- Tightening the sandbox mode now ends shell sessions already running under the looser one. A `bash -i` started with full access survived a switch to read-only, still interactive under the permissive wrap (B-014)
- A failed background write of the session pointer or goal state no longer terminates the terminal UI; it degrades and reports the reason instead (B-013)
- Local runtime state under `.theocode/` is ignored by git again. Two rules cancelled each other out, so sessions and the resolved config were committable despite being declared local (B-017)
- The file that records which directories you trust and which hook commands you pre-approved is now refused when other local users can write it, and its directory is repaired to be private if something else created it first (B-005)
- A delegated sub-agent can no longer be handed tools with the sandbox silently omitted. The scope treated a missing sandbox as "run without one" rather than as an error, so the shell it built was unconfined with no warning (B-006)
- A project's config file can no longer widen the sandbox or switch approvals off over the user's own setting. Both keys ranked below `project` and `env` in precedence, so a cloned repository could grant itself full access; tightening is still allowed, and an explicit command-line flag still wins (B-006)
- The terminal UI no longer auto-approves commands when no sandbox is actually enforcing anything. It approved every command under `full-auto` while the same screen warned that confinement was absent — the headless surface had refused this combination all along (B-006)
- Forking a session now also protects the most recent transcript, not just the one the pointer names — the session most likely still being appended to was absent from the guard (B-003)
- A transcript that is being written to right now is no longer eligible for deletion. Cleanup consulted the cross-process writer lease in neither phase, so only the file's age stood between a live session and removal (B-003)
- Session cleanup now refuses to run when it cannot read which session is live, instead of treating an unreadable pointer as "no session is live" and proceeding to delete (B-003)
- The ACP surface no longer registers `request_user_input`, a tool it could not answer — every such call used to stall for five minutes waiting on a bridge only the terminal UI listens to (B-001)
- An authentication failure now surfaces as an authentication failure instead of being passed downstream as an empty key, which made the real cause resurface later as an unrelated provider error (B-007)

### Security

- A delegated team is confined to the working directory its parent was built for. It resolved its own from the process instead, so a worker could be given write authority over a different tree than the one the caller chose (B-032)
- An `AGENTS.md` import can no longer reach outside the project. Outside a git repository the boundary was the filesystem root, so any file on the machine could be pulled into the agent's instructions; and a symlink inside the project was followed out of it, because containment was checked on the path text rather than on where it actually points (B-042)
- The set of pre-approved hook commands is now read through the same permission check as directory trust. It had its own reader, so a consent store any other local user could write was refused for the cheaper decision and accepted for the one that authorises command execution (B-019)
