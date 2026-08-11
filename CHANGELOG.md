# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
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

### Fixed
- **The README no longer tells readers this repository has no test suite (B-110).** It stated "`npm test` does not exist here. Any claim about this code's behaviour is currently unverified in this repository" — false on all three counts: `npm test` runs 67 files and 427 cases. The sentence did not merely age, it instructed: a contributor arriving at a repo whose README says the tests are absent does not run them. Sibling of B-062, which found the same disease in the domain specialist file.

### Changed
- **The README's test count was re-measured (B-110, B-116).** B-110 replaced a false claim ("this repository holds no test suite") with a measured one; the same day's work made the measured one stale, as 67 files / 427 cases became 69 / 456 once `routeKey` and the `sendMessage` refusal got their tests. A number that ages silently is B-110's defect one step removed — a reader cannot tell a stale measurement from a current one, and both read as authoritative. Re-measured with `npm test`, not incremented by arithmetic.
- **`@theokit/sdk/context` exists upstream (B-103).** Discovery, rule activation and `@path` import resolution are now a semver-covered public surface of the SDK instead of code every consumer re-derives. TheoCode has not migrated yet — its `packages/agent/src/context/` still carries all 602 LoC, and the ~430 that could be returned is consumer-side work the upstream plan deliberately left out of scope.

### Security
- **Upgraded to `@theokit/sdk@4.41.1`,** which confines `@path` context imports to the repository that declares them. Before it, a repository this agent was pointed at could inline any file readable by the process — an SSH key, a `.env` — into the system prompt via a `CLAUDE.md` line that was exactly `@~/.ssh/id_rsa`. Found and fixed upstream from here; TheoCode's own `AGENTS.md` loader was already contained (B-042), but the SDK's discovery path runs whenever the `project` setting source is enabled for a trusted directory.

### Changed
- **`theokit-tui` joins the `theokit` routing domain.** A measured item (B-104) belongs to that repo and to no other, which is the trigger `cycle-backlog.md § Domain routing` names for extending the table. It routes to the existing `agents/theokit.md` specialist rather than to a new one, so the resolution names an owner.

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
