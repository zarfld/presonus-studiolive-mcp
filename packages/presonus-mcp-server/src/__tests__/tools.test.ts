/**
 * Tests for tool registration â€” REQ-NF-002 (#22).
 *
 * Verifies: REQ-NF-002 â€” Zero write-capable MCP tools in default configuration.
 * Verifies: ADR-005 (#10) â€” Read-only-first registration policy.
 * Verifies: ADR-006 â€” Semi-automated write tools registered only when writeEnabled=true.
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

describe('registerTools â€” REQ-NF-002: zero write tools in default config', () => {
  it('registers exactly 33 read-only tools when writeEnabled=false (3 core + 5 routing + 1 capabilities + 2 diagnostics + 3 input-list + 2 fat-channel + 3 monitor-layout + 1 output-patch + 2 probe)', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: false })
    expect(registeredTools).toHaveLength(33)
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

describe('registerTools â€” ADR-006: write tools available when writeEnabled=true', () => {
  it('registers exactly 40 tools when writeEnabled=true (33 read + 7 write: propose_eq + apply + prepare_mute + prepare_fader + prepare_aux_send + prepare_fat_channel + validate_change_set)', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: true })
    expect(registeredTools).toHaveLength(40)
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

describe('registerTools â€” stderr warning suppressed when write tools registered', () => {
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

// ---------------------------------------------------------------------------
// REQ-F-ROUT-011 (#45) + TEST #59: Layer B routing stub tool registration
// ---------------------------------------------------------------------------

describe('registerTools — Layer B routing stubs (REQ-F-ROUT-011 #45, TEST #59)', () => {
  /**
   * Verifies: REQ-F-ROUT-011 (#45) — Layer B stub tools are registered
   * Verifies: TEST-ROUT-011 (#59) — Layer B tool registration and response structure
   * ADR-008 (#47): These tools are INTENTIONALLY stubs — they return
   * 'not_verifiable_with_current_adapter' for physical/AVB routing.
   * Traces to: #3 (StR: Soundcheck assistance)
   */

  it('registers all 5 routing tools including Layer B stubs (get_routing_graph, validate_input_routing, validate_stagebox_routing, diagnose_no_signal_routing, detect_possible_patch_swap)', () => {
    const { server, registeredTools } = makeMockServer()
    registerTools(server, makeMockManager(), { writeEnabled: false })
    // Layer A tools (observable software state)
    expect(registeredTools).toContain('get_routing_graph')
    expect(registeredTools).toContain('detect_possible_patch_swap')
    // Layer B stubs (intentionally return not_verifiable for physical routing)
    expect(registeredTools).toContain('validate_input_routing')
    expect(registeredTools).toContain('validate_stagebox_routing')
    expect(registeredTools).toContain('diagnose_no_signal_routing')
  })

  it('Layer B tools are present in both writeEnabled=true and writeEnabled=false configs', () => {
    for (const writeEnabled of [false, true]) {
      const { server, registeredTools } = makeMockServer()
      registerTools(server, makeMockManager(), { writeEnabled })
      // Layer B stubs must always be registered regardless of write mode
      expect(registeredTools).toContain('validate_stagebox_routing')
      expect(registeredTools).toContain('validate_input_routing')
      expect(registeredTools).toContain('diagnose_no_signal_routing')
    }
  })
})



