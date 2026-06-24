import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'presonus-mcp-server',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
