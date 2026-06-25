/**
 * Hardware-in-Loop (HIL) tests for discoverMixers().
 *
 * Verifies: REQ-F-001 (#15), REQ-F-002 (#16), REQ-NF-001 (#21)
 *
 * Requires a StudioLive III mixer on the local subnet (UDP broadcast).
 * Run: pnpm test:hil   (sets HIL_PRESONUS=1 and uses vitest.hil.config.ts)
 *
 * Design rules:
 *   - Assert STRUCTURAL properties only (format, schema, non-empty counts).
 *     Never assert specific channel names or values — these change between shows.
 *   - Tests skip automatically when HIL_PRESONUS !== '1' (CI-safe).
 *   - Each describe discovers independently so test order does not matter.
 */
import { describe, it, expect } from 'vitest'
import { discoverMixers } from '../discovery.js'
import { MixerIdentitySchema } from '@presonus-mcp/domain'

const HIL = process.env.HIL_PRESONUS === '1'

// ─── REQ-NF-001 (#21): Discovery timing ───────────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — REQ-NF-001 (#21): discovery timing', () => {
  it('resolves within 5000 ms (95th-pct discovery time requirement)', async () => {
    const start = Date.now()
    await discoverMixers({ timeoutMs: 5000 })
    const elapsed = Date.now() - start
    expect(elapsed, `discovery took ${elapsed} ms — must be ≤ 5100 ms`).toBeLessThan(5100)
  }, 7_000)

  it('respects a shorter timeoutMs — resolves within timeoutMs + 200 ms tolerance', async () => {
    const start = Date.now()
    await discoverMixers({ timeoutMs: 2000 })
    const elapsed = Date.now() - start
    expect(elapsed, `discovery took ${elapsed} ms — must be ≤ 2200 ms`).toBeLessThan(2200)
  }, 5_000)
})

// ─── REQ-F-001 (#15): At least one mixer found ────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — REQ-F-001 (#15): mixer discovered on subnet', () => {
  it('discovers at least one StudioLive III mixer', async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    expect(
      result.devices.length,
      'No mixer found — is the StudioLive III powered on and reachable on this subnet?',
    ).toBeGreaterThan(0)
  }, 7_000)

  it('result has expected shape (devices, missingConfigured, unknownDiscovered arrays)', async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    expect(Array.isArray(result.devices)).toBe(true)
    expect(Array.isArray(result.missingConfigured)).toBe(true)
    expect(Array.isArray(result.unknownDiscovered)).toBe(true)
  }, 7_000)

  it('discovered device has ip and port 53000 (protocol constraint)', async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    const device = result.devices[0]!
    expect(device.ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
    expect(device.port).toBe(53000)
  }, 7_000)
})

// ─── REQ-F-002 (#16): Serial-stable identity ──────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — REQ-F-002 (#16): serial-stable deviceId', () => {
  it('deviceId uses serial: prefix — not raw IP (serial-stable identity)', async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    expect(result.devices.length, 'no mixer found').toBeGreaterThan(0)
    const device = result.devices[0]!
    expect(device.deviceId, `got: ${device.deviceId}`).toMatch(/^serial:/)
  }, 7_000)

  it('deviceId is exactly serial: + serial field value (buildDeviceId contract)', async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    const device = result.devices[0]!
    expect(device.serial, 'serial must be non-empty').toBeTruthy()
    expect(device.deviceId).toBe(`serial:${device.serial}`)
  }, 7_000)

  it('serial matches uppercase alphanumeric format (known PreSonus serial format)', async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    const device = result.devices[0]!
    expect(device.serial).toMatch(/^[A-Z0-9]+$/)
  }, 7_000)
})

// ─── Schema compliance ─────────────────────────────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — MixerIdentitySchema compliance', () => {
  it('every discovered device parses against MixerIdentitySchema without error', async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    for (const device of result.devices) {
      expect(
        () => MixerIdentitySchema.parse(device),
        `device ${device.deviceId} failed MixerIdentitySchema: check required fields`,
      ).not.toThrow()
    }
  }, 7_000)
})
