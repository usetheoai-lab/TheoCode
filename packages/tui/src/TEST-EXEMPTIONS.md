# Files with no sibling test, and why

B-018 asked that every entry the TDD gate lists either gain a sibling test or carry an explicit
note. This is the note. Re-derive the list with:

```bash
git diff --name-only <base>..HEAD -- 'packages/**' | grep -E '\.tsx?$' | grep -vE '\.test\.'
```

then apply the gate's own rule (`.claude/hooks/stop-validation.sh`): a file is covered when its
directory holds ANY `*.test.ts{,x}`.

## Covered since B-018 was filed

`formatting/turn-error.ts` and `agent/tools/registry.ts` gained tests. Twelve more entries became
covered by the directory rule as tests landed for their neighbours during B-019..B-049.

## Exempt, with reasons

| File | Why |
|---|---|
| `tui/src/screen-types.ts` | Type declarations only. There is no behaviour to assert; a test would restate the types in a second syntax. |
| `tui/src/App.tsx` | Twenty-five lines of JSX composition with no branching. What it renders is asserted where it matters — `Banner.test.tsx` covers the banner, `secret-buffer` and `hook-decision` cover the logic pulled out of the components below it. |
| `cli/src/commands/{run,review,goal,sessions}.ts` | Orchestrators: parse-then-delegate, with the decisions already covered elsewhere (`args.test.ts` for the parsing, `run-composition.test.ts` for the composition, `parse.test.ts` for the review output). A test here would be a mock-return-mock assertion — the "ten mocks to test a function" shape `rules/testing.md` names as a design smell rather than a coverage win. |

## Not exempt — owed a test

| File | What is worth pinning |
|---|---|
| `agent/delegation/roles.ts` | **Half covered.** B-061's `composition.test.ts` pins the untrusted-source refusal, the declared tool set, and the injected working directory. Still owed: **effort inheritance** — `wireEffort` raises a typed error naming the accepted levels and the file to fix, and nothing reads it. |
| `agent/delegation/squad.ts` | That a member's authority never widens beyond the parent's posture. B-032 pinned the cwd half; the sandbox half is not covered. |
| `agent/delegation/delegation-cap.ts` | That the cap fires and that the work already written to disk is NOT reverted, which its own message promises. |
| `agent/goal/{goal,update-goal-tool}.ts` | The goal loop's stop conditions and budget accounting. |
| `tui/src/agent-session/{composition-root,tui-session}.ts` | Session rotation across `/new`, `/clear` and `/fork` — B-031 covered the persistence, not the rotation. |
| `tui/src/use-tui-composition.ts` | The prop assembly the whole surface depends on. |
| `tui/src/formatting/tool-header.ts` | What survived the B-027 deletion. |

These are not silenced: they are listed so the gap is countable. Reducing this table is the work.
