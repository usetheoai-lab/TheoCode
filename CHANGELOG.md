# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Every message the product shows is in English. Ninety-two strings were in Portuguese, among them the login and goal toasts, the background-shell summary, the config and delegation errors, and the deprecation warning for a trust environment variable (B-052)

### Security

- The set of pre-approved hook commands is now read through the same permission check as directory trust. It had its own reader, so a consent store any other local user could write was refused for the cheaper decision and accepted for the one that authorises command execution (B-019)

### Added

- **TheoCode:** backlog B-019..B-051 — 33 maintenance items covering all 78 actionable findings of the 2026-08-08 `packages/` review; 11 of them reopen an item closed on 2026-08-07 whose Definition-of-done bullet the code never satisfied, including the review's single `critical` finding (B-019)

### Changed

- The tool-registry error bridge now states that it is temporary and what removes it: the upstream defect it works around is fixed and awaiting release (B-016)

- The credential module states up front that it reads credentials and contains none, so the repository's secret gate flagging it by filename is answered in place instead of re-investigated each time (B-007)
- The OAuth credential type documents why it is narrower than the SDK's, so a surface review stops reading the two shapes as the same fact written twice (B-007)

- The approval ledger is documented and covered by tests as deliberate, not duplicated: it suppresses an approval the user already answered during the window before the agent's thread reflects it, which a stateless lookup cannot do (B-011)

- The backtrack overlay's windowing is now documented and pinned by tests as a deliberate divergence from the toolkit's own: it centres the selection (a history scrubber) rather than trailing it (a menu), and reports how many entries are hidden rather than merely that some are (B-011)

- The welcome banner is now the terminal-UI toolkit's own component instead of a hand-rebuilt copy of it. Same layout, one place to maintain — and the three upstream defects that blocked the switch are fixed at the source (B-011)

- The agent is now built against one working directory, supplied by whoever composes it. It used to read the process directory at six independent points while two of the four call sites had already resolved a directory and passed only part of it — so a run could be configured for one directory and have its trust, tools and project instructions resolved for another (B-015)

- The approval prompt, the slash-command list and the tree-diff panel now use the terminal-UI toolkit's own types instead of local copies of the same shapes. No behaviour changes; a field added upstream now reaches these call sites instead of silently missing them (B-011)
- The hook module declares all its imports in its header. Four of them sat past line 220, so the module's dependency surface was invisible from the top of the file. No behaviour changes (B-015)

### Fixed

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

### Removed

- The forked copy of the interactive-shell tool: 48 lines that existed only to recover the session-limit details the SDK used to discard. Fixed upstream and released, so the tool is now the SDK's own (B-009)

- Two package entry points nobody imported, and the two broken `bin` declarations (B-010)

- Dead surface: an unused drain helper, an orphan temp-file sweeper that hard-coded a private SDK naming convention, a statically unreachable assertion, and four exported readers with no callers — 174 lines (B-016)

- The unused `apiKey()` accessor and the transport dependency it fed: it was threaded through two modules and never read (B-007)

### Added

- The welcome banner has a test suite locking what it renders — the ASCII wordmark, the product name, the model, and both right-hand panels (B-011)

- `BACKLOG.md` — the single maintenance registry for TheoCode, seeded with 17 items derived from the TheoCode ↔ theokit cross-validation of 2026-08-07 (`.claude/knowledge-base/reviews/theokit-crossval-review-2026-08-07.md`)
- `CHANGELOG.md` — this file, required by Unbreakable Rule 6 and recorded as finding CI-010 in that same review
