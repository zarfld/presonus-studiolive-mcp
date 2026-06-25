/**
 * Tests for mixer-graph resource (Phase 8).
 *
 * Verifies: REQ-F-GRAPH-001 — presonus://mixer-graph/current aggregates
 * topology across all discovered mixers in one resource read.
 *
 * TDD: RED phase — written BEFORE the resource is registered.
 *
 * The resource should return:
 * {
 *   capturedAt: string
 *   mixers: [
 *     {
 *       deviceId, role, model, serial,
 *       channelCount, outputPatchConfidence,
 *       routing: { auxMixCount, observedRouteCount }
 *     }
 *   ]
 * }
 */
import { describe, it, expect } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PresonusClientManager, MixerSnapshot } from '@presonus-mcp/adapter'
import type { MixerIdentity, MixerCapabilities } from '@presonus-mcp/domain'
import { registerResources } from '../resources.js'

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

type ResourceHandler = (uri: URL, variables: Record<string, string>) => Promise<{
  contents: Array<{ uri: string; text: string; mimeType: string }>
}>

function makeMockServer(): { server: McpServer; resources: Map<string, ResourceHandler> } {
  const resources = new Map<string, ResourceHandler>()
  const server = {
    resource: (name: string, _uriOrTemplate: unknown, _meta: unknown, handler: ResourceHandler) => {
      resources.set(name, handler)
    },
  } as unknown as McpServer
  return { server, resources }
}

async function fetchResource(resources: Map<string, ResourceHandler>, name: string): Promise<Record<string, unknown>> {
  const handler = resources.get(name)
  if (!handler) throw new Error(`Resource '${name}' not registered`)
  const result = await handler(new URL('presonus://mixer-graph/current'), {})
  return JSON.parse(result.contents[0]!.text) as Record<string, unknown>
}

const DEVICE_ID = 'serial:TEST'

const mockIdentity: MixerIdentity = {
  deviceId: DEVICE_ID, serial: 'TEST-001', ip: '192.168.1.100', port: 53000,
  lastSeen: new Date().toISOString(), role: 'FOH', controllable: false, confidence: 'observed',
}

const mockCaps: MixerCapabilities = {
  lineInputs: 32, auxMixes: 16, subgroups: 4, fxBuses: 4,
  mainOutputs: true, fatChannel: true, avbStagebox: true,
}

function makeSnapshot(overrides: Partial<MixerSnapshot> = {}): MixerSnapshot {
  return {
    identity: mockIdentity,
    channels: [
      { id: 'line.ch1', name: 'Kick', type: 'LINE', mute: false, solo: false, pan: 0.5,
        color: undefined, linked: false, fader: { linear: 0.75, dB: -3, raw: 0.75 },
        sendRouting: undefined, fatChannel: undefined },
    ],
    currentProject: undefined, currentScene: undefined, availableProjects: [],
    capturedAt: new Date().toISOString(), rawState: {}, flatState: {},
    isStale: false, disconnectedAt: undefined, outputPatch: undefined,
    ...overrides,
  }
}

function makeMockManager(snapshots: Map<string, MixerSnapshot> = new Map()): PresonusClientManager {
  return {
    getSnapshot: (deviceId: string) => snapshots.get(deviceId),
    getCapabilities: (_deviceId: string) => mockCaps,
    getIdentity: (deviceId: string) => snapshots.get(deviceId)?.identity,
    getConnectedDeviceIds: () => [...snapshots.keys()],
    getSummarizer: () => undefined,
  } as unknown as PresonusClientManager
}

// ---------------------------------------------------------------------------
// presonus://mixer-graph/current (REQ-F-GRAPH-001)
// ---------------------------------------------------------------------------

describe('presonus://mixer-graph/current (REQ-F-GRAPH-001)', () => {
  it('is registered as a resource (static URI)', () => {
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager())
    expect(resources.has('mixer-graph')).toBe(true)
  })

  it('returns capturedAt as an ISO timestamp', async () => {
    const snapshots = new Map([[DEVICE_ID, makeSnapshot()]])
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(snapshots))
    const data = await fetchResource(resources, 'mixer-graph')
    const { capturedAt } = data as { capturedAt: string }
    expect(() => new Date(capturedAt)).not.toThrow()
    expect(new Date(capturedAt).getFullYear()).toBeGreaterThanOrEqual(2024)
  })

  it('returns a mixers array with one entry per connected mixer', async () => {
    const snapshots = new Map([[DEVICE_ID, makeSnapshot()]])
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(snapshots))
    const data = await fetchResource(resources, 'mixer-graph')
    const mixers = data.mixers as unknown[]
    expect(mixers).toHaveLength(1)
  })

  it('returns an empty mixers array when no mixers are connected', async () => {
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(new Map()))
    const data = await fetchResource(resources, 'mixer-graph')
    expect(data.mixers).toHaveLength(0)
  })

  it('includes deviceId, role, and channelCount for each mixer', async () => {
    const snapshots = new Map([[DEVICE_ID, makeSnapshot()]])
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(snapshots))
    const data = await fetchResource(resources, 'mixer-graph')
    const mixer = (data.mixers as Array<Record<string, unknown>>)[0]!
    expect(mixer.deviceId).toBe(DEVICE_ID)
    expect(mixer.role).toBe('FOH')
    expect(typeof mixer.channelCount).toBe('number')
    expect(mixer.channelCount).toBe(1)  // our makeSnapshot has 1 channel
  })

  it('includes routing summary with auxMixCount', async () => {
    const snapshots = new Map([[DEVICE_ID, makeSnapshot()]])
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(snapshots))
    const data = await fetchResource(resources, 'mixer-graph')
    const mixer = (data.mixers as Array<Record<string, unknown>>)[0]!
    const routing = mixer.routing as Record<string, unknown>
    expect(routing).toBeDefined()
    expect(typeof routing.auxMixCount).toBe('number')
  })

  it('includes outputPatchConfidence annotation', async () => {
    const snapshots = new Map([[DEVICE_ID, makeSnapshot()]])
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(snapshots))
    const data = await fetchResource(resources, 'mixer-graph')
    const mixer = (data.mixers as Array<Record<string, unknown>>)[0]!
    expect(typeof mixer.outputPatchConfidence).toBe('string')
  })

  it('aggregates two mixers when two devices are connected', async () => {
    const DEVICE_2 = 'serial:STAGEBOX'
    const identity2: MixerIdentity = { ...mockIdentity, deviceId: DEVICE_2, serial: 'SB-001', role: 'STAGEBOX' }
    const snapshots = new Map([
      [DEVICE_ID, makeSnapshot()],
      [DEVICE_2, makeSnapshot({ identity: identity2 })],
    ])
    const mgr: PresonusClientManager = {
      getSnapshot: (deviceId: string) => snapshots.get(deviceId),
      getCapabilities: () => mockCaps,
      getIdentity: (deviceId: string) => snapshots.get(deviceId)?.identity,
      getConnectedDeviceIds: () => [DEVICE_ID, DEVICE_2],
      getSummarizer: () => undefined,
    } as unknown as PresonusClientManager
    const { server, resources } = makeMockServer()
    registerResources(server, mgr)
    const data = await fetchResource(resources, 'mixer-graph')
    expect((data.mixers as unknown[]).length).toBe(2)
  })
})
