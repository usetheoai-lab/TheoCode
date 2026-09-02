# TUI validation — every command, and the four things a user creates

Status of each row is one of: `untested` · `PASS` · `FAIL` · `n/a`. A row moves off `untested` only
when it was **driven in the running TUI** and the result observed — not when the code looks right.

Measured 2026-09-02: **46 commands here, 58 in Codex 0.147.0.**

**Run 1–2 (2026-09-02) — 18 rows driven: 15 PASS, 1 FIXED, 1 FAIL, 1 PARTIAL.** Findings filed as usetheoai-lab/TheoCode#67 (skills). One defect was found AND fixed in the sweep:
`/memory` reported `Memory ON` while nothing could be written.

Three things the sweep taught about its own method, kept because they cost time to learn:

- **The `/` menu swallows the first Enter** — it selects the suggestion; a second submits. A single
  Enter leaves the command sitting in the composer, which reads exactly like a command that did
  nothing.
- **Toasts vanish faster than a capture.** `/pwd`, `/theme`, `/sandbox` answer with a toast, so a
  capture two seconds later shows an empty screen and looks like a failure. Sub-second polling, or
  a side effect like the footer, is the honest oracle.
- **A side effect can be the oracle.** `/approval` was recorded as CHECK until the footer was seen
  to have moved from `suggest` to `auto-edit` — the command had worked all along.

## Why this list exists

`/help` listing a command proves the registry, not the command. Several defects this month were
exactly that shape: a formatter returning the right value that nothing called, a hook that would
never fire, a status row that said `NOT LOADED` while something was loaded. The oracle for each row
below is what happens on screen.

---

## A. Commands we have (46) — does each one actually run?

### A1. Session lifecycle

| # | command | expected | status |
|---|---|---|---|
| 1 | `/clear` | transcript clears, session kept | untested |
| 2 | `/new` | new session, banner loses `(resumed)` | untested |
| 3 | `/resume` | picks a prior session | untested |
| 4 | `/fork` | branches the session | untested |
| 5 | `/sessions` | lists sessions | untested |
| 6 | `/archive` | archives current | untested |
| 7 | `/delete` | deletes, refuses the live one | untested |
| 8 | `/rename` | renames | untested |
| 9 | `/compact` | compacts, reports what was dropped | untested |
| 10 | `/quit`, `/exit` | leaves, restores terminal title | untested |

### A2. Model and turn control

| # | command | expected | status |
|---|---|---|---|
| 11 | `/model` | switches, footer updates | untested |
| 12 | `/effort` | switches reasoning effort | PASS |
| 13 | `/retry` | re-runs last turn | untested |
| 14 | `/stop` | interrupts a running turn | untested |
| 15 | `/goal` | sets an objective loop | untested |
| 16 | `/plan` | plan mode | untested |
| 17 | `/ask` | question prompt | untested |
| 18 | `/select` | selection prompt | untested |
| 19 | `/progress` | progress surface | untested |

### A3. Trust, permission and sandbox

| # | command | expected | status |
|---|---|---|---|
| 20 | `/approval` | changes approval policy, footer updates | PASS |
| 21 | `/permissions` | permission panel | untested |
| 22 | `/sandbox` | changes sandbox mode, footer updates | PASS |
| 23 | `/login`, `/logout` | credential lifecycle | untested |

### A4. Context and inspection

| # | command | expected | status |
|---|---|---|---|
| 24 | `/status` | model, effort, approval, sandbox, cwd, **agents.md incl. user layer** | PASS |
| 25 | `/usage` | token usage panel | PASS |
| 26 | `/diff` | shows working-tree diff | untested |
| 27 | `/ps` | background shells | untested |
| 28 | `/memory` | memory panel, `off\|on`, `forget <n>` | FIXED |
| 29 | `/copy` | copies last reply | untested |
| 30 | `/export` | writes the conversation | untested |
| 31 | `/raw`, `/raw all` | prints into scrollback | untested |
| 32 | `/image <path>` | attaches an image to the next turn | untested |
| 33 | `/help`, `?` | shortcut panel incl. **ctrl+o** | PASS |
| 34 | `/pwd` | prints the working directory | PASS |

### A5. Extension surfaces — the four things a user creates

| # | command | expected | status |
|---|---|---|---|
| 35 | `/agents` | **lists subagents from `.theokit/agents/`** | PASS |
| 36 | `/subagents` | same set, other name | untested |
| 37 | `/skills` | **lists skills from `.theokit/skills/`** | FAIL |
| 38 | `/hooks` | **lists hooks, and says which source each came from** | PARTIAL |
| 39 | `/mcp` | lists MCP servers, names the ones that failed | untested |
| 40 | `/init` | scaffolds project config | untested |

### A6. Appearance

| # | command | expected | status |
|---|---|---|---|
| 41 | `/theme` | switches live | PASS |
| 42 | `/title` | sets terminal title; `app dir` default | untested |
| 43 | `/statusline` | chooses footer fields | untested |
| 44 | `/review` | review flow | untested |
| 45 | ctrl+o | **collapsed ↔ detailed transcript** | untested |
| 46 | esc / esc-esc | interrupt, then backtrack | untested |

---

## B. Creating the four artefacts — end to end, not just listing

Listing an empty set proves nothing. Each row below **creates** the artefact, restarts if needed,
and checks the agent actually honours it.

| # | artefact | task | status |
|---|---|---|---|
| 47 | **rule** | write `.theokit/rules/x.md`, ask something it governs, see it obeyed | PASS |
| 48 | rule, scoped | add `paths:` frontmatter, confirm it applies only to matching files | PASS |
| 49 | **rule, user layer** | `~/.theocode/rules/x.md` obeyed in a project that has none | untested |
| 50 | **instructions** | `AGENTS.md` obeyed; `~/.theocode/AGENTS.md` obeyed in an untrusted dir | untested |
| 51 | **skill** | write `.theokit/skills/x/SKILL.md`, confirm `/skills` lists it AND the agent can invoke it | FAIL |
| 52 | **subagent** | write `.theokit/agents/x.md`, confirm `/agents` lists it AND it can be delegated to | PASS |
| 53 | **hook** | declare one in `config.toml`, confirm it fires on a tool call | PASS |
| 54 | hook, denial | a hook that blocks — confirm the call is refused and the reason is shown | PASS |
| 55 | **MCP server** | declare one, confirm `/mcp` lists it and its tools are callable | untested |

---

## C. The 25 Codex names we do not implement

Each already answers with a pointer or an honest "no equivalent" (`codex-names.ts`). The task is to
decide, per name, whether it should become real.

`app` `apps` `auto-review` `btw` `cd` `debug-config` `elevate-sandbox` `experimental` `feedback`
`ide` `import` `keymap` `memories` `memory-drop` `memory-update` `mention` `multi-agents`
`personality` `pets` `plugins` `rollout` `sandbox-read-root` `side` `test-approval` `vim`

Three are deliberately absent even as pointers — `debug-m-drop`, `debug-m-update` and
`test-approval` are upstream debug hooks, and mirroring another product's debug surface is noise, not
parity.

`/cd` is the one with a recorded decision rather than a pending one: consent state is seeded once, so
approving a gate raised for the old directory would persist trust for the new one. A `/cd` that moves
the path and leaves the posture behind is worse than none.

## D. 13 commands we have that Codex does not

`help` `retry` `sessions` `ask` `select` `progress` `approval` `effort` `login` `image` `subagents`
`sandbox` `memory`

Not a gap — the opposite. Worth keeping in view so a future "parity" pass does not delete them.
