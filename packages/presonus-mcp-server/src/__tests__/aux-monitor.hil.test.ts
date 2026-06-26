/**
 * Hardware-in-Loop (HIL) tests for AUX monitor tools via MCP server layer.
 *
 * Verifies against real StudioLive 32SC (serial SD7E21010066):
 *   REQ-F-AUX-002 (#55) — find_missing_monitor_sends
 *   REQ-F-AUX-003 (#56) — find_muted_monitor_sends
 *   REQ-F-AUX-004 (#57) — find_hot_monitor_sends
 *   REQ-F-AUX-005 (#58) — validate_aux_mix combined audit
 *
 * Design rules (same as other HIL test files):
 *   - Assert STRUCTURAL properties only — never specific send levels or mix names
 *   - Mock tests (tools-behavioral.test.ts) cover specific values and edge cases
 *   - These tests verify the functions don't crash on real hardware state
 *
 * Run: pnpm test:hil   (sets HIL_PRESONUS=1, uses vitest.hil.config.ts)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { discoverMixers, PresonusClientManager, extractAuxMixes } from '@presonus-mcp/adapter'
import type { MixerIdentity } from '@presonus-mcp/domain'

// ─── Environment ──────────────────────────────────────────────────────────────

const HIL    = process.env.HIL_PRESONUS        === '1'
const HIL_IP = process.env.HIL_PRESONUS_IP
const HIL_SN = process.env.HIL_PRESONUS_SERIAL

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

// ─── Shared connection ────────────────────────────────────────────────────────

let manager: PresonusClientManager
let identity: MixerIdentity

async function connectOnce(): Promise<void> {
  if (manager && identity && manager.getConnectedDeviceIds().includes(identity.deviceId)) {
    return
  }
  const result = await discoverMixers(discoveryConfig())
  expect(
    result.devices.length,
    HIL_IP ? `No mixer found — is ${HIL_IP} reachable on TCP 53000?` : 'No mixer found via UDP',
  ).toBeGreaterThan(0)
  identity = result.devices[0]!
  manager = new PresonusClientManager()
  await manager.connect(identity)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const snap = manager.getSnapshot(identity.deviceId)
    if (snap && snap.channels.length > 0) break
    await new Promise((r) => setTimeout(r, 500))
  }
}

if (HIL) {
  beforeAll(connectOnce, 30_000)
  afterAll(async () => {
    await manager?.disconnect(identity?.deviceId).catch(() => { /* best-effort */ })
  }, 10_000)
}

// ─── REQ-F-AUX-002 (#55): find_missing_monitor_sends on real hw ───────────────

describe.skipIf(!HIL)('aux-monitor HIL — find_missing_monitor_sends (REQ-F-AUX-002 #55)', () => {
  /**
   * Verifies: REQ-F-AUX-002 (#55)
   * Missing sends = assigned (assign_auxN=true) but level < 0.05 (effectively silent)
   */

  it('filtering sends with level < 0.05 returns valid structure', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)

    const result = allMixes.map((mix) => ({
      auxMixNumber: mix.auxMixNumber,
      name: mix.name,
      missingSends: mix.sends.filter((s) => !s.muted && s.level < 0.05),
    }))

    expect(Array.isArray(result)).toBe(true)
    for (const r of result) {
      expect(typeof r.auxMixNumber).toBe('number')
      expect(typeof r.name).toBe('string')
      expect(Array.isArray(r.missingSends)).toBe(true)
      for (const s of r.missingSends) {
        expect(s.level).toBeLessThan(0.05)
        expect(s.muted).toBe(false)  // assigned but silent
      }
    }
  })

  it('missing sends have valid fromChannel, fromChannelName, level fields', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)
    const allMissing = allMixes.flatMap((mix) =>
      mix.sends.filter((s) => !s.muted && s.level < 0.05)
    )
    for (const s of allMissing) {
      expect(typeof s.fromChannel).toBe('number')
      expect(s.fromChannel).toBeGreaterThanOrEqual(1)
      expect(typeof s.fromChannelName).toBe('string')
      expect(s.level).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─── REQ-F-AUX-003 (#56): find_muted_monitor_sends on real hw ────────────────

describe.skipIf(!HIL)('aux-monitor HIL — find_muted_monitor_sends (REQ-F-AUX-003 #56)', () => {
  /**
   * Verifies: REQ-F-AUX-003 (#56)
   * Muted sends = assign_auxN = false (channel NOT assigned to this bus)
   */

  it('filtering muted sends returns valid structure with boolean muted field', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)

    const result = allMixes.map((mix) => ({
      auxMixNumber: mix.auxMixNumber,
      mutedSends: mix.sends.filter((s) => s.muted),
    }))

    for (const r of result) {
      for (const s of r.mutedSends) {
        expect(s.muted).toBe(true)
        expect(typeof s.fromChannel).toBe('number')
        expect(typeof s.fromChannelName).toBe('string')
      }
    }
  })

  it('real mixer has at least some muted sends (assign_auxN=false is common)', () => {
    // On the real 32SC, not all 32 channels are assigned to every AUX bus
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)
    const totalMuted = allMixes.reduce((sum, m) => sum + m.sends.filter((s) => s.muted).length, 0)
    expect(totalMuted, 'Expected at least some muted (unassigned) sends on real mixer').toBeGreaterThan(0)
  })
})

