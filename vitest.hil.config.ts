/**
 * Vitest config for Hardware-in-Loop (HIL) tests.
 *
 * Requires: HIL_PRESONUS=1 env var AND a StudioLive III mixer on the local subnet.
 * Usage:   pnpm test:hil
 *
 * Excluded from vitest.config.ts so CI never times out waiting for hardware.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.hil.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporter: 'verbose',
    sequence: { concurrent: false },
  },
})
