# TheoCode

A terminal coding agent: one agent core, two surfaces.

```
packages/
├── agent/     the agent and everything that composes it — context, tools, delegation,
│              sessions, hooks, auth, config, pty, goal, review
├── shared/    what both surfaces need; neither one owns it
├── tui/       surface 1 — the terminal UI (Ink + React)
└── cli/       surface 2 — the headless CLI
```

The direction of dependency is the whole design: `tui` and `cli` consume `agent`, `agent` never
consumes a surface, and the two surfaces never consume each other. The layout makes that visible;
`npm run depcruise` enforces it — the `exports` map alone does not, because `tsconfig.json` maps
`@theocode/agent/*` straight onto `packages/agent/src/*` and TypeScript resolves through that
mapping without ever consulting `exports`.

## Running it

```bash
npm install
npm run dev          # the terminal UI
npm run exec "..."   # the headless CLI
npm run build        # dist/theocode.mjs (bundle) + dist/acp-entry.mjs
```

Smoke test that touches neither the network nor a credential:

```bash
node dist/theocode.mjs sessions gc
```

## The packages

| Package            | What it is                                                                                                                                          | Reached as                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `@theocode/agent`  | The composition of the SDK with this product's policy. Not a library of agents — the SDK is `@theokit/agents`; this is what decides how it behaves. | `@theocode/agent/config`, `/auth`, `/session`, `/hooks`, … |
| `@theocode/shared` | Shutdown, the diagnostic sink, the agent seam.                                                                                                      | `@theocode/shared/shutdown`, `/diagnostic-sink`, `/agent`  |
| `@theocode/tui`    | Ink + React. Owns nothing about the agent beyond driving it.                                                                                        | `npm run dev`                                              |
| `@theocode/cli`    | Headless. Five modes: `run`, `resume`, `review`, `goal`, `sessions gc`.                                                                             | `npm run exec`                                             |

## Where configuration lives

Two directories, and they are not interchangeable. This is written down because it is not guessable
and because getting it wrong fails silently — a `[[hooks]]` block in the wrong one is ignored with
no error, and a hook is arbitrary command execution on every tool call (B-086).

| Path                              | Read by            | Holds                                                                                           |
| --------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `<project>/.theocode/config.toml` | this product       | `model`, `reasoning_effort`, `sandbox_mode`, `approval_policy`, `memory`, `shell_timeout_ms`, `session_gc`, `skills`, `[[hooks]]`, profiles |
| `~/.theocode/config.toml`         | this product       | the same keys, as your defaults; the project layer wins                                         |
| `~/.theocode/AGENTS.md`           | this product       | instructions that belong to YOU, in every project; the project's `AGENTS.md` is read after it   |
| `~/.theocode/rules/*.md`          | this product       | your own rules, scoped or not; the project's `.theokit/rules/` is read after them               |
| `<project>/.theokit/`             | the SDK's filebase | `agents/<name>.md` (subagents), `skills/<name>/SKILL.md`, `rules/`                              |
| `<project>/.mcp.json`             | the SDK            | MCP servers, spawned when the directory is trusted                                              |

The project layer of `.theocode/config.toml` is read **only for a trusted directory** — an untrusted
one falls back to your user layer, and no repository hook is wired at all. `/hooks` reports which of
those two you are in; `/status` reports the resolved model, effort, approval and sandbox.

Hook events are `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`. An unknown event name is a
loud parse failure, not a skipped hook.

## Testing an unreleased theokit fix

The theokit repositories publish a per-commit preview to pkg.pr.new on every push to `workspace`, so
a fix there can be exercised here before it is released — an install rather than a release cycle.

```yaml
# pnpm-workspace.yaml
blockExoticSubdeps: false                      # see below — required, and temporary
overrides:
  '@theokit/agents': 'https://pkg.pr.new/usetheokit/theokit/@theokit/agents@<sha>'
```

`pnpm install`, then check the lockfile records the URL rather than a registry version — that is how
you know the build under test is the commit and not what npm happens to serve.

