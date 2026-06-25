/**
 * Tests for QA-SC-MCP-001 — MCP resource completeness, freshness, and read-only safety.
 *
 * Verifies: #61 QA-SC-MCP-001
 *   Traces to: #17 (REQ-F-003: channels resource), #18 (REQ-F-004: meters resource),
 *              #19 (REQ-F-005: scene resource), #22 (REQ-NF-002: zero write tools),
 *              #23 (REQ-NF-003: state cache ≤ 1 tick), #24 (REQ-NF-004: server startup)
 *
 * Acceptance criteria (from #61):
 *   1. Channel list: 100% of channels present; names match customName state key — REQ-F-003
 *   2. Scene resource reflects currentProject/currentScene from featherbear client — REQ-F-005
 *   3. Stale flag propagated to resource responses when mixer disconnects — REQ-NF-003
 *   (State cache ≤ 1 tick  → see client-manager.test.ts  "state cache update (REQ-NF-003)")
 *   (Zero write tools      → see tools.test.ts + server.test.ts "REQ-NF-002")
 *   (Server stdio startup  → see server.test.ts "createServer — REQ-NF-004")
 *
 * IEEE 1012-2016 verification — unit test (no hardware required).
 */
import { describe, it, expect } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PresonusClientManager, MixerSnapshot } from '@presonus-mcp/adapter'
import type { MixerIdentity, MixerChannel } from '@presonus-mcp/domain'
import { registerResources } from '../resources.js'

// ---------------------------------------------------------------------------
// Mock MCP server — captures resource handlers without running real transport
// ---------------------------------------------------------------------------

type ResourceHandler = (
  uri: URL,
  variables: Record<string, string>,
) => Promise<{ contents: Array<{ uri: string; text: string; mimeType: string }> }>

function makeMockServer(): { server: McpServer; resources: Map<string, ResourceHandler> } {
  const resources = new Map<string, ResourceHandler>()
  const server = {
    resource: (
      name: string,
      _uriOrTemplate: unknown,
      _meta: unknown,
      handler: ResourceHandler,
    ) => {
      resources.set(name, handler)
    },
  } as unknown as McpServer
  return { server, resources }
}

async function invokeChannelResource(
  resources: Map<string, ResourceHandler>,
  deviceId: string,
): Promise<{ channels: MixerChannel[] } & Record<string, unknown>> {
  const handler = resources.get('mixer-channels')
  if (!handler) throw new Error("Resource 'mixer-channels' not registered")
  const result = await handler(
    new URL(`presonus://mixer/${deviceId}/channels`),
    { deviceId },
  )
  return JSON.parse(result.contents[0]!.text) as { channels: MixerChannel[] } & Record<string, unknown>
}

