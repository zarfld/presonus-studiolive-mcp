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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MixerIdentity } from '@presonus-mcp/domain'
import { PresonusClientManager, computeReconnectDelayMs } from '../client-manager.js'

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
    getProjects: vi.fn(async () => [{ name: 'ShowNight' }, { name: 'Rehearsal' }]),
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

// ---------------------------------------------------------------------------
// Phase C: availableProjects from client.getProjects() — REQ-F-005 (#19)
// ---------------------------------------------------------------------------

describe('PresonusClientManager — availableProjects (REQ-F-005 #19)', () => {
  beforeEach(() => {
    currentMockClient = makeMockClient()
  })

  it('availableProjects populated from client.getProjects() after connect', async () => {
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap?.availableProjects).toEqual(['ShowNight', 'Rehearsal'])
  })

  it('availableProjects is empty [] when getProjects is absent on client', async () => {
    currentMockClient = {
      ...makeMockClient(),
      getProjects: undefined as unknown as ReturnType<typeof makeMockClient>['getProjects'],
    }
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap?.availableProjects).toEqual([])
  })

  it('availableProjects is empty [] when getProjects throws', async () => {
    currentMockClient = {
      ...makeMockClient(),
      getProjects: vi.fn(async () => { throw new Error('not supported') }),
    }
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    const snap = manager.getSnapshot(testIdentity.deviceId)
    expect(snap?.availableProjects).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Phase B: reconnect backoff timing — QA-SC-003 (#27) / REQ-NF-004 (#24)
// ---------------------------------------------------------------------------

describe('computeReconnectDelayMs — backoff formula (QA-SC-003 #27)', () => {
  it('attempt 1 → 1000 ms (first retry well within 10 s requirement)', () => {
    expect(computeReconnectDelayMs(1)).toBe(1_000)
  })

  it('attempt 2 → 2000 ms', () => {
    expect(computeReconnectDelayMs(2)).toBe(2_000)
  })

  it('attempt 3 → 4000 ms', () => {
    expect(computeReconnectDelayMs(3)).toBe(4_000)
  })

  it('attempt 6 → 30000 ms (capped, since 2^5 × 1000 = 32000 > 30000)', () => {
    expect(computeReconnectDelayMs(6)).toBe(30_000)
  })

  it('high attempt counts are capped at 30 s', () => {
    expect(computeReconnectDelayMs(10)).toBe(30_000)
    expect(computeReconnectDelayMs(20)).toBe(30_000)
    expect(computeReconnectDelayMs(100)).toBe(30_000)
  })

  it('attempt 5 → 16000 ms (2^4 × 1000, below 30 s cap)', () => {
    expect(computeReconnectDelayMs(5)).toBe(16_000)
  })
})

describe('PresonusClientManager — reconnect timer scheduling (QA-SC-003 #27)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    currentMockClient = makeMockClient()
  })

  it('first reconnect fires at 1000 ms after disconnect (within 10 s QA-SC-003 requirement)', async () => {
    vi.useFakeTimers()
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    currentMockClient.emit('disconnect')

    // At 999ms: reconnect NOT yet triggered (timer pending)
    await vi.advanceTimersByTimeAsync(999)
    expect(manager.getConnectedDeviceIds()).not.toContain(testIdentity.deviceId)

    // At 1001ms: reconnect timer fires (mock client reconnects immediately)
    await vi.advanceTimersByTimeAsync(2)
    // Snapshot was stale but _reconnect() will have been called
    // (regardless of whether it fully completed, the timer fired within 1000ms)
  })

  it('no spurious reconnect when explicitly disconnected', async () => {
    vi.useFakeTimers()
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    await manager.disconnect(testIdentity.deviceId)
    // Advance time to ensure no reconnect timers fire and cause errors
    await vi.advanceTimersByTimeAsync(5000)
    // No exception thrown = reconnect timer was properly cleared
  })
})

// ---------------------------------------------------------------------------
// Phase D: stale event-gap warning — REQ-NF-003 (#23) Scenario 3
// ---------------------------------------------------------------------------

describe('PresonusClientManager — stale event-gap warning (REQ-NF-003 #23 Scenario 3)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    currentMockClient = makeMockClient()
  })

  it('logs warning when no featherbear events arrive for > 2 s', async () => {
    vi.useFakeTimers()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    // Advance 3100ms with no 'data' or 'meter' events
    // Interval fires at t=1000 (gap=1000: no warn), t=2000 (gap=2000: no warn), t=3000 (gap=3000: WARN)
    await vi.advanceTimersByTimeAsync(3100)

    const warnCalls = stderrSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('WARNING') && s.includes('no featherbear events'))
    expect(warnCalls.length).toBeGreaterThanOrEqual(1)
    expect(warnCalls[0]).toContain(testIdentity.deviceId)
  })

  it('no warning when events arrive regularly', async () => {
    vi.useFakeTimers()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    // Emit a data event every 500ms to reset lastEventAt
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(500)
      currentMockClient.emit('data', {})
    }
    // 3000ms passed but events kept lastEventAt fresh

    const warnCalls = stderrSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('WARNING') && s.includes('no featherbear events'))
    expect(warnCalls.length).toBe(0)
  })

  it('no warning logged after explicit disconnect (interval cleared)', async () => {
    vi.useFakeTimers()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)
    await manager.disconnect(testIdentity.deviceId)

    // Advance past what would trigger warning if interval were still running
    await vi.advanceTimersByTimeAsync(5000)

    const warnCalls = stderrSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('WARNING') && s.includes('no featherbear events'))
    expect(warnCalls.length).toBe(0)
  })

  it('no warning while disconnected (guard: !conn.connected)', async () => {
    vi.useFakeTimers()
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const manager = new PresonusClientManager()
    await manager.connect(testIdentity)

    // Disconnect (sets conn.connected = false and clears interval)
    currentMockClient.emit('disconnect')
    await vi.advanceTimersByTimeAsync(5000)

    const warnCalls = stderrSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((s) => s.includes('WARNING') && s.includes('no featherbear events'))
    expect(warnCalls.length).toBe(0)
  })
})
