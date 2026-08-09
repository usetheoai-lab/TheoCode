# ADR 0001 — The `!` shell shortcut stays unwired

- **Status:** accepted
- **Date:** 2026-08-09
- **Item:** B-056 (follow-up of B-028)
- **Reversible:** yes, and cheaply — see § Escape hatch

> Recorded under `docs/adr/` and not `.claude/`. This repository deliberately does not version
> `.claude/` (commit `a01c1e9`), so a decision written there is a local file that can vanish — which
> would fail the very requirement it was written to satisfy. `docs/adr/` is created by this ADR
> because the repository had no versioned home for a decision at all.

## Context

`@theokit/tui`'s `ChatComposer` supports a `!cmd` shortcut, gated on an `onShellCommand` prop.
TheoCode never passed it, while the keyboard-help panel advertised the shortcut unconditionally —
`DEFAULT_COMPOSER_SHORTCUTS` is a static list. So `!npm test` was sent to the model as prose.

B-028 stopped the panel advertising it. That removed the false promise and left the question open:
should the feature exist?

## What was measured

**Every shell command in this product goes through the agent.** `run_shell` in `packages/tui` is a
RENDERER for the agent's tool calls (`formatting/tool-header.ts`); the executable tool lives in
`packages/agent`'s `ToolRegistry`, built inside `buildChatAgent`. The TUI holds no registry.

An agent-issued `run_shell` passes three gates, and they are not interchangeable:

| Gate | Where | What it stops |
|---|---|---|
| Approval | the SDK's HITL ledger, keyed on tool calls **within a turn** | a command running without the user seeing it |
| Sandbox scope | `resolveToolScope` -> `writeRoot` + kernel `workDir` | a command writing outside the project |
| Hook veto | `pre_tool_call`, `{ block: true, message }` | a command the project's own policy refuses |

A `!cmd` has **no turn**. The approval ledger has nothing to key on, so wiring the shortcut means
building a SECOND approval path beside the first — which is precisely the shape B-019 and B-021
were: a route to execution that skips the confinement every other route has.

## Options considered

1. **Ship it unconfined.** Rejected. It is the defect class this cycle spent itself closing.
2. **Ship it with a parallel gate.** A second approval path, a second scope resolution, a second
   veto hook — three chances for the two to drift, and the drift is silent by construction. The
   review that produced this backlog found four such divergences (B-019, B-020, B-033, B-034); each
   one was a second copy of a decision that had drifted from the first.
3. **Route `!cmd` through an agent turn.** All existing gates apply, no new code. But then it is not
   "run a shell command" — it is "ask the model to run one", which costs a turn and a token budget.
   That is not what the shortcut promises, and a shortcut that quietly costs money is worse than one
   that does not exist.
4. **Leave it unwired.** Current state.

## Decision

**Option 4.** The shortcut stays unwired and unadvertised.

The cost of NOT having it is small and honest: `/ps` and `/stop` manage background shells, and the
agent runs commands on request. The cost of having it is a second execution path whose gates must be
kept in step with the first by review rather than by construction — and this repository has just
finished paying for four instances of exactly that.

## Escape hatch

This is not a permanent no. Reversing it is:

1. `composerShortcuts({ shell: true })` in `ConversationRegion.tsx` — the filter is already keyed on
   the capability, so the help line comes back with no edit to the shortcut list.
2. Pass `onShellCommand` to `ChatComposer`.
3. The work this ADR is actually about: make that handler reach the same `resolveToolScope` and the
   same approval ledger as an agent-issued `run_shell`, with a test that fails when either is
   bypassed.

Step 3 is the condition. Steps 1 and 2 without it are the defect.

## Consequences

- `packages/tui/src/components/composer-shortcuts.ts` keeps the capability filter, which now
  documents a decision rather than a gap.
- If `@theokit/tui` ever makes its shortcut list capability-aware upstream, that filter becomes
  redundant and should be deleted rather than kept out of habit.
