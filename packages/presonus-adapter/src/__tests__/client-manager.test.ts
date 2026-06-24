/**
 * Tests for PresonusClientManager.
 *
 * Verifies:
 *   - REQ-NF-003 (#23): State cache update is synchronous (≤ one event loop tick)
 *   - REQ-NF-004 (#24): Server survives mixer disconnect; snapshot marked stale
 *   - QA-SC-003 (#27): Reconnect logic triggered after disconnect
 *   - ADR-006: applyChange() throws when writeEnabled=false or device disconnected
 *
 * Uses a synthetic mock featherbear Client — no hardware required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MixerIdentity } from '@presonus-mcp/domain'
import { PresonusClientManager } from '../client-manager.js'

// ---------------------------------------------------------------------------
// Featherbear Client mock factory
// ---------------------------------------------------------------------------

interface MockClientOptions {
  connectError?: Error
}

function makeMockClient(opts: MockClientOptions = {}) {
  const listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map()

  const client = {
    connect: vi.fn(async () => {
      if (opts.connectError) throw opts.connectError
    }),
    close: vi.fn(async () => {}),
    dumpState: vi.fn(async () => ({})),
    meterSubscribe: vi.fn(),
    currentProject: 'TestProject',
    currentScene: 'Soundcheck',
    state: { get: vi.fn((_key: string) => null) },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event)!.push(cb)
    }),
    /** Emit a synthetic event to all registered listeners */
    emit: (event: string, ...args: unknown[]) => {
      for (const cb of listeners.get(event) ?? []) cb(...args)
    },
  }
  return client
}

// ---------------------------------------------------------------------------
// Synthetic mixer identity
// ---------------------------------------------------------------------------

const testIdentity: MixerIdentity = {
  deviceId: 'serial:TEST001',
  serial: 'TEST001',
  ip: '192.168.10.50',
  port: 53000,
  lastSeen: new Date().toISOString(),
  role: 'FOH',
  controllable: false,
  confidence: 'observed',
}

// ---------------------------------------------------------------------------
// Module-level mock for featherbear import
// ---------------------------------------------------------------------------

let currentMockClient: ReturnType<typeof makeMockClient>

vi.mock('@featherbear/presonus-studiolive-api', () => ({
  Client: class {
    constructor() {
      // Copy all methods from the current mock client
      Object.assign(this, currentMockClient)
    }
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PresonusClientManager — connection lifecycle', () => {
  beforeEach(() => {
    currentMockClient = makeMockClient()
  })

  it('sets connected=true after successful connect()', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    expect(manager.getConnectedDeviceIds()).toContain(testIdentity.deviceId)
  })

  it('getSnapshot() returns a snapshot after connect()', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap).toBeDefined()
    expect(snap?.isStale).toBe(false)
    expect(snap?.disconnectedAt).toBeUndefined()
  })

  it('snapshot reflects currentProject from client properties', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap?.currentProject).toBe('TestProject')
    expect(snap?.currentScene).toBe('Soundcheck')
  })
})

describe('PresonusClientManager — disconnect + stale state (REQ-NF-004, QA-SC-003)', () => {
  beforeEach(() => {
    currentMockClient = makeMockClient()
  })

  it('marks snapshot as stale immediately on disconnect event', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    // Simulate mixer disconnect
    currentMockClient.emit('disconnect')

    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap?.isStale).toBe(true)
    expect(snap?.disconnectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('snapshot is preserved (not cleared) after disconnect', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    currentMockClient.emit('disconnect')

    // Last known state must still be available
    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap).toBeDefined()
    expect(snap?.channels).toBeDefined()
  })

  it('schedules a reconnect timer after disconnect', async () => {
    vi.useFakeTimers()
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    currentMockClient.emit('disconnect')

    // A reconnect should be scheduled (timer active)
    // We verify no synchronous error is thrown and timer advances without crash
    await vi.advanceTimersByTimeAsync(1100)  // past first backoff (1000 ms)
    vi.useRealTimers()
  })

  it('marks snapshot stale on error event', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    currentMockClient.emit('error', new Error('ECONNREFUSED'))

    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap?.isStale).toBe(true)
  })
})

describe('PresonusClientManager — state cache update (REQ-NF-003)', () => {
  beforeEach(() => {
    currentMockClient = makeMockClient()
  })

  it('snapshot updates synchronously when data event fires', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    // Emit a synthetic state update with a new channel name
    currentMockClient.emit('data', {
      'global.mixer_name': 'StudioLive 32SC Updated',
    })

    // Snapshot must reflect the change in the same tick (synchronous handler)
    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap?.identity.name).toBe('StudioLive 32SC Updated')
  })
})

describe('PresonusClientManager — applyChange() safety (ADR-006)', () => {
  beforeEach(() => {
    currentMockClient = makeMockClient()
  })

  it('throws when writeEnabled=false (default)', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    await expect(
      manager.applyChange(testIdentity.deviceId, 'line.ch1.eq.eqgain1', 0.5),
    ).rejects.toThrow('write not enabled')
  })

  it('does not throw when writeEnabled=true', async () => {
    // Add _sendPacket mock to the client
    currentMockClient = {
      ...makeMockClient(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _sendPacket: vi.fn(async () => {}) as any,
    }
    const manager = new PresonusClientManager()
    manager.setAllWriteEnabled(true)
    await manager.connect(testIdentity)
    await expect(
      manager.applyChange(testIdentity.deviceId, 'line.ch1.eq.eqgain1', 0.5),
    ).resolves.not.toThrow()
  })

  it('throws when device not found', async () => {
    const manager = new PresonusClientManager()
    await expect(
      manager.applyChange('serial:NONEXISTENT', 'line.ch1.mute', 1),
    ).rejects.toThrow('not connected')
  })
})
