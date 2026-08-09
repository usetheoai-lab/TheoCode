# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `npm run crossval` checks that every closed backlog item names a commit which actually touches the code the item is about. It exists because the 2026-08-08 review found an item closed against a commit that never touched the file its own evidence cited — and on its first run it found two more items closed with no commit recorded at all (B-018..B-057)
- **TheoCode:** backlog B-019..B-051 — 33 maintenance items covering all 78 actionable findings of the 2026-08-08 `packages/` review; 11 of them reopen an item closed on 2026-08-07 whose Definition-of-done bullet the code never satisfied, including the review's single `critical` finding (B-019)
- The welcome banner has a test suite locking what it renders — the ASCII wordmark, the product name, the model, and both right-hand panels (B-011)
- `BACKLOG.md` — the single maintenance registry for TheoCode, seeded with 17 items derived from the TheoCode ↔ theokit cross-validation of 2026-08-07 (`.claude/knowledge-base/reviews/theokit-crossval-review-2026-08-07.md`)
- `CHANGELOG.md` — this file, required by Unbreakable Rule 6 and recorded as finding CI-010 in that same review

### Changed
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
