import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
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
  },
})
