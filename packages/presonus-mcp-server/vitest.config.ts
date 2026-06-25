import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    name: 'presonus-mcp-server',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@featherbear/presonus-studiolive-api': resolve(__dirname, '../presonus-adapter/src/__tests__/__stubs__/featherbear.mjs'),
    },
  },
})
