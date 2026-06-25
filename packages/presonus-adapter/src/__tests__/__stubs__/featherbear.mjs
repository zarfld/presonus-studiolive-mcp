/**
 * Vitest stub for @featherbear/presonus-studiolive-api.
 *
 * The published package has no dist/ files (only source + patch).
 * This stub satisfies Vite's pre-bundling step. Tests that need specific
 * behavior should use vi.mock() to override at the test level.
 */

export const Client = class {
  constructor(_options) {}
  connect() { return Promise.resolve() }
  close() { return Promise.resolve() }
  dumpState() { return Promise.resolve({}) }
  getProjects() { return Promise.resolve([]) }
  meterSubscribe() {}
  on() { return this }
  state = { get: () => null }
  currentProject = null
  currentScene = null
}

export const Discovery = class {
  on(_event, _cb) { return this }
  start() {}
  stop() {}
  destroy() {}
}
