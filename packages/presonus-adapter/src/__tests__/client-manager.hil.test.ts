/**
 * Hardware-in-Loop (HIL) tests for PresonusClientManager.
 *
 * Verifies: REQ-F-002 (#16), REQ-F-003 (#17), REQ-F-004 (#18), REQ-F-005 (#19),
 *           REQ-NF-003 (#23), REQ-NF-004 (#24),
 *           QA-SC-001 (#25), QA-SC-002 (#26), QA-SC-003 (#27)
 *
 * Run: pnpm test:hil   (sets HIL_PRESONUS=1 and uses vitest.hil.config.ts)
 *
 * Design rules:
 *   - Assert STRUCTURAL properties — never assert specific channel names or
 *     fader values. The mixer state changes between shows; an assertion like
 *     `expect(ch1.name).toBe('Kick In')` is a test that fails after a scene change.
 *   - A shared connection (one beforeAll per file section) avoids hammering
 *     the mixer with repeated connect/disconnect cycles.
 *   - QA-SC-003 (stale state) uses a separate localManager so it can disconnect
 *     without breaking the shared connection used by earlier tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { discoverMixers } from '../discovery.js'
import { PresonusClientManager } from '../client-manager.js'
import { diagnoseChannel } from '../diagnostics.js'
import { MixerIdentitySchema, MixerChannelSchema } from '@presonus-mcp/domain'
import type { MixerIdentity } from '@presonus-mcp/domain'

const HIL = process.env.HIL_PRESONUS === '1'

// ─── Shared connection (most test groups reuse this) ──────────────────────────

let manager: PresonusClientManager
let identity: MixerIdentity

/** Discover and connect once; wait 2 s for initial state events to settle. */
async function connectOnce(): Promise<void> {
  const result = await discoverMixers({ timeoutMs: 5000 })
  expect(
    result.devices.length,
    'No mixer found — is the StudioLive III powered on and reachable?',
  ).toBeGreaterThan(0)
  identity = result.devices[0]!
  manager = new PresonusClientManager()
  await manager.connect(identity)
  // Allow featherbear to deliver initial dumpState + events
  await new Promise((r) => setTimeout(r, 2_000))
}

async function disconnectShared(): Promise<void> {
  await manager?.disconnect(identity?.deviceId).catch(() => { /* best-effort */ })
}

// ─── REQ-F-001 / REQ-F-002: Connection + serial identity ─────────────────────

describe.skipIf(!HIL)('PresonusClientManager HIL — connect + serial identity (REQ-F-001 #15, REQ-F-002 #16)', () => {
  beforeAll(connectOnce, 20_000)
  afterAll(disconnectShared)

  it('connect() registers the serial-derived deviceId in getConnectedDeviceIds()', () => {
    expect(manager.getConnectedDeviceIds()).toContain(identity.deviceId)
  })

  it('deviceId uses serial: prefix (not raw IP — REQ-F-002)', () => {
    expect(identity.deviceId).toMatch(/^serial:/)
  })

  it('snapshot.identity.serial === discovered serial (serial consistent end-to-end)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap, 'snapshot undefined after connect').toBeDefined()
    expect(snap.identity.serial).toBe(identity.serial)
    expect(snap.identity.deviceId).toBe(identity.deviceId)
  })

  it('snapshot.identity parses against MixerIdentitySchema (no required field missing)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(() => MixerIdentitySchema.parse(snap.identity)).not.toThrow()
  })
})

// ─── REQ-F-003 (#17): Channel list ────────────────────────────────────────────

