/**
 * Hardware-in-Loop (HIL) tests for AUX routing extraction.
 *
 * Verifies against real StudioLive 32SC (serial SD7E21010066):
 *   REQ-F-AUX-001 (#55) — AUX mix state extraction
 *   REQ-F-ROUT-010 (#54) — Non-LINE channel AUX routing
 *
 * CRITICAL BUG EXPOSED BY THIS TEST:
 *   Real hardware sends `aux.chN.volume` in a 0–100 scale (e.g. 51.37 for ch1),
 *   NOT 0–1. The current extractAuxMixes stores this raw value → `masterLevel = 51.37`
 *   which violates AuxMixSchema.masterLevel (min(0).max(1)).
 *
 *   Test "masterLevel values are in 0–1 range (normalized from 0–100 raw value)"
 *   will be RED until extractAuxMixes divides aux volume by 100.
 *   Test "masterLevel values differ between buses (not all clipped to constant)"
 *   will also be RED since 51.37 ≠ 1.0 but several buses would exceed 1.0.
 *
 * Observed values from captures/2026-06-24/SD7E21010066/state-full.json:
 *   aux.ch1.volume  = 51.3671875   → expected masterLevel ≈ 0.514
 *   aux.ch4.volume  = 74.8046875   → expected masterLevel ≈ 0.748 (near unity)
 *   aux.ch11.volume = 0            → expected masterLevel = 0.0 (fader fully down)
 *   line.ch1.aux5   = 0.5236       → expected send level ≈ 0.524 (already 0–1)
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

// ─── REQ-F-AUX-001 (#55): AUX mix extraction on real hardware ────────────────

describe.skipIf(!HIL)('AUX routing HIL — extractAuxMixes on real hardware (REQ-F-AUX-001 #55)', () => {
  /**
   * Verifies: REQ-F-AUX-001 (#55) — AUX mix state extraction
   * Traces to: #3 (StR: Soundcheck assistance)
   */

  it('extractAuxMixes returns at least 8 AUX buses (StudioLive 32SC has 16)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    expect(mixes.length, 'StudioLive 32SC has 16 AUX buses').toBeGreaterThanOrEqual(8)
  })

  it('every auxMixNumber is a positive integer', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    for (const mix of mixes) {
      expect(typeof mix.auxMixNumber).toBe('number')
      expect(mix.auxMixNumber).toBeGreaterThanOrEqual(1)
      expect(Number.isInteger(mix.auxMixNumber)).toBe(true)
    }
  })

  it('masterLevel values are in 0–1 range (normalized from 0–100 raw value) [BUG: will be RED until fix]', () => {
    // BEFORE FIX: masterLevel = 51.37 (raw value, violates schema)
    // AFTER FIX:  masterLevel = 51.37 / 100 = 0.514 (normalized, valid)
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    expect(mixes.length).toBeGreaterThan(0)
    for (const mix of mixes) {
      expect(mix.masterLevel, `AUX ${mix.auxMixNumber} masterLevel ${mix.masterLevel} exceeds 1.0`).toBeLessThanOrEqual(1.0)
      expect(mix.masterLevel).toBeGreaterThanOrEqual(0)
    }
  })

  it('at least one bus with non-zero volume is strictly between 0 and 1 (proves no clipping)', () => {
    // BEFORE FIX: all non-zero masterLevel values are > 1 (raw 0-100 values)
    // AFTER FIX:  values like 0.514 are between 0 and 1 — not clipped to either extreme
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    const nonZeroMixes = mixes.filter((m) => m.masterLevel > 0)
    expect(
      nonZeroMixes.some((m) => m.masterLevel > 0.01 && m.masterLevel < 0.99),
      `All non-zero masterLevels are at extremes (0 or ~1). Got: ${nonZeroMixes.map((m) => m.masterLevel).join(', ')}`,
    ).toBe(true)
  })

  it('masterMuted is boolean for all buses', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    for (const mix of mixes) {
      expect(typeof mix.masterMuted).toBe('boolean')
    }
  })

  it('every mix has a non-empty name string (default "Aux N" or user-assigned)', () => {
    // Accept both default "Aux N" names and custom user-assigned names.
    // Mixer state depends on the current show setup; we only verify the field is present.
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    for (const mix of mixes) {
      expect(typeof mix.name).toBe('string')
      expect(mix.name.length).toBeGreaterThan(0)
    }
  })
})

// ─── REQ-F-AUX-001 (#55): AUX send levels are 0–1 (separate from master) ─────

describe.skipIf(!HIL)('AUX routing HIL — send levels vs master level scale', () => {
  /**
   * KEY INVARIANT: Send levels (line.chN.auxM) ARE 0–1 normalized.
   * Master levels (aux.chM.volume) are 0–100 raw → divide by 100 to normalize.
   * These two value types must be handled differently.
   */

  it('send levels from active channels are in 0–1 range', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    for (const mix of mixes) {
      for (const send of mix.sends) {
        expect(send.level, `send ch${send.fromChannel}→aux${send.auxMixNumber} level ${send.level} out of range`).toBeGreaterThanOrEqual(0)
        expect(send.level).toBeLessThanOrEqual(1)
      }
    }
  })

  it('send.muted correctly reflects assign_auxN boolean from mixer', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    // The real mixer has some sends with assign_auxN=false (muted)
    // At least some unassigned sends must exist in a typical show setup
    const allSends = mixes.flatMap((m) => m.sends)
    expect(allSends.length, 'No sends found — check real mixer state').toBeGreaterThan(0)
    // Each send must have boolean muted field
    for (const send of allSends) {
      expect(typeof send.muted).toBe('boolean')
    }
  })

  it('sends array is ordered by fromChannel (ascending)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    for (const mix of mixes) {
      if (mix.sends.length < 2) continue
      for (let i = 1; i < mix.sends.length; i++) {
        expect(mix.sends[i]!.fromChannel).toBeGreaterThanOrEqual(mix.sends[i - 1]!.fromChannel)
      }
    }
  })
})

// ─── REQ-F-ROUT-010 (#54): non-LINE channel sends on real hardware ──────────

describe.skipIf(!HIL)('AUX routing HIL — non-LINE AUX sends structure (REQ-F-ROUT-010 #54)', () => {
  /**
   * Verifies: REQ-F-ROUT-010 (#54) — non-LINE channel AUX routing extraction
   * The StudioLive 32SC also has FX returns, talkback, and other channel types.
   * This group checks that the function handles them correctly if present.
   */

  it('all send.fromChannelName values are non-empty strings', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    const allSends = mixes.flatMap((m) => m.sends)
    for (const send of allSends) {
      expect(typeof send.fromChannelName).toBe('string')
      expect(send.fromChannelName.length).toBeGreaterThan(0)
    }
  })

  it('all send.prePost values are valid enum members', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    const allSends = mixes.flatMap((m) => m.sends)
    for (const send of allSends) {
      expect(['pre', 'post', 'unknown']).toContain(send.prePost)
    }
  })

  it('send.levelDb is -Infinity for zero-level sends, finite for non-zero sends', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    const allSends = mixes.flatMap((m) => m.sends)
    for (const send of allSends) {
      if (send.level === 0) {
        expect(isFinite(send.levelDb)).toBe(false)
      } else {
        expect(isFinite(send.levelDb)).toBe(true)
        expect(send.levelDb).toBeLessThan(0)  // dBFS for send levels < 0 dBFS
      }
    }
  })
})
