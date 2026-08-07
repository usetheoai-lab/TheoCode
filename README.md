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
the `exports` map in each `package.json` makes it enforceable — a domain is reached through its
declared entry, not by a path into its internals.

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

| Package | What it is | Reached as |
|---|---|---|
| `@theocode/agent` | The composition of the SDK with this product's policy. Not a library of agents — the SDK is `@theokit/agents`; this is what decides how it behaves. | `@theocode/agent/config`, `/auth`, `/session`, `/hooks`, … |
| `@theocode/shared` | Shutdown, the diagnostic sink, the agent seam. | `@theocode/shared/shutdown`, `/diagnostic-sink`, `/agent` |
| `@theocode/tui` | Ink + React. Owns nothing about the agent beyond driving it. | `npm run dev` |
| `@theocode/cli` | Headless. Five modes: `run`, `resume`, `review`, `goal`, `sessions gc`. | `npm run exec` |

## What is deliberately not here

This repository holds **production source only**. It was extracted from `agent-builder`, and the
following were left behind by an explicit decision — stated here so nobody assumes they were
forgotten:

- **The test suite** (152 files, 1,524 cases) and the **12 architecture gates**. `npm test` does not
  exist here. Any claim about this code's behaviour is currently unverified in this repository.
- **The process toolchain** — the vendored CYCLE kit, its rules, its plans and its audit trail.
- **The documentation** built against the previous structure (journey map, parity register,
  configuration reference), whose paths no longer resolve.

`agent-builder` remains intact and is where all of that still lives.

## Licence

See `NOTICE` and `licenses/`.
