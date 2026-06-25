/**
 * Tests for routing probe tools (Phase 7).
 *
 * Verifies: REQ-F-PROBE-001 — start_routing_probe initiates a baseline capture
 * Verifies: REQ-F-PROBE-002 — complete_routing_probe diffs snapshots and upgrades confidence
 *
 * TDD: RED phase — written BEFORE start_routing_probe / complete_routing_probe are implemented.
 *
 * Design:
 *   start_routing_probe(deviceId, kind) →
 *     captures current flatState as baseline
 *     returns { probeId, instruction, kind, capturedAt }
 *
 *   complete_routing_probe(deviceId, probeId) →
 *     diffs current flatState against baseline using kind-specific key patterns
 *     returns { probeId, kind, changedKeys[], summary, note }
 *     confidence for matched keys upgrades to 'observed'
 */
import { describe, it, expect } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PresonusClientManager, MixerSnapshot } from '@presonus-mcp/adapter'
import type { MixerIdentity, MixerCapabilities } from '@presonus-mcp/domain'
import { registerTools } from '../tools.js'

// ---------------------------------------------------------------------------
// Test infrastructure (shared with tools-behavioral.test.ts)
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

function makeMockServer(): { server: McpServer; tools: Map<string, ToolHandler> } {
  const tools = new Map<string, ToolHandler>()
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler)
    },
  } as unknown as McpServer
  return { server, tools }
}

async function callTool(tools: Map<string, ToolHandler>, name: string, args: Record<string, unknown>) {
  const handler = tools.get(name)
  if (!handler) throw new Error(`Tool '${name}' not registered`)
  return handler(args)
}

function body(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>
}

const DEVICE_ID = 'serial:TEST'

const mockCaps: MixerCapabilities = {
  lineInputs: 32, auxMixes: 16, subgroups: 4, fxBuses: 4,
  mainOutputs: true, fatChannel: true, avbStagebox: true,
}

/** Build a snapshot with the given flatState. */
function makeSnapshot(flatState: Record<string, unknown> = {}): MixerSnapshot {
  const mockIdentity: MixerIdentity = {
    deviceId: DEVICE_ID, serial: 'TEST', ip: '192.168.1.1', port: 53000,
    lastSeen: new Date().toISOString(), role: 'FOH', controllable: false, confidence: 'observed',
  }
  return {
    identity: mockIdentity, channels: [], currentProject: undefined,
    currentScene: undefined, availableProjects: [],
    capturedAt: new Date().toISOString(), rawState: {}, flatState,
    isStale: false, disconnectedAt: undefined, outputPatch: undefined,
  }
}

/** Build a mock manager. The snapshot can be a single object or a factory
 *  that returns different snapshots on successive calls (simulating state change). */
function makeMockManager(snapshotOrFactory: MixerSnapshot | undefined | (() => MixerSnapshot | undefined)): PresonusClientManager {
  return {
    getSnapshot: (_deviceId: string) =>
      typeof snapshotOrFactory === 'function' ? snapshotOrFactory() : snapshotOrFactory,
    getCapabilities: (_deviceId: string) => mockCaps,
    getIdentity: (_deviceId: string) => ({
      deviceId: DEVICE_ID, serial: 'TEST', ip: '192.168.1.1', port: 53000,
      lastSeen: new Date().toISOString(), role: 'FOH', controllable: false, confidence: 'observed',
    } as MixerIdentity),
    getConnectedDeviceIds: () => [DEVICE_ID],
    getSummarizer: () => undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
    applyChange: async () => undefined,
  } as unknown as PresonusClientManager
}

// ---------------------------------------------------------------------------
// Phase 7: start_routing_probe (REQ-F-PROBE-001)
// ---------------------------------------------------------------------------

