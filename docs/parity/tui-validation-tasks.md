# TUI validation — every command, and the four things a user creates

Status of each row is one of: `untested` · `PASS` · `FAIL` · `n/a`. A row moves off `untested` only
when it was **driven in the running TUI** and the result observed — not when the code looks right.

Measured 2026-09-02: **46 commands here, 58 in Codex 0.147.0.**

**COMPLETE (2026-09-02) — all 55 rows resolved: 47 PASS, 1 FIXED, 3 FAIL, 1 PARTIAL, 3 n/a.**

| outcome | rows |
|---|---|
| PASS | 47 |
| FIXED in the sweep | 1 — `/memory` reported ON while nothing could be written |
| FAIL | 3 — skills (#67, two rows) and MCP (#68) |
| PARTIAL | 1 — `/hooks` cannot answer before the first turn |
| n/a | 3 — `/delete`, `/quit`, `/logout` are destructive of the operator's own session or credentials |

**Every surface a user creates works end to end except skills and MCP**, and both fail the same way:
listed by their panel, absent from the agent's toolset. Subagents are the proof the bar is reachable
— created, listed, and delegated to in one sitting. Findings filed as usetheoai-lab/TheoCode#67 (skills). One defect was found AND fixed in the sweep:
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
| 1 | `/clear` | transcript clears, session kept | PASS |
| 2 | `/new` | new session, banner loses `(resumed)` | PASS |
| 3 | `/resume` | picks a prior session | PASS |
| 4 | `/fork` | branches the session | PASS |
| 5 | `/sessions` | lists sessions | PASS |
| 6 | `/archive` | archives current | PASS |
| 7 | `/delete` | deletes, refuses the live one | n/a |
| 8 | `/rename` | renames | PASS |
| 9 | `/compact` | compacts, reports what was dropped | PASS |
| 10 | `/quit`, `/exit` | leaves, restores terminal title | n/a |

### A2. Model and turn control

| # | command | expected | status |
|---|---|---|---|
| 11 | `/model` | switches, footer updates | PASS |
| 12 | `/effort` | switches reasoning effort | PASS |
| 13 | `/retry` | re-runs last turn | PASS |
| 14 | `/stop` | interrupts a running turn | PASS |
| 15 | `/goal` | sets an objective loop | PASS |
| 16 | `/plan` | plan mode | PASS |
| 17 | `/ask` | question prompt | PASS |
| 18 | `/select` | selection prompt | PASS |
| 19 | `/progress` | progress surface | PASS |

### A3. Trust, permission and sandbox

| # | command | expected | status |
|---|---|---|---|
| 20 | `/approval` | changes approval policy, footer updates | PASS |
| 21 | `/permissions` | permission panel | PASS |
| 22 | `/sandbox` | changes sandbox mode, footer updates | PASS |
| 23 | `/login`, `/logout` | credential lifecycle | n/a |

### A4. Context and inspection

| # | command | expected | status |
|---|---|---|---|
| 24 | `/status` | model, effort, approval, sandbox, cwd, **agents.md incl. user layer** | PASS |
| 25 | `/usage` | token usage panel | PASS |
| 26 | `/diff` | shows working-tree diff | PASS |
| 27 | `/ps` | background shells | PASS |
| 28 | `/memory` | memory panel, `off\|on`, `forget <n>` | FIXED |
| 29 | `/copy` | copies last reply | PASS |
| 30 | `/export` | writes the conversation | PASS |
| 31 | `/raw`, `/raw all` | prints into scrollback | PASS |
| 32 | `/image <path>` | attaches an image to the next turn | PASS |
| 33 | `/help`, `?` | shortcut panel incl. **ctrl+o** | PASS |
| 34 | `/pwd` | prints the working directory | PASS |

### A5. Extension surfaces — the four things a user creates

| # | command | expected | status |
|---|---|---|---|
| 35 | `/agents` | **lists subagents from `.theokit/agents/`** | PASS |
| 36 | `/subagents` | same set, other name | PASS |
| 37 | `/skills` | **lists skills from `.theokit/skills/`** | FAIL |
| 38 | `/hooks` | **lists hooks, and says which source each came from** | PARTIAL |
| 39 | `/mcp` | lists MCP servers, names the ones that failed | PASS |
| 40 | `/init` | scaffolds project config | PASS |

### A6. Appearance

| # | command | expected | status |
|---|---|---|---|
| 41 | `/theme` | switches live | PASS |
| 42 | `/title` | sets terminal title; `app dir` default | PASS |
| 43 | `/statusline` | chooses footer fields | PASS |
| 44 | `/review` | review flow | PASS |
| 45 | ctrl+o | **collapsed ↔ detailed transcript** | PASS |
| 46 | esc / esc-esc | interrupt, then backtrack | PASS |

---

## B. Creating the four artefacts — end to end, not just listing

Listing an empty set proves nothing. Each row below **creates** the artefact, restarts if needed,
and checks the agent actually honours it.

| # | artefact | task | status |
|---|---|---|---|
| 47 | **rule** | write `.theokit/rules/x.md`, ask something it governs, see it obeyed | PASS |
| 48 | rule, scoped | add `paths:` frontmatter, confirm it applies only to matching files | PASS |
| 49 | **rule, user layer** | `~/.theocode/rules/x.md` obeyed in a project that has none | PASS |
| 50 | **instructions** | `AGENTS.md` obeyed; `~/.theocode/AGENTS.md` obeyed in an untrusted dir | PASS |
| 51 | **skill** | write `.theokit/skills/x/SKILL.md`, confirm `/skills` lists it AND the agent can invoke it | FAIL |
| 52 | **subagent** | write `.theokit/agents/x.md`, confirm `/agents` lists it AND it can be delegated to | PASS |
| 53 | **hook** | declare one in `config.toml`, confirm it fires on a tool call | PASS |
| 54 | hook, denial | a hook that blocks — confirm the call is refused and the reason is shown | PASS |
| 55 | **MCP server** | declare one, confirm `/mcp` lists it and its tools are callable | FAIL |

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
