/**
 * Hardware-in-Loop (HIL) tests for routing MCP tools.
 *
 * Verifies against real StudioLive 32SC (serial SD7E21010066):
 *   REQ-F-ROUT-002 (#32) — get_routing_graph structural on real state
 *   REQ-F-ROUT-005 (#35) — diagnose_no_signal_routing on real CH1
 *   REQ-F-ROUT-006 (#36) — detect_possible_patch_swap structural
 *   REQ-F-ROUT-011 (#45) — Layer B stubs have correct not_verifiable confidence
 *   QA-SC-ROUT-001 (#49) — No tool returns 'observed' for Layer B data
 *
 * Run: pnpm test:hil   (sets HIL_PRESONUS=1, uses vitest.hil.config.ts)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  discoverMixers, PresonusClientManager,
  extractOutputPatchRouter, extractChannelSendRouting, diagnoseChannel, analyzeLineCheckStep,
} from '@presonus-mcp/adapter'
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
        alias: 'hil-mixer', fallbackIp: HIL_IP, fallbackPort: 53000,
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
  if (manager && identity && manager.getConnectedDeviceIds().includes(identity.deviceId)) return
  const result = await discoverMixers(discoveryConfig())
  expect(result.devices.length, HIL_IP ? `No mixer — is ${HIL_IP} reachable?` : 'No mixer via UDP').toBeGreaterThan(0)
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
    await manager?.disconnect(identity?.deviceId).catch(() => {})
  }, 10_000)
}

// ─── REQ-F-ROUT-002 (#32): Routing graph structure on real hardware ───────────

describe.skipIf(!HIL)('routing-tools HIL — get_routing_graph structure (REQ-F-ROUT-002 #32)', () => {
  /**
   * Tests the domain-layer building blocks that power the get_routing_graph MCP tool.
   * The MCP wrapper is covered by mock tests (tools-behavioral.test.ts).
   * These HIL tests verify the real-hardware data that feeds the tool.
   */

  it('snapshot.channels is non-empty (routing graph source data)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.channels.length).toBeGreaterThan(0)
  })

  it('at least some channels have sendRouting populated from real state', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const withRouting = snap.channels.filter((c) => c.sendRouting !== undefined)
    expect(withRouting.length, 'No channels have sendRouting — check flatState has routing keys').toBeGreaterThan(0)
  })

  it('sendRouting on CH1 has parameterConfidence=inferred (Layer A observable)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const ch1 = snap.channels.find((c) => c.id === 'line.ch1')
    expect(ch1, 'CH1 not in snapshot').toBeDefined()
    expect(ch1!.sendRouting, 'CH1 has no sendRouting').toBeDefined()
    expect(ch1!.sendRouting!.parameterConfidence).toBe('inferred')
  })

  it('outputPatch from real state has not_verifiable globalConfidence (Layer B)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)
    if (!patchRouter) {
      // If no outputpatchrouter.* keys, skip assertion (not a failure)
      return
    }
    expect(patchRouter.globalConfidence).toBe('not_verifiable_with_current_adapter')
  })

  it('routing graph consistency: channel count >= 16 on StudioLive 32SC', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.channels.length).toBeGreaterThanOrEqual(16)
  })
})

// ─── REQ-F-ROUT-005 (#35): diagnose_no_signal_routing on real hardware ────────

describe.skipIf(!HIL)('routing-tools HIL — diagnose_no_signal_routing (REQ-F-ROUT-005 #35)', () => {
  /**
   * diagnoseChannel is the underlying function for diagnose_no_signal_routing MCP tool.
   * Tests structural correctness on real hardware — not specific signal states.
   */

  it('diagnoseChannel(snap, 1) returns valid structure without throwing', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(() => diagnoseChannel(snap, 1, null, undefined)).not.toThrow()
  })

  it('diagnoseChannel result contains mute, fader, solo checks (always present)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = diagnoseChannel(snap, 1, null, undefined)
    const checkNames = result.checks.map((c) => c.check)
    expect(checkNames).toContain('mute')
    expect(checkNames).toContain('fader')
    expect(checkNames).toContain('solo')
  })

  it('diagnoseChannel status is valid enum value on real state', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = diagnoseChannel(snap, 1, null, undefined)
    expect(['ok', 'warning', 'problem']).toContain(result.status)
  })

  it('diagnoseChannel with real meter summary still returns valid result', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const meterSummary = manager.getSummarizer(identity.deviceId)?.getSummary(10_000) ?? null
    const result = diagnoseChannel(snap, 1, meterSummary, 'CH1 Input')
    expect(result).toBeDefined()
    expect(['ok', 'warning', 'problem']).toContain(result.status)
  })

  it('physical routing checks are NOT in result (software cannot see cable connections)', () => {
    // diagnoseChannel must NOT include checks about physical input routing
    // (which cable is plugged in) — those are Layer B (not_verifiable)
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = diagnoseChannel(snap, 1, null, undefined)
    const physicalChecks = result.checks.filter(
      (c) => c.check === 'physical_routing' || c.check === 'cable_routing' || c.check === 'avb_routing',
    )
    expect(physicalChecks).toHaveLength(0)
  })
})