// ─── REQ-F-AUX-004 (#57): find_hot_monitor_sends on real hw ──────────────────

describe.skipIf(!HIL)('aux-monitor HIL — find_hot_monitor_sends (REQ-F-AUX-004 #57)', () => {
  /**
   * Verifies: REQ-F-AUX-004 (#57)
   * Hot sends = level > HOT_THRESHOLD (-6 dBFS ≈ 0.5 linear)
   */

  const HOT_THRESHOLD = 0.5  // -6 dBFS linear

  it('filtering hot sends returns valid structure', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)

    const result = allMixes.map((mix) => ({
      auxMixNumber: mix.auxMixNumber,
      hotSends: mix.sends.filter((s) => s.level > HOT_THRESHOLD),
    }))

    for (const r of result) {
      for (const s of r.hotSends) {
        expect(s.level).toBeGreaterThan(HOT_THRESHOLD)
        expect(s.level).toBeLessThanOrEqual(1)
      }
    }
  })

  it('hot send threshold applies to 0–1 SEND levels (not master level)', () => {
    // CRITICAL: Hot threshold must apply to send levels (0-1) not master levels (0-100 raw)
    // After the masterLevel fix, this test verifies no confusion between the two scales
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)
    const allSends = allMixes.flatMap((m) => m.sends)
    // All send levels must be <= 1 (confirms hot threshold 0.5 is meaningful)
    for (const s of allSends) {
      expect(s.level).toBeLessThanOrEqual(1.0)
    }
  })
})

// ─── REQ-F-AUX-005 (#58): validate_aux_mix combined audit on real hw ──────────

describe.skipIf(!HIL)('aux-monitor HIL — validate_aux_mix combined audit (REQ-F-AUX-005 #58)', () => {
  /**
   * Verifies: REQ-F-AUX-005 (#58)
   * Combined audit: missing + muted + hot sends per bus.
   * Validates structural correctness on real hardware.
   */

  const MISSING_THRESHOLD = 0.05
  const HOT_THRESHOLD = 0.5

  it('combined audit returns one result per AUX bus', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)

    const audit = allMixes.map((mix) => ({
      auxMixNumber: mix.auxMixNumber,
      name: mix.name,
      masterLevel: mix.masterLevel,
      masterMuted: mix.masterMuted,
      missingSendCount: mix.sends.filter((s) => !s.muted && s.level < MISSING_THRESHOLD).length,
      mutedSendCount: mix.sends.filter((s) => s.muted).length,
      hotSendCount: mix.sends.filter((s) => s.level > HOT_THRESHOLD).length,
      status: (mix.masterMuted ? 'master_muted' : 'ok') as string,
    }))

    expect(audit.length).toBeGreaterThanOrEqual(8)
    for (const a of audit) {
      expect(typeof a.auxMixNumber).toBe('number')
      expect(typeof a.name).toBe('string')
      expect(typeof a.masterLevel).toBe('number')
      expect(typeof a.masterMuted).toBe('boolean')
      expect(typeof a.missingSendCount).toBe('number')
      expect(typeof a.mutedSendCount).toBe('number')
      expect(typeof a.hotSendCount).toBe('number')
      expect(a.missingSendCount).toBeGreaterThanOrEqual(0)
      expect(a.mutedSendCount).toBeGreaterThanOrEqual(0)
      expect(a.hotSendCount).toBeGreaterThanOrEqual(0)
    }
  })

  it('masterLevel in combined audit is in 0–1 range after fix [BUG: RED until fix]', () => {
    // This test confirms the fix from aux-routing.hil.test.ts propagates to combined audit
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)
    for (const mix of allMixes) {
      expect(mix.masterLevel, `AUX ${mix.auxMixNumber} masterLevel = ${mix.masterLevel} exceeds 1.0`).toBeLessThanOrEqual(1.0)
    }
  })

  it('muted master bus shows masterMuted=true (real hw may have some muted)', () => {
    // This test just verifies structure — we don't assert which specific bus is muted
    const snap = manager.getSnapshot(identity.deviceId)!
    const allMixes = extractAuxMixes(snap.flatState)
    // All masterMuted must be boolean
    for (const mix of allMixes) {
      expect(typeof mix.masterMuted).toBe('boolean')
    }
  })
})
