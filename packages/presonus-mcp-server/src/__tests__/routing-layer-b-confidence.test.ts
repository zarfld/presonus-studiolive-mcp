/**
 * Routing Layer B confidence invariant tests.
 *
 * Asserts that Layer B stub tools (`get_input_routing`, `validate_avb_routing`)
 * NEVER return `observed` or `inferred` confidence.  These tools intentionally
 * return probe instructions only — they must never imply that routing has been
 * verified.
 *
 * TDD:
 *   RED  = stub tools return observed/inferred by mistake.
 *   GREEN = stub tools always return stub / not_verifiable_with_current_adapter.
 *
 * @implements REQ-F-INP-001 — Layer B stub always returns not_verifiable
 * @architecture #47 ADR-008: Layer A/B separation
 * Traces to: #33 REQ-F-ROUT-003, #34 REQ-F-ROUT-004
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerTools } from '../tools.js'

// ---------------------------------------------------------------------------
// Minimal stub doubles — just enough for the tool registration to succeed.
// We don't need a real mixer connection for these Layer B stubs.
// ---------------------------------------------------------------------------
function makeMinimalClientManager() {
  return {
    getConnectedDeviceIds: () => ['test-device'],
    getSnapshot: (_id: string) => ({
      deviceId: 'test-device',
      channels: [],
      outputPatch: undefined,
      isStale: false,
      disconnectedAt: undefined,
    }),
    getIdentity: () => ({ deviceId: 'test-device', name: 'Test Mixer', serial: 'TEST001', role: 'foh' }),
    getSummarizer: () => undefined,
    connect: () => Promise.resolve(),
  } as unknown as Parameters<typeof registerTools>[1]
}

// ---------------------------------------------------------------------------
// Minimal MCP server double that captures tool registrations
// ---------------------------------------------------------------------------
function makeCapturingServer() {
  const registrations = new Map<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>>()
  return {
    server: {
      tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
        registrations.set(name, handler as (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>)
      },
      resource: () => {},
    } as unknown as Parameters<typeof registerTools>[0],
    call: async (name: string, args: Record<string, unknown> = {}) => {
      const handler = registrations.get(name)
      if (!handler) throw new Error(`Tool '${name}' not registered`)
      const result = await handler(args) as { content: Array<{ type: string; text: string }> }
      const text = result.content?.[0]?.text ?? '{}'
      return JSON.parse(text) as Record<string, unknown>
    },
  }
}

describe('Layer B routing stubs — confidence invariants', () => {
  const { server, call } = makeCapturingServer()

  beforeEach(() => {
    registerTools(server, makeMinimalClientManager(), { writeEnabled: false })
  })

  describe('get_input_routing', () => {
    it('returns status not_verifiable_with_current_adapter (never observed or inferred)', async () => {
      const result = await call('get_input_routing', { deviceId: 'test-device' })
      expect(result.status).toBe('not_verifiable_with_current_adapter')
      expect(result.status).not.toBe('observed')
      expect(result.status).not.toBe('inferred')
    })

    it('includes probe instructions', async () => {
      const result = await call('get_input_routing', { deviceId: 'test-device' })
      expect(result.probeSteps ?? result.reason).toBeTruthy()
    })
  })

  describe('validate_avb_routing', () => {
    it('returns status not_verifiable_with_current_adapter (never observed or inferred)', async () => {
      const result = await call('validate_avb_routing', { deviceId: 'test-device' })
      expect(result.status).toBe('not_verifiable_with_current_adapter')
      expect(result.status).not.toBe('observed')
      expect(result.status).not.toBe('inferred')
    })

    it('includes probe instructions', async () => {
      const result = await call('validate_avb_routing', { deviceId: 'test-device' })
      expect(result.probeSteps ?? result.reason).toBeTruthy()
    })
  })
})
