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

const HIL    = process.env.HIL_PRESONUS        === '1'
const HIL_IP = process.env.HIL_PRESONUS_IP
const HIL_SN = process.env.HIL_PRESONUS_SERIAL

/**
 * Build discoverMixers config with optional fallback device.
 * When HIL_PRESONUS_IP is set, the mixer is added to result.devices even
 * when UDP broadcast cannot reach it (e.g. cross-subnet / VLAN).
 * Set env vars before running:
 *   $env:HIL_PRESONUS_IP     = "<mixer-ip>"   # required when UDP fails
 *   $env:HIL_PRESONUS_SERIAL = "<serial>"     # enables serial: prefix assertions
 */
function discoveryConfig(timeoutMs = 5000) {
  return {
    timeoutMs,
    ...(HIL_IP ? {
      fallbackDevices: [{
        alias: 'hil-mixer',
        fallbackIp: HIL_IP,
        fallbackPort: 53000,
        role: 'FOH' as const,
        ...(HIL_SN ? { expectedSerial: HIL_SN } : {}),
      }],
    } : {}),
  }
}

// ─── REQ-NF-001 (#21): Discovery timing ───────────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — REQ-NF-001 (#21): discovery timing', () => {
  it('resolves within 5000 ms (95th-pct discovery time requirement)', async () => {
    const start = Date.now()
    await discoverMixers(discoveryConfig(5000))
    const elapsed = Date.now() - start
    expect(elapsed, `discovery took ${elapsed} ms — must be ≤ 5100 ms`).toBeLessThan(5100)
  }, 7_000)

  it('respects a shorter timeoutMs — resolves within timeoutMs + 200 ms tolerance', async () => {
    const start = Date.now()
    await discoverMixers(discoveryConfig(2000))
    const elapsed = Date.now() - start
    expect(elapsed, `discovery took ${elapsed} ms — must be ≤ 2200 ms`).toBeLessThan(2200)
  }, 5_000)
})

// ─── REQ-F-001 (#15): At least one mixer found ────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — REQ-F-001 (#15): mixer discovered on subnet', () => {
  it('discovers at least one StudioLive III mixer (via UDP or fallback IP)', async () => {
    const result = await discoverMixers(discoveryConfig())
    expect(
      result.devices.length,
      HIL_IP
        ? `No mixer found — is ${HIL_IP} reachable on TCP 53000?`
        : 'No mixer found via UDP broadcast — set HIL_PRESONUS_IP=<ip>',
    ).toBeGreaterThan(0)
  }, 7_000)

  it('result has expected shape (devices, missingConfigured, unknownDiscovered arrays)', async () => {
    const result = await discoverMixers(discoveryConfig())
    expect(Array.isArray(result.devices)).toBe(true)
    expect(Array.isArray(result.missingConfigured)).toBe(true)
    expect(Array.isArray(result.unknownDiscovered)).toBe(true)
  }, 7_000)

  it('discovered device has ip and port 53000 (protocol constraint)', async () => {
    const result = await discoverMixers(discoveryConfig())
    expect(result.devices.length, 'no mixer — cannot test ip/port').toBeGreaterThan(0)
    const device = result.devices[0]!
    expect(device.ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
    expect(device.port).toBe(53000)
  }, 7_000)
})

// ─── REQ-F-002 (#16): Serial-stable identity ──────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — REQ-F-002 (#16): serial-stable deviceId', () => {
  it('deviceId uses serial: prefix when serial is available (REQ-F-002)', async () => {
    const result = await discoverMixers(discoveryConfig())
    expect(result.devices.length, 'no mixer found').toBeGreaterThan(0)
    const device = result.devices[0]!
    if (device.serial) {
      expect(device.deviceId, `got: ${device.deviceId}`).toMatch(/^serial:/)
    } else {
      // No serial from UDP/config — deviceId falls back to alias: prefix
      expect(device.deviceId).toMatch(/^(serial:|alias:|ip:)/)
    }
  }, 7_000)

  it('deviceId === serial:<serial> when serial is present (buildDeviceId contract)', async () => {
    const result = await discoverMixers(discoveryConfig())
    const device = result.devices[0]!
    if (device.serial) {
      expect(device.deviceId).toBe(`serial:${device.serial}`)
    } else {
      console.warn('[HIL] No serial in device — set HIL_PRESONUS_SERIAL for full assertion')
    }
  }, 7_000)

  it('serial matches uppercase alphanumeric format when present', async () => {
    const result = await discoverMixers(discoveryConfig())
    const device = result.devices[0]!
    if (device.serial) {
      expect(device.serial).toMatch(/^[A-Z0-9]+$/)
    } else {
      console.warn('[HIL] No serial — set HIL_PRESONUS_SERIAL for full assertion')
    }
  }, 7_000)
})

// ─── Schema compliance ─────────────────────────────────────────────────────────

describe.skipIf(!HIL)('discoverMixers HIL — MixerIdentitySchema compliance', () => {
  it('every discovered device parses against MixerIdentitySchema without error', async () => {
    const result = await discoverMixers(discoveryConfig())
    for (const device of result.devices) {
      expect(
        () => MixerIdentitySchema.parse(device),
        `device ${device.deviceId} failed MixerIdentitySchema: check required fields`,
      ).not.toThrow()
    }
  }, 7_000)
})
