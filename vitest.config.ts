import { cpus } from 'node:os'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Default is os.availableParallelism(): one fork per core, each booting a full
    // test environment. Capping leaves headroom for the host, and costs no wall-clock
    // because the gain above this point was already noise when measured.
    maxWorkers: Math.max(2, cpus().length - 4),
    // Tests live next to the code they cover, per rules/testing.md § 5.
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'tools/**/*.test.mjs'],
    environment: 'node',
    /**
     * The default is 5000, and the first test in any file that builds an agent was landing at
     * ~5100 under full-suite parallelism while passing in ~700ms alone.
     *
     * MEASURED before changing this, because raising a timeout to silence a red test is how a real
     * defect gets buried: importing `@theokit/agents` costs ~420ms on its own, `resolveToolScope`
     * ~17ms, `new ToolRegistry` ~8ms, and the B-059 composition entry ~1ms. The cost is the
     * framework barrel, which every agent-building file pays once at import, and it predates any of
     * this work — the 51st test file simply pushed the parallel workers past the line.
     *
     * So this is a threshold that was always too tight for a 400ms import, not a slowdown to fix.
     * A flaky test is a bug (`rules/testing.md` § 3) and the fix belongs at the cause; the cause
     * here is the limit itself.
     */
    testTimeout: 20_000,
    /**
     * B-063 — the first coverage this repository has ever measured, and the reason it exists is
     * that three different matchers answered "which files are untested" with 51, 7 and 55 files.
     * All three read STRINGS: a filename appearing in a test file's text, an import specifier
     * resolved to a path. None of them ran anything.
     *
     * The instructive failure was `packages/agent/src/session/gc/per-session.ts`, scored TESTED
     * because `pointer.test.ts:11` names it in a prose COMMENT. Coverage, which runs the tests
     * rather than reading them, puts it at 46% — and its only production caller,
     * `packages/cli/src/commands/sessions.ts`, at ZERO.
     *
     * MEASURED 2026-08-20, 555 tests:
     *
     *   Statements  47.58%  (4827/10144)      files in packages/  179
     *   Branches    76.04%  (1000/1315)       at ZERO coverage     40  (1748 lines)
     *   Functions   57.00%  (358/628)
     *
     * NO THRESHOLD IS SET BY VITEST, and that is still deliberate. B-063's reasoning was: a floor
     * picked to sit just under today's number is decorative — it ratchets nothing and turns green
     * into noise; a floor picked ABOVE it fails the build on work nobody has scheduled. Either way
     * the number would be chosen to be passed rather than to be met.
     *
     * B-159 (2026-09-09) overturned half of that, and only half. "No floor" stopped being
     * available: `/implement`'s validation gate enforces one regardless, and with none declared it
     * used DEFAULT_MIN_PERCENT = 80 from the kit's `coverage_gate.py` — a number chosen by nobody
     * here, failing every plan. The choice was never floor-vs-no-floor; it was our number vs a
     * library's.
     *
     * So a floor now exists, in `.claude/rules/code-quality-thresholds.txt` as
     * `coverage.min_percent`, set to EXACTLY the measured total with no slack. The slack is what
     * B-063's sentence was about: it is what permits regression while reading as a standard. With
     * none, any change that lowers total coverage fails. That is a ratchet, not a decoration.
     *
     * It is deliberately NOT here. This file configures the reporter; the gate that reads the
     * report is the kit's, and one number in one place is the whole point.
     *
     * MEASURED 2026-09-09, 1479 tests: lines 59.29% (2663/4491), 34 files at zero coverage
     * (594 lines), 240 source files.
     *
     * DO NOT DIFFERENCE THESE AGAINST THE 2026-08-20 BLOCK ABOVE. A first draft of this comment
     * said "1154 lines of the original debt were covered in three weeks", from 1748 − 594. Three
     * reviewers falsified it independently: the two runs used different major versions of the
     * coverage tool (`@vitest/coverage-v8` ^3.2.7 -> ^4.1.11), and the re-accounting is visible —
     * with this `coverage:` block byte-identical and the source set GROWING 179 -> 240 files,
     * reported statements halved (10144 -> 5054) while branches and functions roughly doubled. A
     * single glob over a growing tree cannot do that; the counting basis changed. Each run is
     * correct about its own tree. The subtraction is not a measurement of anything.
     *
     * What IS comparable is the file COUNT, which does not depend on how statements are
     * attributed: 40 files at zero coverage out of 179, down to 34 out of 240. Fewer untouched
     * files across a larger codebase — real progress, made with no floor in force. So the floor is
     * not what produces the improvement; it is what stops the loss.
     *
     * What makes a floor MEANINGFUL is still the decision B-063 named and nobody has made: WHICH
     * of the zero-coverage files are meant to stay that way — `main.ts` and command entry points
     * are arguably composition, and `use-tui-composition.ts` is arguably not. That triage remains
     * the next item, and 59.29% is a ratchet, never a target.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
    },
  },
})