async function invokeSceneResource(
  resources: Map<string, ResourceHandler>,
  deviceId: string,
): Promise<Record<string, unknown>> {
  const handler = resources.get('mixer-scene-current')
  if (!handler) throw new Error("Resource 'mixer-scene-current' not registered")
  const result = await handler(
    new URL(`presonus://mixer/${deviceId}/scene/current`),
    { deviceId },
  )
  return JSON.parse(result.contents[0]!.text) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

const DEVICE_ID = 'serial:QA001'

const mockIdentity: MixerIdentity = {
  deviceId: DEVICE_ID,
  serial: 'QA001',
  ip: '192.168.10.50',
  port: 53000,
  lastSeen: new Date().toISOString(),
  role: 'FOH',
  controllable: false,
  confidence: 'observed',
}

/**
 * Build a 32-channel list with names matching the `line.chN.username` key format.
 * In production these names come from the state mapper reading the featherbear state.
 * In this test they are injected directly into the snapshot.
 */
function make32ChannelList(): MixerChannel[] {
  return Array.from({ length: 32 }, (_, i) => ({
    id: `line.ch${i + 1}`,
    selector: { type: 'LINE' as const, channel: i + 1 },
    name: `Ch${i + 1}Custom`,  // simulates resolved username from global.line.ch*.customName
  }))
}

function makeSnapshot(overrides: Partial<MixerSnapshot> = {}): MixerSnapshot {
  return {
    identity: mockIdentity,
    channels: make32ChannelList(),
    currentProject: 'ShowNight',
    currentScene: 'Soundcheck',
    availableProjects: ['ShowNight', 'Rehearsal'],
    capturedAt: new Date().toISOString(),
    rawState: {},
    flatState: {},
    isStale: false,
    disconnectedAt: undefined,
    outputPatch: undefined,
    ...overrides,
  }
}

function makeMockManager(snapshot: MixerSnapshot | undefined = makeSnapshot()): PresonusClientManager {
  return {
    getConnectedDeviceIds: () => (snapshot ? [DEVICE_ID] : []),
    getIdentity: (id: string) => (id === DEVICE_ID ? snapshot?.identity : undefined),
    getSnapshot: (id: string) => (id === DEVICE_ID ? snapshot : undefined),
    getSummarizer: () => undefined,
    setAllWriteEnabled: () => {},
    connect: async () => {},
    disconnect: async () => {},
  } as unknown as PresonusClientManager
}

// ---------------------------------------------------------------------------
// REQ-F-003 (#17): Channel resource completeness
// ---------------------------------------------------------------------------

describe('QA-SC-MCP-001 criterion 1 — channels resource completeness (REQ-F-003 #17)', () => {
  /**
   * Verifies: #17 REQ-F-003, #61 QA-SC-MCP-001
   * Given: 32-channel mixer snapshot where every channel has a custom name
   * When: AI agent reads presonus://mixer/{id}/channels
   * Then: response contains exactly 32 channels with names matching line.chN.username
   */
  it('returns all 32 channels with correct custom names (100% completeness)', async () => {
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager())

    const body = await invokeChannelResource(resources, DEVICE_ID)

    // All 32 channels must be present
    expect(body.channels).toHaveLength(32)

    // Every channel name must match the custom name set in the snapshot
    for (let i = 0; i < 32; i++) {
      expect(body.channels[i]!.name).toBe(`Ch${i + 1}Custom`)
    }
  })

  it('channel ids follow line.chN pattern (correct featherbear key mapping)', async () => {
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager())

    const body = await invokeChannelResource(resources, DEVICE_ID)

    for (let i = 0; i < 32; i++) {
      expect(body.channels[i]!.id).toBe(`line.ch${i + 1}`)
    }
  })

  it('returns empty channel list when no snapshot exists for the requested deviceId', async () => {
    // Simulates a request before the mixer has connected
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(undefined))

    const body = await invokeChannelResource(resources, DEVICE_ID)

    expect(body.channels).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// REQ-F-005 (#19): Scene resource
// ---------------------------------------------------------------------------

describe('QA-SC-MCP-001 criterion 2 — scene resource (REQ-F-005 #19)', () => {
  /**
   * Verifies: #19 REQ-F-005, #61 QA-SC-MCP-001
   * Given: mixer snapshot with currentProject='ShowNight', currentScene='Soundcheck'
   * When: AI agent reads presonus://mixer/{id}/scene/current
   * Then: response contains currentProject and currentScene reflecting featherbear client props
   */
  it('returns currentProject and currentScene from snapshot', async () => {
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager())

    const body = await invokeSceneResource(resources, DEVICE_ID)

    expect(body.currentProject).toBe('ShowNight')
    expect(body.currentScene).toBe('Soundcheck')
  })

  it('returns null fields when no snapshot exists for the requested deviceId', async () => {
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(undefined))

    const body = await invokeSceneResource(resources, DEVICE_ID)

    expect(body.currentProject).toBeNull()
    expect(body.currentScene).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// REQ-NF-003 (#23): Stale state propagation in resource responses
// ---------------------------------------------------------------------------

describe('QA-SC-MCP-001 criterion 3 — stale metadata propagation (REQ-NF-003 #23)', () => {
  /**
   * Verifies: #23 REQ-NF-003 (state cache freshness), #61 QA-SC-MCP-001
   * Given: snapshot with isStale=true (mixer disconnected, state preserved but potentially old)
   * When: AI agent reads presonus://mixer/{id}/channels
   * Then: _stale:true present in response — agent can warn the user that state may be outdated
   */
  it('channels resource includes _stale:true when snapshot isStale', async () => {
    const staleSnapshot = makeSnapshot({
      isStale: true,
      disconnectedAt: new Date().toISOString(),
    })
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(staleSnapshot))

    const body = await invokeChannelResource(resources, DEVICE_ID)

    expect(body._stale).toBe(true)
    expect(body._disconnectedAt).toBeDefined()
    expect(typeof body._disconnectedAt).toBe('string')
  })

  it('channels resource does NOT include _stale when snapshot is fresh', async () => {
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager())  // isStale defaults to false

    const body = await invokeChannelResource(resources, DEVICE_ID)

    expect(body._stale).toBeUndefined()
    expect(body._disconnectedAt).toBeUndefined()
  })

  it('scene resource also includes _stale:true when snapshot isStale', async () => {
    const staleSnapshot = makeSnapshot({ isStale: true, disconnectedAt: new Date().toISOString() })
    const { server, resources } = makeMockServer()
    registerResources(server, makeMockManager(staleSnapshot))

    const body = await invokeSceneResource(resources, DEVICE_ID)

    expect(body._stale).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cross-references — criteria already covered by existing tests
// ---------------------------------------------------------------------------
// REQ-NF-002 (#22): Zero write tools registered in default config
//   → packages/presonus-mcp-server/src/__tests__/tools.test.ts
//   → packages/presonus-mcp-server/src/__tests__/server.test.ts
//     (describe 'computeWriteEnabled — REQ-NF-002 (#22) / QA-SC-002 (#26)')
//
// REQ-NF-003 (#23): State cache update ≤ 1 event loop tick
//   → packages/presonus-adapter/src/__tests__/client-manager.test.ts
//     (describe 'PresonusClientManager — state cache update (REQ-NF-003)')
//
// REQ-NF-004 (#24): MCP server stdio-ready within 5 s
//   → packages/presonus-mcp-server/src/__tests__/server.test.ts
//     (describe 'createServer — REQ-NF-004 (#24): startup within 5 s')
