import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests live next to the code they cover, per rules/testing.md § 5.
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
