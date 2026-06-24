import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'presonus-inspector',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