// ─── REQ-F-ROUT-006 (#36): detect_possible_patch_swap on real hardware ────────

describe.skipIf(!HIL)('routing-tools HIL — detect_possible_patch_swap (REQ-F-ROUT-006 #36)', () => {
  /**
   * analyzeLineCheckStep is the underlying function for detect_possible_patch_swap.
   * Tests structural correctness with real meter data.
   */

  function emptyMeterSummary() {
    return manager.getSummarizer(identity.deviceId)?.getSummary(10_000) ?? {
      activeChannels: [],
      silentChannels: [],
      hotChannels: [],
      clippingChannels: [],
      noSignalButExpected: [],
    }
  }

  it('analyzeLineCheckStep returns valid structure without throwing', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(() => analyzeLineCheckStep(snap, [], [], emptyMeterSummary())).not.toThrow()
  })

  it('suspicions have confidence "medium" (never "observed" — ADR-008 invariant)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    // Ask to check CH1 and CH2 — this creates context for swap detection
    const expected = [
      { channel: 1, name: 'CH1' },
      { channel: 2, name: 'CH2' },
    ]
    const result = analyzeLineCheckStep(snap, expected, [], emptyMeterSummary())
    for (const suspicion of result.suspicions) {
      expect(
        suspicion.confidence,
        `swap suspicion has confidence "${suspicion.confidence}" — must be "medium", never "observed"`,
      ).toBe('medium')
    }
  })

  it('suspicions structure: type, expected, observed, confidence fields present', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const expected = [{ channel: 1, name: 'Test' }]
    const result = analyzeLineCheckStep(snap, expected, [], emptyMeterSummary())
    for (const s of result.suspicions) {
      expect(typeof s.type).toBe('string')
      expect(typeof s.expected).toBe('string')
      expect(typeof s.observed).toBe('string')
      expect(typeof s.confidence).toBe('string')
    }
  })
})

// ─── REQ-F-ROUT-011 (#45): Layer B confidence on real hardware ────────────────

describe.skipIf(!HIL)('routing-tools HIL — Layer B always not_verifiable (REQ-F-ROUT-011 #45)', () => {
  /**
   * ADR-008: Layer B routing (input source, AVB, output patch) is never observable
   * from the software layer — always returns not_verifiable_with_current_adapter.
   *
   * This test group confirms that on real hardware with real state data,
   * no Layer B data accidentally gets a higher confidence value.
   *
   * TEST: #59 Layer B routing stub tool registration and response structure
   */

  it('Layer B: output patch router confidence is not_verifiable on real state', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)
    if (!patchRouter) return  // no output patch keys — not a failure
    expect(patchRouter.globalConfidence).toBe('not_verifiable_with_current_adapter')
    for (const o of patchRouter.analogOutputs) {
      expect(o.confidence).toBe('not_verifiable_with_current_adapter')
    }
  })

  it('Layer A: channel send routing confidence is inferred (observable, formula unverified)', () => {
    // Layer A data CAN be 'inferred' — it's observable via software, but formula not probe-confirmed
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')
    if (!routing) return
    expect(routing.parameterConfidence).toBe('inferred')
    // 'inferred' is correct — it means "we can read it, but haven't probe-confirmed the formula"
    expect(routing.parameterConfidence).not.toBe('not_verifiable_with_current_adapter')
    expect(routing.parameterConfidence).not.toBe('observed')  // not observed until probe
  })

  it('mixer capabilities show avbStagebox=true for StudioLive 32SC', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    // 32SC supports AVB stagebox connection
    expect(caps.avbStagebox).toBe(true)
    // But AVB routing itself is still not_verifiable (Layer B) — software cannot see AVB streams
  })

  it('QA-SC-ROUT-001: no routing data has confidence "observed" without a probe session', () => {
    // On real hardware WITHOUT a probe session, no data should claim 'observed' confidence.
    // 'observed' is only set by complete_routing_probe (Phase 7).
    // This test runs without any probe session, so nothing should be 'observed'.
    const snap = manager.getSnapshot(identity.deviceId)!

    // Check output patch
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)
    if (patchRouter) {
      const observed = patchRouter.analogOutputs.filter((o) => o.confidence === 'observed')
      expect(observed).toHaveLength(0)
    }

    // Check channel send routing
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')
    if (routing) {
      // parameterConfidence is 'inferred' — NOT 'observed'
      expect(routing.parameterConfidence).not.toBe('observed')
    }
  })
})
