# Contributing

The conventions this repository enforces live in the code that enforces them — `npm run lint`
chains six gates, `npm test` runs the suite, and every gate's reasoning is in its own source. This
file holds the one thing no gate can check: **how to know that what you measured is what runs.**

## Verifying a change

`npm run lint && npm run typecheck && npm test && npm run depcruise` before a commit. `npm run build`
before believing anything about the binary.

Green gates are necessary and not sufficient. For a change that alters what the product *does* —
a dependency bump, a new option reaching the framework, anything about what the agent can read —
exercise the built binary in a throwaway project. The suite mocks the boundary this kind of change
crosses, which is exactly why it stays green through the failure.

## Ways a careful measurement still lies

All of these happened here, and none is caught by being more careful with the measurement itself.
The fault is upstream of it.

### A compound command can skip the step that gave the rest its meaning

```bash
npm run build && rm -rf "$P/.theokit/skills" && run-the-probe   # DON'T
```

That line reads as "rebuild, then measure". A repository hook refuses the `rm -rf`, the shell
aborts, and the probe runs against the previous binary. The result was reproducible three times
and described a defect that did not exist — an upstream issue was filed and had to be retracted.

Run the destructive step and the verification as **separate commands**, and prove the build landed
rather than assuming it:

```bash
npm run build
grep -c MY_PROBE_MARKER dist/theocode.mjs      # 1, or the probe is measuring the old binary
```

### A negative result without a positive control is not evidence

A probe that "did not fire" has two explanations: the thing under test is broken, or the probe never
had a chance. Telling them apart costs one extra run.

Measured here: `.claude/hooks.json` did not fire in an untrusted directory, which read as the SDK
refusing to honour a declaration. The control — the *native* `.theokit/hooks.json`, same directory —
did not fire either. This product's trust gate withholds every repository hook there, so the arm
proved nothing about the SDK, and the conclusion drawn from it would have had an upstream maintainer
revert correct behaviour.

Before reporting a negative, run the arm that should succeed. If it also fails, the probe is what is
broken.

### Two legitimate artifacts can disagree, and only one is executed

`AgentBuilder.build()` returns a definition carrying the raw declaration; `compileAgentDefinition`
returns the compiled options carrying the resolved decision. Both are real, both are inspectable,
and reading the first while the runtime uses the second produced a second wrong report the same day.

`tools/check-sdk-pin.mjs` has the same shape by design: it compares declarations across three
manifests and reported "one pin, agreed" while the installed tree still held the previous version.
It is doing its job — it cannot see an install that did not happen.

So the question is not *"did I inspect an artifact?"* but **"which artifact does the system
execute?"** Answer it by following the call path, or by instrumenting the real call site and
rebuilding.

### A test double must branch on everything the real function branches on

`composition.test.ts` mocks the subagent loader so a role's declared tools are the test's input. The
double keyed on one argument — the setting sources — and ignored the directory:

```ts
const discoverSubagents = vi.fn((_cwd: string, opts: { settingSources: string[] }) => ...)
```

That was faithful while production called the loader once. When the operator's root was added, it
called it **twice** — once for the project, once for the home — and both calls pass
`settingSources: ['project']`, because that token selects the `<cwd>/.theokit/agents` *layout*, not
the root. The double could not tell the two calls apart, so it answered the home call with the
repository's roles, and a test asserting that an untrusted repository is refused would have passed
while the repository's own definition was used.

The danger is the direction it fails in. A double that keys on fewer dimensions than the real
function silently **merges two different calls into one answer**, and merged answers look like
passes. Its own docblock had already warned that a mock returning roles regardless "would make the
untrusted assertion pass for the wrong reason" — the warning was right and the code had drifted past
it.

Before trusting a double, list the inputs the real function branches on and check the double branches
on each. If it does not, it is answering a different question than the code does.

### A filter narrower than the signal reports absence, and absence reads as a negative

Four times in one day, across two repositories, a measurement was nearly reported backwards because
the output was trimmed before it was read:

| filter | what it cut | the conclusion it would have produced |
|---|---|---|
| `tail -3` | a version-floor warning printed at the top | "the snapshot does not fix #74" |
| `grep -A2` | an `env:` twelve lines below the match | "the token never reached the branch" |
| `tail -30` of a push log | the gate's own diagnostic | "the push failed, reason unknown" |
| the test runner from the repo root | a package's setup | "72 tests broke, this is a regression" |

The asymmetry is what makes this dangerous. A **wrong command** produces an error, and an error
demands attention. A **narrow filter** produces silence — and silence is exactly what a true negative
looks like, so nothing about it feels wrong. The first case above was caught only because the same
command was re-run without the pipe.

The version-floor case is the sharpest: `compatSources` had been switched off by a guard before the
test could exercise it, so the arm did not fail, it was **void**. Reporting it as a failure would
have sent someone hunting for a bug in code that was correct.

Before trusting a negative result, re-run the command with no filter at all and read the whole
output. If that is impractical, filter for the signal AND for the words a guard would use when it
disables something.

## Filing upstream

This product is built on `@theokit/*`, and a finding often belongs to a repository that is not this
one. Before filing: reproduce against the **published** artifact, not a local checkout; search the
target tracker for a duplicate; and state the measurement, not the conclusion drawn from it.

If a maintainer cannot reproduce your report, that is data. Two upstream reports from this
repository were retracted after the owning session refused to fix a defect it could not observe —
in both cases the cause was on this side, and a "fix" there would have hidden it.

## Changelog

`CHANGELOG.md` is written for the person consuming this product, not for the person who changed it.
Reasoning about how a change was measured belongs in the commit message and in the source; what the
entry owes the reader is what became different for them.