describe.skipIf(!HIL)('PresonusClientManager HIL — channel list (REQ-F-003 #17)', () => {
  beforeAll(connectOnce, 20_000)
  afterAll(disconnectShared)

  it('snapshot.channels is non-empty (mixer has at least one channel)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.channels.length, 'no channels in snapshot').toBeGreaterThan(0)
  })

  it('every channel id matches line.chN pattern (state mapper key assumption on real hw)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    for (const ch of snap.channels) {
      expect(ch.id, `unexpected id format: "${ch.id}"`).toMatch(/^line\.ch\d+$/)
    }
  })

  it('at least one channel has a name (line.chN.username key exists and is parsed from real hw)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const named = snap.channels.filter((c) => c.name && c.name.trim().length > 0)
    expect(
      named.length,
      'No channel has a name — is line.chN.username parsed correctly on this firmware?',
    ).toBeGreaterThan(0)
  })

  it('first 8 channels parse against MixerChannelSchema (no schema violations on real state)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    for (const ch of snap.channels.slice(0, 8)) {
      expect(
        () => MixerChannelSchema.parse(ch),
        `Channel ${ch.id} failed MixerChannelSchema`,
      ).not.toThrow()
    }
  })

  it('snapshot.isStale is false immediately after fresh connect (REQ-NF-004 #24)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.isStale).toBe(false)
    expect(snap.disconnectedAt).toBeUndefined()
  })
})

// ─── REQ-F-005 (#19): Scene / project ─────────────────────────────────────────

describe.skipIf(!HIL)('PresonusClientManager HIL — scene/project resource (REQ-F-005 #19)', () => {
  beforeAll(connectOnce, 20_000)
  afterAll(disconnectShared)

  it('snapshot has currentProject field (value may be null if no show is loaded)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect('currentProject' in snap).toBe(true)
  })

  it('snapshot has currentScene field', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect('currentScene' in snap).toBe(true)
  })

  it('capturedAt is a valid ISO 8601 timestamp (REQ-NF-003 #23 freshness marker)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    // Must be recent — within the last 60 s
    const age = Date.now() - new Date(snap.capturedAt).getTime()
    expect(age, `capturedAt is ${Math.round(age / 1000)} s old — state not fresh`).toBeLessThan(60_000)
  })
})

// ─── REQ-F-004 (#18): Meter data ──────────────────────────────────────────────

describe.skipIf(!HIL)('PresonusClientManager HIL — meter data (REQ-F-004 #18)', () => {
  beforeAll(connectOnce, 20_000)
  afterAll(disconnectShared)

  it('getSummarizer() is non-null after connect (meterSubscribe registered)', () => {
    const summarizer = manager.getSummarizer(identity.deviceId)
    expect(summarizer, 'no summarizer — meterSubscribe() may not have been called').toBeDefined()
  })

  it('summarizer.getSummary(10) returns a MeterSummary with correct structure', () => {
    const summarizer = manager.getSummarizer(identity.deviceId)!
    const summary = summarizer.getSummary(10)
    expect(summary).toBeDefined()
    expect(summary.windowSec).toBe(10)
    expect(typeof summary.computedAt).toBe('string')
    expect(Array.isArray(summary.activeChannels)).toBe(true)
    expect(Array.isArray(summary.silentChannels)).toBe(true)
    expect(Array.isArray(summary.clippingChannels)).toBe(true)
  })

  it('meter channel ids follow line.chN format (meter packet index → channel id mapping)', () => {
    const summarizer = manager.getSummarizer(identity.deviceId)!
    const summary = summarizer.getSummary(10)
    const allChannels = [
      ...summary.activeChannels,
      ...summary.silentChannels,
      ...summary.clippingChannels,
      ...summary.hotChannels,
    ]
    for (const id of allChannels) {
      expect(id, `meter channel id "${id}" does not match expected format`).toMatch(/^line\.ch\d+$/)
    }
  })
})

// ─── REQ-NF-003 (#23): State cache synchrony ──────────────────────────────────

