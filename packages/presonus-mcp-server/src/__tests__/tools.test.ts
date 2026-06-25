/**
 * Tests for tool registration — REQ-NF-002 (#22).
 *
 * Verifies: REQ-NF-002 — Zero write-capable MCP tools in default configuration.
 * Verifies: ADR-005 (#10) — Read-only-first registration policy.
 * Verifies: ADR-006 — Semi-automated write tools registered only when writeEnabled=true.
 *
 * Strategy: mock McpServer.tool() with a spy that records registered tool names.
 * This avoids importing the full MCP SDK and lets us test the registration logic
 * in isolation without a running server.
 */
import { describe, it, expect, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PresonusClientManager } from '@presonus-mcp/adapter'
import { registerTools } from '../tools.js'

/** Minimal McpServer mock that records registered tool names */
function makeMockServer(): { server: McpServer; registeredTools: string[] } {
  const registeredTools: string[] = []
  const server = {
    tool: (name: string, _description: string, _schema: unknown, _handler: unknown) => {
      registeredTools.push(name)
    },
  } as unknown as McpServer
  return { server, registeredTools }
}

/** Minimal PresonusClientManager stub (no methods needed for registration tests) */
function makeMockManager(): PresonusClientManager {
  return {} as PresonusClientManager
}

describe('registerTools — REQ-NF-002: zero write tools in default config', () => {
  it('registers exactly 15 read-only tools when writeEnabled=false', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: false })
    expect(registeredTools).toHaveLength(15)
  })

  it('registers discover_mixers, refresh_mixer_state, validate_mixer_identity in default config', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: false })
    expect(registeredTools).toContain('discover_mixers')
    expect(registeredTools).toContain('refresh_mixer_state')
    expect(registeredTools).toContain('validate_mixer_identity')
  })

  it('does NOT register propose_eq_change when writeEnabled=false', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: false })
    expect(registeredTools).not.toContain('propose_eq_change')
  })

  it('does NOT register apply_change_set when writeEnabled=false', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: false })
    expect(registeredTools).not.toContain('apply_change_set')
  })
})

describe('registerTools — ADR-006: write tools available when writeEnabled=true', () => {
  it('registers exactly 17 tools when writeEnabled=true (15 read + 2 write)', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: true })
    expect(registeredTools).toHaveLength(17)
  })

  it('registers propose_eq_change when writeEnabled=true', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: true })
    expect(registeredTools).toContain('propose_eq_change')
  })

  it('registers apply_change_set when writeEnabled=true', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: true })
    expect(registeredTools).toContain('apply_change_set')
  })

  it('still registers all 3 read-only tools when writeEnabled=true', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: true })
    expect(registeredTools).toContain('discover_mixers')
    expect(registeredTools).toContain('refresh_mixer_state')
    expect(registeredTools).toContain('validate_mixer_identity')
  })
})

describe('registerTools — stderr warning suppressed when write tools registered', () => {
  it('does NOT write a warning when writeEnabled=true (write tools are implemented)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { server } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: true })
    // The old "no write tools implemented" warning must not appear
    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((s) => s.includes('no write tools are implemented'))).toBe(false)
    stderrSpy.mockRestore()
  })
})
