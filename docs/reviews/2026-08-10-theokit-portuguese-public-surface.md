# The Portuguese public surface of `@theokit/agents` — scoping for B-058

- Date: 2026-08-10
- Measured against: `@theokit/agents@7.4.0`, the **published build** in `node_modules`, not the reference source tree
- Item: B-058, DoD bullet 2 ("the exported-identifier subset scoped separately, with a deprecation path")

## Why this measurement is against the dist and not the source

Earlier in this cycle a claim was made from the reference source tree and the installed build
disagreed with it, at the same version number: `ToolsetError` reads `extends TheokitAgentError` in
`src/` and `extends Error` in `dist/`. The source tree runs ahead of its own published output.

For a scoping question the distinction is decisive: what a consumer can break on is what is
**published**. A symbol that is `export`ed in `src/` but not re-exported through an entrypoint never
reaches the `.d.ts` and cannot be a breaking change for anyone.

## Finding 1 — the public surface carries FOUR Portuguese names, and all four are type-only

| Name | Kind | Entrypoint | Occurrences in dist |
|---|---|---|---|
| `AgentComListaEstreitada` | type | `.` | 2 |
| `ListOptionsSemPaginacao` | type | `.` | 2 |
| `ToolComNome` | interface | `.` | 4 |
| `DefinicaoOuThunk` | type | `.` (via bridge entry) | 1 |

Runtime export surface: **none**. Verified by importing the package and filtering its keys —
`Object.keys(import * as A from '@theokit/agents')` yields no Portuguese identifier.

**Consequence for the blocker:** a type-only rename cannot break a consumer at runtime. It breaks a
`tsc` run, and only for a consumer that names the type explicitly. The standard remedy —
`/** @deprecated */ export type OldName = NewName` — costs one line each and is a **minor**, not a
major. `@theokit/agents` has already done exactly this once (B-053, three names, aliases kept for
one minor), so the path is established rather than hypothetical.

## Finding 2 — B-058's first blocker names a symbol that is not published

B-058 states:

> PUBLIC API. `theokit/packages/agents/src/auth/auth-provider.ts:73` declares
> `export function classificarFalhaDeRefresh`. Renaming an exported symbol in a PUBLISHED package is
> a breaking change for every consumer, TheoCode included. It needs a deprecation path and a major
> version, not a sed.

Measured: `classificarFalhaDeRefresh` appears **0 times** across every `.d.ts` in the published
package (`index`, `auth`, `bridge-entry`, `client`, `client-react`, `interactive`, `persistence`,
`pty`, `sandbox`, `agent-handle`). It is absent from the runtime exports and from the `./auth`
subpath. It is `export`ed in the source and the bundler does not publish it.

**The blocker's premise does not hold for the symbol it names.** It is a private function, and
renaming it breaks nobody.

This does not make blocker #1 disappear by fiat — it relocates it. The real public exposure is the
four type names above, and their cost is a minor with four alias lines, not a major.

## Finding 3 — TheoCode's own exposure is one comment

| Name | References in `packages/*/src` |
|---|---|
| `ListOptionsSemPaginacao` | 1 — a comment at `packages/agent/src/session/agent-list.ts:30` |
| the other three | 0 |

The single reference is prose accurately naming the framework's real type. **Renaming it locally
would make the comment wrong**, so there is no local remediation to do: TheoCode's half of B-058
was closed by B-052 (92 strings) and B-053 (three exported names).

## Proposed deprecation path

For the framework's own Squad install, not executable from here.

1. Add the English name beside each of the four, and make the Portuguese one an alias:
   `/** @deprecated Renamed to <English>. Removed in the next major. */ export type ToolComNome = NamedTool`
   — the shape `capability/toolset.ts:35` already uses, so this is consistency rather than novelty.
2. Ship in a **minor**. No runtime symbol changes, so no consumer breaks at execution.
3. Delete the aliases in the next major, with the sunset stated in the alias comment itself.

## What this scoping does NOT resolve

- **Blocker #2 — immutable history.** 4 342 of the 11 298 occurrences are markdown, mostly CHANGELOG
  prose for released versions. Unbreakable Rule 6 forbids editing a released entry. Untouched by
  this analysis, and a real decision.
- **Blocker #3 — ten repositories.** Each with its own suite, cadence and consumers. Untouched.
- **DoD bullet 3** — wiring an English-only guard into each repository's lint. Those repositories
  have their own Squad install; per `cycle-backlog.md § Repos this table does not cover`, an item
  filed from here against them routes nowhere.

## Bottom line

The public-API blocker was the expensive-looking one and it is the cheapest: four type aliases in a
minor. The two that remain are a governance decision about released history and a program across ten
repositories — neither of which is technical, and neither of which this install can execute.