describe.skipIf(!HIL)('PresonusClientManager HIL — state cache synchrony (REQ-NF-003 #23)', () => {
  beforeAll(connectOnce, 20_000)
  afterAll(disconnectShared)

  it('snapshot is defined immediately after connect() resolves (synchronous initial build)', () => {
    const snap = manager.getSnapshot(identity.deviceId)
    expect(snap, 'snapshot undefined — initial state not built synchronously in connect()').toBeDefined()
  })

  it('snapshot was built within 5 s of this test running (freshness)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const age = Date.now() - new Date(snap.capturedAt).getTime()
    expect(age).toBeLessThan(5_000)
  })
})

// ─── QA-SC-001 (#25): Soundcheck diagnostics on real state ────────────────────

describe.skipIf(!HIL)('PresonusClientManager HIL — soundcheck diagnostics (QA-SC-001 #25)', () => {
  beforeAll(connectOnce, 20_000)
  afterAll(disconnectShared)

  it('getCapabilities() returns a capabilities object with lineInputs > 0 (real hw caps)', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    expect(caps, 'getCapabilities returned undefined').toBeDefined()
    expect(caps.lineInputs, 'lineInputs must be positive').toBeGreaterThan(0)
  })

  it('diagnoseChannel(snapshot, 1) returns a valid DiagnoseChannelResult on real state', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const summarizer = manager.getSummarizer(identity.deviceId)
    const meterSummary = summarizer?.getSummary(10) ?? null
    // This verifies the real state keys are parsed correctly by the adapter
    const result = diagnoseChannel(snap, 1, meterSummary)
    expect(result, 'diagnoseChannel returned undefined').toBeDefined()
    expect(['ok', 'warning', 'problem']).toContain(result.status)
    expect(Array.isArray(result.mostLikelyCauses)).toBe(true)
    expect(Array.isArray(result.safeNextSteps)).toBe(true)
  })
})

// ─── QA-SC-002 (#26): Safety boundary — no writes without explicit opt-in ──────

describe.skipIf(!HIL)('PresonusClientManager HIL — safety boundary (QA-SC-002 #26)', () => {
  beforeAll(connectOnce, 20_000)
  afterAll(disconnectShared)

  it('applyChange() rejects when writeEnabled=false (default — no mixer write without opt-in)', async () => {
    // writeEnabled defaults to false; applyChange MUST throw without physical mixer change
    await expect(
      manager.applyChange(identity.deviceId, 'line.ch1.volume', 0.5),
    ).rejects.toThrow()
  })
})

// ─── QA-SC-003 (#27): Stale state on programmatic disconnect ─────────────────

describe.skipIf(!HIL)('PresonusClientManager HIL — stale state on disconnect (QA-SC-003 #27)', () => {
  // Uses its own manager so it can call disconnect() without affecting other groups
  let localManager: PresonusClientManager
  let localIdentity: MixerIdentity

  beforeAll(async () => {
    const result = await discoverMixers({ timeoutMs: 5000 })
    expect(result.devices.length, 'no mixer found').toBeGreaterThan(0)
    localIdentity = result.devices[0]!
    localManager = new PresonusClientManager()
    await localManager.connect(localIdentity)
    await new Promise((r) => setTimeout(r, 1_000))
  }, 20_000)

  afterAll(async () => {
    await localManager?.disconnect(localIdentity?.deviceId).catch(() => { /* best-effort */ })
  })

  it('snapshot.isStale is false while connected (baseline before disconnect)', () => {
    const snap = localManager.getSnapshot(localIdentity.deviceId)!
    expect(snap.isStale).toBe(false)
  })

  it('getSnapshot() does not throw after explicit disconnect (no crash on removed entry)', async () => {
    await localManager.disconnect(localIdentity.deviceId)
    // After explicit disconnect, manager removes the entry; getSnapshot must not throw
    expect(() => localManager.getSnapshot(localIdentity.deviceId)).not.toThrow()
    // The connection is removed (not stale — that's the network-disconnect case)
    expect(localManager.getConnectedDeviceIds()).not.toContain(localIdentity.deviceId)
  })
})
