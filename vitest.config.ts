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
     * NO THRESHOLD IS SET HERE, and that is a recorded decision rather than an omission (the
     * item's third acceptance bullet allows exactly this). A floor picked to sit just under
     * today's number is decorative — it ratchets nothing and turns green into noise. A floor
     * picked ABOVE it fails the build on work nobody has scheduled. Either way the number would
     * be chosen to be passed rather than to be met.
     *
     * What makes a floor meaningful is a decision about WHICH of the 40 zero-coverage files are
     * meant to stay that way — `main.ts` and command entry points are arguably composition, and
     * `use-tui-composition.ts` at 248 uncovered lines is arguably not. That triage is the next
     * item, and it is the one this configuration is here to make possible.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
    },
  },
})