describe('start_routing_probe (REQ-F-PROBE-001)', () => {
  it('is registered as a read-only tool (always available)', () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    expect(tools.has('start_routing_probe')).toBe(true)
  })

  it('returns a probeId (UUID) and an operator instruction', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: DEVICE_ID, kind: 'input-source',
    })
    const data = body(result)
    expect(result.isError).toBeFalsy()
    expect(data.probeId).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof data.instruction).toBe('string')
    expect(String(data.instruction).length).toBeGreaterThan(10)
  })

  it('echoes back the requested kind', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: DEVICE_ID, kind: 'avb-stream',
    })
    expect(body(result).kind).toBe('avb-stream')
  })

  it('returns capturedAt ISO timestamp', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: DEVICE_ID, kind: 'input-source',
    })
    const { capturedAt } = body(result) as { capturedAt: string }
    expect(() => new Date(capturedAt)).not.toThrow()
    expect(new Date(capturedAt).getFullYear()).toBeGreaterThanOrEqual(2024)
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: DEVICE_ID, kind: 'input-source',
    })
    expect(result.isError).toBe(true)
  })

  it('accepts all valid kind values', async () => {
    const kinds = ['input-source', 'avb-stream', 'output-patch', 'stagebox'] as const
    for (const kind of kinds) {
      const { server, tools } = makeMockServer()
      registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
      const result = await callTool(tools, 'start_routing_probe', { deviceId: DEVICE_ID, kind })
      expect(result.isError).toBeFalsy()
      expect(body(result).kind).toBe(kind)
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 7: complete_routing_probe (REQ-F-PROBE-002)
// ---------------------------------------------------------------------------

describe('complete_routing_probe (REQ-F-PROBE-002)', () => {
  it('is registered as a read-only tool (always available)', () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    expect(tools.has('complete_routing_probe')).toBe(true)
  })

  it('returns error for an unknown probeId', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    const result = await callTool(tools, 'complete_routing_probe', {
      deviceId: DEVICE_ID,
      probeId: '00000000-0000-0000-0000-000000000000',
    })
    expect(result.isError).toBe(true)
    expect(String(body(result).error)).toMatch(/not found|unknown|expired/i)
  })

  it('returns changedKeys=[] when flatState has not changed between probe snapshots', async () => {
    const stableFlat = { 'line.ch1.aux1': 0.75, 'global.mixer_name': 'StudioLive 32SC' }
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot(stableFlat)), { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', { deviceId: DEVICE_ID, kind: 'input-source' })
    const { probeId } = body(startResult) as { probeId: string }

    const completeResult = await callTool(tools, 'complete_routing_probe', { deviceId: DEVICE_ID, probeId })
    const data = body(completeResult)
    expect(completeResult.isError).toBeFalsy()
    expect(data.probeId).toBe(probeId)
    expect(data.changedKeys).toHaveLength(0)
  })

  it('reports changed keys when flatState differs between start and complete', async () => {
    // Simulate state change: before has source=0, after has source=5 on an input routing key
    const beforeFlat: Record<string, unknown> = { 'outputpatchrouter.mix1_src.value': 0 }
    const afterFlat:  Record<string, unknown> = { 'outputpatchrouter.mix1_src.value': 5 }

    let callCount = 0
    const factory = () => makeSnapshot(callCount++ === 0 ? beforeFlat : afterFlat)

    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(factory), { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', { deviceId: DEVICE_ID, kind: 'output-patch' })
    const { probeId } = body(startResult) as { probeId: string }

    const completeResult = await callTool(tools, 'complete_routing_probe', { deviceId: DEVICE_ID, probeId })
    const data = body(completeResult)
    const changedKeys = data.changedKeys as Array<{ key: string; before: unknown; after: unknown }>
    expect(changedKeys.length).toBeGreaterThan(0)
    const patchKey = changedKeys.find((k) => k.key.includes('mix1_src'))
    expect(patchKey).toBeDefined()
    expect(patchKey!.before).toBe(0)
    expect(patchKey!.after).toBe(5)
  })

  it('echoes the probeId and kind in the complete result', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', { deviceId: DEVICE_ID, kind: 'stagebox' })
    const { probeId } = body(startResult) as { probeId: string }

    const completeResult = await callTool(tools, 'complete_routing_probe', { deviceId: DEVICE_ID, probeId })
    const data = body(completeResult)
    expect(data.probeId).toBe(probeId)
    expect(data.kind).toBe('stagebox')
  })

  it('returns error when device is not connected during complete', async () => {
    // Start succeeds, then device goes away
    let connected = true
    const factory = () => connected ? makeSnapshot() : undefined
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(factory), { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', { deviceId: DEVICE_ID, kind: 'input-source' })
    const { probeId } = body(startResult) as { probeId: string }

    connected = false  // simulate disconnect
    const completeResult = await callTool(tools, 'complete_routing_probe', { deviceId: DEVICE_ID, probeId })
    expect(completeResult.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 7: tool count assertions updated for 2 new probe tools
// ---------------------------------------------------------------------------

describe('tool count — Phase 7 probe tools included', () => {
  it('registers start_routing_probe as a read-only tool', () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    expect(tools.has('start_routing_probe')).toBe(true)
  })

  it('registers complete_routing_probe as a read-only tool', () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(makeSnapshot()), { writeEnabled: false })
    expect(tools.has('complete_routing_probe')).toBe(true)
  })
})
