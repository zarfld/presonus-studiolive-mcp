import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'presonus-adapter',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.hil.test.ts'],
    environment: 'node',
  },
})
