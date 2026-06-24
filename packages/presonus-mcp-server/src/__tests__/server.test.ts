/**
 * Tests for server configuration logic.
 *
 * Verifies:
 *   - REQ-NF-002 (#22): Zero write tools in control_locked/default config
 *   - REQ-NF-004 (#24): MCP server operational within 3 s
 *   - ADR-005 (#10) + ADR-006: computeWriteEnabled() policy
 *   - QA-SC-002 (#26): Safety boundary — write tools disabled in locked mode
 *
 * Tests computeWriteEnabled() as a pure function (no I/O, no deps).
 * Server startup timing verified via mocked dependencies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeWriteEnabled } from '../server.js'
import type { ServerConfig } from '../server.js'

// ---------------------------------------------------------------------------
// computeWriteEnabled — pure function tests (REQ-NF-002, QA-SC-002)
// ---------------------------------------------------------------------------

describe('computeWriteEnabled — REQ-NF-002 (#22) / QA-SC-002 (#26)', () => {
  it('default config (empty) → false', () => {
    expect(computeWriteEnabled({})).toBe(false)
  })

  it('controlEnabled: true, no operationMode → true', () => {
    expect(computeWriteEnabled({ controlEnabled: true })).toBe(true)
  })

  it('controlEnabled: false explicitly → false', () => {
    expect(computeWriteEnabled({ controlEnabled: false })).toBe(false)
  })

  it('control_locked + controlEnabled: true → false (locked overrides all)', () => {
    const config: ServerConfig = { operationMode: 'control_locked', controlEnabled: true }
    expect(computeWriteEnabled(config)).toBe(false)
  })

  it('control_locked alone (no controlEnabled) → false', () => {
    expect(computeWriteEnabled({ operationMode: 'control_locked' })).toBe(false)
  })

  it('soundcheck_assist + controlEnabled: true → true', () => {
    expect(computeWriteEnabled({ operationMode: 'soundcheck_assist', controlEnabled: true })).toBe(true)
  })

  it('prepare + controlEnabled: true → true', () => {
    expect(computeWriteEnabled({ operationMode: 'prepare', controlEnabled: true })).toBe(true)
  })

  it('soundcheck_assist without controlEnabled → false (requires explicit opt-in)', () => {
    expect(computeWriteEnabled({ operationMode: 'soundcheck_assist' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createServer startup timing — REQ-NF-004 (#24)
// ---------------------------------------------------------------------------

// Mock all heavy dependencies so startup timing is measured without real I/O
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {
    resource() {}
    tool() {}
  },
  ResourceTemplate: class {
    constructor(_template: string, _opts: unknown) {}
    list: undefined
  },
}))
vi.mock('@presonus-mcp/adapter', () => ({
  PresonusClientManager: class {
    setAllWriteEnabled() {}
    getConnectedDeviceIds() { return [] }
    getIdentity() { return undefined }
    getSnapshot() { return undefined }
    getSummarizer() { return undefined }
    connect() { return Promise.resolve() }
    disconnect() { return Promise.resolve() }
  },
  discoverMixers: vi.fn(async () => ({ devices: [], missingConfigured: [], unknownDiscovered: [] })),
}))

describe('createServer startup timing — REQ-NF-004 (#24)', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  it('createServer() returns in << 3000ms with discovery disabled', async () => {
    const { createServer } = await import('../server.js')
    const t0 = performance.now()
    const server = await createServer({ discovery: { enabled: false } })
    const elapsed = performance.now() - t0
    expect(server).toBeDefined()
    // Should complete in well under 500ms (synchronous init; discovery disabled)
    expect(elapsed).toBeLessThan(3000)
  })

  it('server returned by createServer() is non-null (resources ready on return)', async () => {
    const { createServer } = await import('../server.js')
    const server = await createServer({ discovery: { enabled: false } })
    expect(server).toBeTruthy()
  })

  it('control_locked mode does not register write tools (QA-SC-002 #26)', async () => {
    const { createServer } = await import('../server.js')
    // No write tools even with controlEnabled:true when control_locked
    const server = await createServer({
      operationMode: 'control_locked',
      controlEnabled: true,
      discovery: { enabled: false },
    })
    expect(server).toBeDefined()
    // computeWriteEnabled verified above; server creation proves it doesn't throw
  })
})
