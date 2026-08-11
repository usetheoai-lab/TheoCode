# ADR 0002 — Cycle artifacts are promoted to `docs/`; `.claude/knowledge-base/` is a working area

- Status: accepted
- Date: 2026-08-10
- Supersedes for this project: `rules/knowledge-base-location.md`'s "canonical, always" clause
- Item: B-064

## Context

Two rules in this repository disagree, and both were written deliberately.

`.gitignore:19-22` states the reason `.claude/` is untracked, in its own words:

> Claude Code kit — LOCAL, never versioned. A tool for whoever develops this, not product
> code: someone who clones TheoCode gets the agent, not the maintenance scaffolding of the
> people who write it.

`rules/knowledge-base-location.md` states the opposite about one subtree:

> **`<project>/.claude/knowledge-base/` is canonical. Always.**

Measured on 2026-08-10: `git ls-files .claude` returns **0** against **176 `.md` files on disk**.
A parallel, versioned trail exists at `docs/` — 1 ADR, 2 plans, 3 reviews, 1 figure. Two plan files
existed in both homes and one had **diverged** (3 hunks; the `docs/` copy newer by 39 minutes and
carrying backticks the repository's own English-only detector needs).

The consequence was live, not theoretical: this session's active-plan pointer resolved to the
**unversioned** copy while the tracked one was the newer of the two.

## Decision

**`docs/` is where a cycle artifact lives once it is worth keeping. `.claude/knowledge-base/` is
the working area it is produced in.**

The rule file's clause is amended for this project. It is not deleted: its *reasoning* — that an
audit reading the wrong directory reports absence where evidence exists — is exactly what this ADR
exists to prevent, and it is why the promotion has to be enforced rather than remembered.

## Why this direction and not the other

The alternative was to un-ignore `.claude/knowledge-base/`, which would make the repository comply
with the rule as written. It was rejected because it reverses a decision someone already made **and
wrote down with its reasoning**: the kit is the maintainers' scaffolding, and a person cloning
TheoCode should get the product, not the tooling of the people who build it. Nothing measured here
contradicts that reasoning; what was wrong is that the rule file never acknowledged it.

The second consideration is that `docs/` was already winning in practice. Three reviews, two plans
and an ADR had been promoted there by hand. The team had answered this question; the answer was
simply not written anywhere, so it could not be enforced and the copies drifted.

## Consequences

- An artifact that only ever exists under `.claude/knowledge-base/` is **not evidence** — it does
  not survive a clone and no reviewer can open it. Cite `docs/` paths in `BACKLOG.md`.
- Promotion is a step, not an afterthought: when a cycle produces something durable (a plan that was
  implemented, a review that closed items, an acceptance record), it is copied to `docs/` in the
  same commit that acts on it.
- A file must not exist in both homes with different content. When it exists in both, `docs/` is
  authoritative.
- `rules/knowledge-base-location.md` remains correct for consumers that version their `.claude/`.
  This ADR narrows it for TheoCode only.

## Enforcement

`tools/check-artifact-promotion.mjs`, wired into `npm run lint`. It fails when a `.md` file exists
in both homes with differing content — the specific defect measured above, and the one that made a
stale plan the active one.

It deliberately does NOT require every working file to be promoted. Drafts, intake logs and
in-flight iteration notes belong in the working area, and a check that demanded promotion of all of
them would push people to stop using the working area at all.
