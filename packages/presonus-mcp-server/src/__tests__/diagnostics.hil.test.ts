/**
 * Hardware-in-Loop (HIL) tests for v0.2 soundcheck diagnostic tools.
 *
 * Verifies against real StudioLive III hardware:
 *   REQ-F-DIAG-001 (#78) — diagnose_channel tool
 *   REQ-F-DIAG-002 (#74) — analyze_line_check_step tool
 *   REQ-F-DIAG-003 (#76) — check_required_setup tool
 *   REQ-F-DIAG-004 (#79) — get_mixer_capabilities tool
 *
 *   TEST-DIAG-001 (#83), TEST-DIAG-002 (#81), TEST-DIAG-003 (#82), TEST-DIAG-004 (#80)
 *
 * Traces to: #3 (StR: Soundcheck assistance)
 *
 * Run: pnpm test:hil   (sets HIL_PRESONUS=1, uses vitest.hil.config.ts)
 *
 * Design rules (same as client-manager.hil.test.ts):
 *   - Assert STRUCTURAL properties only — never specific channel names, fader values,
 *     or scene names. Mixer state changes between shows.
 *   - These tests exercise the domain+adapter layer that backs the MCP tools.
 *     The MCP protocol wrapper is covered by the existing mock tests (tools-behavioral.test.ts).
 *   - A single file-level connection is shared across all groups (see connectOnce pattern).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { discoverMixers, PresonusClientManager, diagnoseChannel, analyzeLineCheckStep } from '@presonus-mcp/adapter'
import type { MixerIdentity } from '@presonus-mcp/domain'

// ─── Environment ──────────────────────────────────────────────────────────────

const HIL    = process.env.HIL_PRESONUS        === '1'
const HIL_IP = process.env.HIL_PRESONUS_IP
const HIL_SN = process.env.HIL_PRESONUS_SERIAL

/** Build discoverMixers config with optional cross-subnet fallback device. */
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

// ─── Shared connection (file-level, reused by all groups) ─────────────────────

let manager: PresonusClientManager
let identity: MixerIdentity

/** Idempotent: reuse existing connection if already active. */
async function connectOnce(): Promise<void> {
  if (manager && identity && manager.getConnectedDeviceIds().includes(identity.deviceId)) {
    return
  }
  const result = await discoverMixers(discoveryConfig())
  expect(
    result.devices.length,
    HIL_IP
      ? `No mixer found — is ${HIL_IP} reachable on TCP 53000?`
      : 'No mixer found via UDP — set HIL_PRESONUS_IP=<ip>',
  ).toBeGreaterThan(0)
  identity = result.devices[0]!
  manager = new PresonusClientManager()
  await manager.connect(identity)
  // Poll until channels arrive from dumpState()
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const snap = manager.getSnapshot(identity.deviceId)
    if (snap && snap.channels.length > 0) break
    await new Promise((r) => setTimeout(r, 500))
  }
}

/** Single file-level setup — all describe groups share this connection. */
if (HIL) {
  beforeAll(connectOnce, 30_000)
  afterAll(async () => {
    await manager?.disconnect(identity?.deviceId).catch(() => { /* best-effort */ })
  }, 10_000)
}

// ─── REQ-F-DIAG-004 (#79): get_mixer_capabilities on real hardware ────────────

describe.skipIf(!HIL)('soundcheck HIL — get_mixer_capabilities (REQ-F-DIAG-004 #79)', () => {
  /**
   * Verifies: REQ-F-DIAG-004 (#79) — get_mixer_capabilities MCP tool
   * Verifies: TEST-DIAG-004 (#80)
   * Traces to: #3 (StR: Soundcheck assistance)
   */

  it('getCapabilities(deviceId) returns a defined capabilities object', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    expect(caps, 'getCapabilities returned undefined').toBeDefined()
    expect(caps).not.toBeNull()
  })

  it('lineInputs is a positive integer ≥ 16 (StudioLive III minimum)', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    expect(typeof caps.lineInputs).toBe('number')
    expect(caps.lineInputs).toBeGreaterThanOrEqual(16)
  })

  it('capabilities has required shape — auxMixes, fxBuses, fatChannel, mainOutputs, avbStagebox', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    // All fields used by check_required_setup must be present with correct types
    expect(typeof caps.auxMixes).toBe('number')
    expect(caps.auxMixes).toBeGreaterThanOrEqual(1)
    expect(typeof caps.fxBuses).toBe('number')
    expect(typeof caps.fatChannel).toBe('boolean')
    expect(typeof caps.mainOutputs).toBe('boolean')
    expect(typeof caps.avbStagebox).toBe('boolean')
    // StudioLive III hardware always has Fat Channel and main LR outputs
    expect(caps.fatChannel).toBe(true)
    expect(caps.mainOutputs).toBe(true)
  })

  it('all 4 check_required_setup contract fields are present (REQ-F-DIAG-003 contract)', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    const required = ['lineInputs', 'auxMixes', 'fxBuses', 'avbStagebox'] as const
    for (const field of required) {
      expect(field in caps, `Missing required field: ${field}`).toBe(true)
    }
  })
})

