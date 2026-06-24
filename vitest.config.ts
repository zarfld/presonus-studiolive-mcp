import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    exclude: ['packages/*/src/**/*.hil.test.ts', '**/node_modules/**'],
    environment: 'node',
  },
})