**`blockExoticSubdeps: false` is not optional and should not stay.** pnpm 11 defaults it to `true`,
which refuses a URL-resolved package arriving as a *sub*dependency — and a preview of
`@theokit/agents` rewrites its sibling `@theokit/presenter` to a preview URL too, so the whole
install is refused without it. It disables a supply-chain guard for the entire tree, not just for the
pinned package, so revert both lines once the answer is in. Filed upstream as
[usetheokit/theokit#632](https://github.com/usetheokit/theokit/issues/632).

Used this way it isolated [theokit#631](https://github.com/usetheokit/theokit/issues/631) to one
repository in a single install: the fix under test was in `@theokit/agents`, the symptom survived it,
and that was enough to say the remaining half lived in `@theokit/sdk`.

## What a failure is allowed to cost

**No availability number is claimed here, and that is deliberate.** This product has no sustained
production measurement to back one, and publishing a figure without it is the thing
`rules/public-copy.md` § 5 forbids. What it does have is a target for the SHAPE of a failure, which
is reviewable without a metrics pipeline and falsifiable by a test:

- **A failed turn says what failed.** Never `An error occurred.`: the provider's message, the error
  code when the framework supplies one, and a next step for the classes common enough to have one.
- **A failure that cost retries says so.** The transport retries; a turn that spent three attempts
  reports three, so a refused credential cannot read as a quota problem.
- **A failure names the way to see more**, when there is more to see and diagnostics are off.
- **Housekeeping never takes the agent down.** The session collector reports its failures instead of
  raising them, and sweeps at most once a day.
- **The delete path fails towards keeping.** What the collector cannot classify is kept, and a
  retention window below the floor is refused rather than honoured.

Each bullet is covered by a test, and that was checked rather than asserted — writing this section is
what revealed that the retention floor, a guard on the delete path, had no test at all. The list is
the contract: if one stops holding, that is a bug rather than a change of ambition. It is written down
because the alternative — choosing by omission — is still a choice, and an unstated one cannot be
argued with.

## What is deliberately not here

This repository holds **production source and its tests**. `npm test` runs them:
**107 files, 837 cases** (measured 2026-09-03). The following were left out by an explicit decision —
stated here so nobody assumes they were forgotten:

- **The process toolchain** — the engineering-cycle kit, its rules, its plans and its audit trail.
  `.gitignore` keeps all of `.claude/` local by design: that directory is the maintainer's process,
  not the product, and it is an installed plugin with a repository of its own — versioning it here
  would commit a dependency's source into its consumer. So someone who clones this gets the agent,
  not the maintenance scaffolding of the people who write it.
- **The reference documentation** written against a different layout (journey map, parity register,
  configuration reference), whose paths no longer resolve.

## Credits — OpenAI Codex

**This agent is what it is because Codex went first.**

[OpenAI Codex](https://github.com/openai/codex) (Apache-2.0) was the reference this product was
built against — not as a repository to copy from, but as an answer to questions we had not yet
asked. Reading it changed decisions we would otherwise have made worse, and in four places it
shaped what shipped:

- **The persona.** The behavioural discipline of a terminal agent — when to plan and when to just
  act, how to constrain editing, how to end a turn with a short `file:line`-referenced answer —
  is Codex's. Ours re-expresses it against our own tools; it is a derivative work, and
  `packages/agent/src/context/instructions.ts` says so on its second line.
- **The tool contract.** `run_shell`, `apply_patch`, `edit_file`, `read_file`, `update_plan`,
  `write_stdin`, `web_search`, `interactive_shell` — these names are what the model is trained on.
  Diverging from them would have cost behaviour and bought nothing.
- **The wire format.** The headless JSON protocol follows Codex's event names and `usage` shape,
  so a consumer written against Codex reads our output without a translation layer.
- **The vocabulary.** `/compact`, `/review`, `/goal`, `/fork`, `/archive`, the three approval
  modes and the three sandbox modes carry Codex's semantics.

Beyond what shipped, Codex was the **measuring stick**. The question "do we have parity?" only had
an honest answer because there was a real implementation to read: 55 slash commands, 27 CLI
subcommands, the approval and sandbox postures, the keymap. Two capability gaps we would not have
noticed on our own — listing and stopping background PTYs — were found by comparing against it.

**Nothing was copied.** The study clone lived outside the tree, gitignored, read-only, and every
derivation above is design re-expressed in our own code. That discipline was a rule, not a habit:
a literal copy would carry the upstream licence into this repository, which is a legal problem and
not a stylistic one.

Thank you to the Codex team. Full attribution, with the specific files, is in `NOTICE`.

Credit is also due to **[opencode](https://github.com/sst/opencode)** (MIT), whose OAuth
device-authorization flow this product adapts — see `NOTICE`.

## Licence

See `NOTICE` and `licenses/`.