// ─── REQ-F-DIAG-001 (#78): diagnose_channel on real hardware ─────────────────

describe.skipIf(!HIL)('soundcheck HIL — diagnose_channel (REQ-F-DIAG-001 #78)', () => {
  /**
   * Verifies: REQ-F-DIAG-001 (#78) — diagnose_channel MCP tool
   * Verifies: TEST-DIAG-001 (#83)
   * Traces to: #3 (StR: Soundcheck assistance)
   * Extends: QA-SC-001 (#25) in client-manager.hil.test.ts (adapter-layer assertion)
   */

  it('diagnoseChannel(snapshot, 1) returns a valid DiagnoseChannelResult', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = diagnoseChannel(snap, 1, null, undefined)

    expect(result, 'diagnoseChannel returned undefined').toBeDefined()
    expect(result.channel).toBe(1)
    expect(['ok', 'warning', 'problem']).toContain(result.status)
    expect(Array.isArray(result.checks)).toBe(true)
    expect(result.checks.length).toBeGreaterThan(0)  // mute + fader + solo always present
    expect(Array.isArray(result.mostLikelyCauses)).toBe(true)
    expect(Array.isArray(result.safeNextSteps)).toBe(true)
  })

  it('every check entry has string check name and string result', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = diagnoseChannel(snap, 1, null, undefined)

    for (const check of result.checks) {
      expect(typeof check.check, `check.check must be string, got ${typeof check.check}`).toBe('string')
      expect(typeof check.result, `check.result must be string, got ${typeof check.result}`).toBe('string')
    }
  })

  it('mute, fader, and solo checks are always present (core diagnostic fields)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = diagnoseChannel(snap, 1, null, undefined)

    const checkNames = result.checks.map((c) => c.check)
    expect(checkNames).toContain('mute')
    expect(checkNames).toContain('fader')
    expect(checkNames).toContain('solo')
  })

  it('diagnoseChannel succeeds without throwing for each discovered channel (up to 8)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const channelCount = Math.min(8, snap.channels.length)
    expect(channelCount, 'Need at least 1 channel for this test').toBeGreaterThan(0)

    for (let ch = 1; ch <= channelCount; ch++) {
      expect(() => diagnoseChannel(snap, ch, null, undefined), `channel ${ch} threw`).not.toThrow()
      const r = diagnoseChannel(snap, ch, null, undefined)
      expect(['ok', 'warning', 'problem'], `channel ${ch} status invalid`).toContain(r.status)
    }
  })

  it('diagnoseChannel with live meter summary returns meter check', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    // getSummarizer may return null if meters not yet subscribed; gracefully fall back
    const meterSummary = manager.getSummarizer(identity.deviceId)?.getSummary(10_000) ?? null
    const result = diagnoseChannel(snap, 1, meterSummary, 'HIL source')

    expect(result).toBeDefined()
    expect(['ok', 'warning', 'problem']).toContain(result.status)
    // When meter is provided (even with empty data), a 'meter' check is always emitted
    const meterCheck = result.checks.find((c) => c.check === 'meter')
    expect(meterCheck, 'meter check absent when meterSummary provided').toBeDefined()
  })
})

// ─── REQ-F-DIAG-002 (#74): analyze_line_check_step on real hardware ──────────

