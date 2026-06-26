/**
 * Tests for discoverMixers() — REQ-NF-001 (#21).
 *
 * Verifies:
 *   - REQ-NF-001: discoverMixers completes within configured timeoutMs
 *   - Empty result is valid (no throw) when no mixer is found
 *   - Configurable timeout is respected
 *   - Normalized results parse against domain schemas
 *
 * Uses real (very short) timeouts — no hardware required.
 * Featherbear is mocked to return no devices (simulates empty network).
 * HIL tests (hardware-in-loop) are in discovery.hil.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { discoverMixers, buildDeviceId, normalizeDiscoveredDevice } from '../discovery.js'

// ---------------------------------------------------------------------------
// Mock featherbear Discovery — silent (no devices found)
// ---------------------------------------------------------------------------
vi.mock('@featherbear/presonus-studiolive-api', () => ({
  Discovery: class {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(_event: string, _cb: (...args: any[]) => void) { return this }
    start() {}
    stop() {}
    destroy() {}
  },
}))

describe('discoverMixers — REQ-NF-001: resolves within timeoutMs', () => {
  it('resolves with empty devices list when no mixer responds', async () => {
    const result = await discoverMixers({ timeoutMs: 50 })
    expect(result.devices).toEqual([])
    expect(result.missingConfigured).toEqual([])
  }, 500)

  it('resolves (does not reject) when no mixer is found — empty result is valid', async () => {
    await expect(discoverMixers({ timeoutMs: 50 })).resolves.toHaveProperty('devices')
  }, 500)

  it('respects a short timeoutMs — resolves in approximately that duration', async () => {
    const start = Date.now()
    await discoverMixers({ timeoutMs: 80 })
    const elapsed = Date.now() - start
    // Should complete within 80 ms + 220 ms tolerance (CI may be slower; UDP socket overhead)
    expect(elapsed).toBeLessThan(400)
  }, 500)

  it('result has required shape (devices, missingConfigured, unknownDiscovered)', async () => {
    const result = await discoverMixers({ timeoutMs: 50 })
    expect(result).toHaveProperty('devices')
    expect(result).toHaveProperty('missingConfigured')
    expect(result).toHaveProperty('unknownDiscovered')
    expect(Array.isArray(result.devices)).toBe(true)
  }, 500)
})

describe('buildDeviceId — REQ-F-002: serial-based stable identity', () => {
  it('uses serial: prefix when serial is available', () => {
    expect(buildDeviceId({ name: 'Mixer', serial: 'SD001', ip: '10.0.0.1', port: 53000 }))
      .toBe('serial:SD001')
  })

  it('falls back to ip: prefix when serial is absent', () => {
    expect(buildDeviceId({ name: 'Mixer', ip: '10.0.0.1', port: 53000 }))
      .toBe('ip:10.0.0.1:53000')
  })
})

describe('normalizeDiscoveredDevice — domain type mapping', () => {
  it('maps raw device to MixerIdentity with correct fields', () => {
    const raw = { name: 'StudioLive 32SC', serial: 'SD7E21010066', ip: '192.168.10.50', port: 53000 }
    const identity = normalizeDiscoveredDevice(raw)
    expect(identity.deviceId).toBe('serial:SD7E21010066')
    expect(identity.serial).toBe('SD7E21010066')
    expect(identity.ip).toBe('192.168.10.50')
    expect(identity.port).toBe(53000)
    expect(identity.controllable).toBe(false)
  })
})

