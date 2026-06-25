import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    name: 'presonus-adapter',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.hil.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // The featherbear package has no dist/ files — redirect to a stub so
      // Vite can pre-bundle without failing. Tests that need specific behavior
      // override with vi.mock().
      '@featherbear/presonus-studiolive-api': resolve(__dirname, 'src/__tests__/__stubs__/featherbear.mjs'),
    },
  },
})