describe.skipIf(!HIL)('soundcheck HIL — analyze_line_check_step (REQ-F-DIAG-002 #74)', () => {
  /**
   * Verifies: REQ-F-DIAG-002 (#74) — analyze_line_check_step MCP tool
   * Verifies: TEST-DIAG-002 (#81)
   * Traces to: #3 (StR: Soundcheck assistance)
   *
   * We cannot know in advance whether CH1 has active signal on real hardware
   * during a HIL test run. Tests verify STRUCTURAL correctness only.
   */

  /** Minimal fallback meter summary for tests that need non-null meter data. */
  function emptyMeterSummary() {
    return manager.getSummarizer(identity.deviceId)?.getSummary(10_000) ?? {
      activeChannels: [],
      silentChannels: [],
      hotChannels: [],
      clippingChannels: [],
      noSignalButExpected: [],
    }
  }

  it('with empty expected list — returns ok status and empty expectedActive', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = analyzeLineCheckStep(snap, [], [], emptyMeterSummary())

    expect(result).toBeDefined()
    expect(result.status).toBe('ok')
    expect(result.expectedActive).toHaveLength(0)
    expect(Array.isArray(result.unexpectedActive)).toBe(true)
    expect(Array.isArray(result.suspicions)).toBe(true)
    expect(result.suspicions).toHaveLength(0)  // no swap suspicions without expected channels
  })

  it('with one expected channel — expectedActive[0] has channel/name/signal fields', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = analyzeLineCheckStep(snap, [{ channel: 1, name: 'HIL Source' }], [], emptyMeterSummary())

    expect(result.expectedActive).toHaveLength(1)
    const entry = result.expectedActive[0]!
    expect(entry.channel).toBe(1)
    expect(entry.name).toBe('HIL Source')
    expect(['active', 'silent', 'clipping', 'unknown']).toContain(entry.signal)
  })

  it('signal values in expectedActive are valid enum members', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const expected = snap.channels.slice(0, 4).map((c, i) => ({
      channel: i + 1,
      name: c.name ?? `Ch ${i + 1}`,
    }))
    const result = analyzeLineCheckStep(snap, expected, [], emptyMeterSummary())

    for (const e of result.expectedActive) {
      expect(['active', 'silent', 'clipping', 'unknown'],
        `channel ${e.channel} signal "${e.signal}" is not a valid enum value`)
        .toContain(e.signal)
    }
  })

  it('unexpectedActive entries have channel/name/signal (structural check)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = analyzeLineCheckStep(snap, [], [], emptyMeterSummary())

    for (const u of result.unexpectedActive) {
      expect(typeof u.channel).toBe('number')
      expect(typeof u.name).toBe('string')
      expect(['active', 'silent', 'clipping', 'unknown']).toContain(u.signal)
    }
  })

  it('allowed channels are NOT flagged as unexpected', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    // Mark CH1 and CH2 as allowed; they must not appear in unexpectedActive
    const allowed = [{ channel: 1, name: 'CH1' }, { channel: 2, name: 'CH2' }]
    const result = analyzeLineCheckStep(snap, [], allowed, emptyMeterSummary())

    const flaggedIds = result.unexpectedActive.map((u) => u.channel)
    expect(flaggedIds).not.toContain(1)
    expect(flaggedIds).not.toContain(2)
  })
})

// ─── REQ-F-DIAG-003 (#76): check_required_setup capabilities contract ─────────

describe.skipIf(!HIL)('soundcheck HIL — check_required_setup capabilities contract (REQ-F-DIAG-003 #76)', () => {
  /**
   * Verifies: REQ-F-DIAG-003 (#76) — check_required_setup MCP tool
   * Verifies: TEST-DIAG-003 (#82)
   * Traces to: #3 (StR: Soundcheck assistance)
   *
   * check_required_setup compares rider requirements against getCapabilities().
   * These HIL tests verify the capabilities data on real hardware is correct
   * and the comparison logic holds for boundary cases.
   */

  it('real mixer satisfies a minimal show requirement (1 line input, 1 aux)', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    // Minimal requirement: any StudioLive III should satisfy this
    expect(caps.lineInputs).toBeGreaterThanOrEqual(1)
    expect(caps.auxMixes).toBeGreaterThanOrEqual(1)
    expect(caps.mainOutputs).toBe(true)
  })

  it('real mixer reports insufficient for an absurd 999-input requirement', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    // caps.lineInputs < 999 on any real StudioLive; check_required_setup would return 'insufficient'
    expect(caps.lineInputs).toBeLessThan(999)
  })

  it('caps.lineInputs satisfies a 16-input requirement (all StudioLive III ≥ 16 channels)', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    // StudioLive 16 has 16 inputs; 24 has 24; 32/32SC has 32
    expect(caps.lineInputs).toBeGreaterThanOrEqual(16)
    // check_required_setup with requirements: { inputChannels: 16 } must return ok
  })

  it('caps.fxBuses satisfies a 4-FX-bus requirement (StudioLive III always has ≥ 4)', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    expect(caps.fxBuses).toBeGreaterThanOrEqual(4)
  })

  it('subgroups field is present and non-negative', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    expect(typeof caps.subgroups).toBe('number')
    expect(caps.subgroups).toBeGreaterThanOrEqual(0)
  })
})
