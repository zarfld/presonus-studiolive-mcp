/**
 * Vitest config for Hardware-in-Loop (HIL) tests.
 *
 * Requires: HIL_PRESONUS=1 env var AND a StudioLive III mixer on the local subnet.
 * Usage:   pnpm test:hil
 *
 * Excluded from vitest.config.ts so CI never times out waiting for hardware.
 *
 * resolve.alias maps workspace packages to their TypeScript source so HIL tests
 * in packages/presonus-mcp-server always exercise live source (not stale dist).
 */
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // Map @presonus-mcp/adapter to source so HIL tests in mcp-server always
      // exercise live TypeScript source (not stale compiled dist).
      // The adapter package.json exports only ./dist/index.js which would use
      // an old compiled version when source is changed but not rebuilt.
      '@presonus-mcp/adapter': resolve(__dirname, 'packages/presonus-adapter/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.hil.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporter: 'verbose',
    sequence: { concurrent: false },
  },
})
