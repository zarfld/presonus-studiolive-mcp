import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'presonus-domain',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
