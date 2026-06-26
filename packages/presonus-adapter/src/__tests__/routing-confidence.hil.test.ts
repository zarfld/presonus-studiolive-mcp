/**
 * Hardware-in-Loop (HIL) tests for routing confidence model.
 *
 * Verifies against real StudioLive 32SC (serial SD7E21010066):
 *   REQ-F-ROUT-007 (#37) — Output patch router (extractOutputPatchRouter formula)
 *   REQ-F-ROUT-001 (#31) — Channel send routing (extractChannelSendRouting)
 *   QA-SC-ROUT-001 (#49) — Routing confidence never misrepresents unverified routes
 *   ADR-008 (#47)        — Layer A/B split: Layer B is always not_verifiable
 *
 * OBSERVED values from captures/2026-06-24/SD7E21010066/state-full.json:
 *   outputpatchrouter.mix1_src.value = 0              → sourceIndex = 0
 *   outputpatchrouter.mix2_src.value = 0.03703703...  → sourceIndex = 1 (Math.round(0.037 × 27))
 *   outputpatchrouter.mix3_src.value = 0.07407407...  → sourceIndex = 2
 *   line.ch1.sub1 = 1, sub2 = 1, sub3 = 0, sub4 = 0
 *   line.ch1.lr = 0
 *
 * Run: pnpm test:hil   (sets HIL_PRESONUS=1, uses vitest.hil.config.ts)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  discoverMixers, PresonusClientManager,
  extractOutputPatchRouter, extractChannelSendRouting,
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

// ─── REQ-F-ROUT-007 (#37): Output patch router on real hardware ──────────────

describe.skipIf(!HIL)('routing-confidence HIL — output patch router (REQ-F-ROUT-007 #37)', () => {
  /**
   * Verifies: REQ-F-ROUT-007 (#37) — Output patch router extraction
   * TEST: #51 Output patch router resource extraction
   * Traces to: #3 (StR: Soundcheck assistance)
   *
   * Key formula: sourceIndex = Math.round(value × range.max)
   *   mix1: value=0 → sourceIndex=0
   *   mix2: value=0.037037... → sourceIndex=1 (Math.round(0.037×27)=1)
   */

  it('extractOutputPatchRouter returns non-null on real hardware', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)
    expect(patchRouter, 'extractOutputPatchRouter returned null — no outputpatchrouter.* keys in state').toBeDefined()
  })

  it('analogOutputs has at least 5 entries (StudioLive 32SC has 16 analog outputs)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    expect(patchRouter.analogOutputs.length).toBeGreaterThanOrEqual(5)
  })

  it('sourceIndex values are non-negative integers (formula: Math.round(value × max))', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    for (const output of patchRouter.analogOutputs) {
      expect(Number.isInteger(output.sourceIndex), `sourceIndex ${output.sourceIndex} is not an integer`).toBe(true)
      expect(output.sourceIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it('mix1 sourceIndex = 0 (value=0, confirmed from real capture)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    const mix1 = patchRouter.analogOutputs.find((o) => o.outputIndex === 1)
    expect(mix1, 'mix1 not found').toBeDefined()
    expect(mix1!.sourceIndex).toBe(0)
  })

  it('mix2 sourceIndex = 1 (Math.round(0.037037 × 27) = 1, confirmed from real capture)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    const mix2 = patchRouter.analogOutputs.find((o) => o.outputIndex === 2)
    expect(mix2, 'mix2 not found').toBeDefined()
    expect(mix2!.sourceIndex).toBe(1)
  })

  it('sequential sourceIndexes: mix1=0, mix2=1, mix3=2, mix4=3 (confirmed from real capture)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    for (const [idx, expected] of [[1, 0], [2, 1], [3, 2], [4, 3]] as const) {
      const output = patchRouter.analogOutputs.find((o) => o.outputIndex === idx)
      expect(output, `mix${idx} not found`).toBeDefined()
      expect(output!.sourceIndex).toBe(expected)
    }
  })
})

// ─── QA-SC-ROUT-001 (#49): Layer B confidence invariant on real hardware ─────

describe.skipIf(!HIL)('routing-confidence HIL — QA-SC-ROUT-001 confidence invariant (#49)', () => {
  /**
   * QA-SC-ROUT-001: Routing confidence propagation
   * "Unverified routes NEVER appear as verified"
   *
   * INVARIANT:
   *   - Output patch outputs: ALWAYS 'not_verifiable_with_current_adapter'
   *   - Never 'observed' or 'inferred' for Layer B data
   *   - Channel send routing: ALWAYS 'inferred' (never 'observed')
   */

  it('QA-SC-ROUT-001: ALL output patch outputs have not_verifiable confidence', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    for (const output of patchRouter.analogOutputs) {
      expect(
        output.confidence,
        `output ${output.outputIndex} has confidence "${output.confidence}" — must be not_verifiable_with_current_adapter`,
      ).toBe('not_verifiable_with_current_adapter')
    }
  })

  it('QA-SC-ROUT-001: outputPatch globalConfidence is not_verifiable_with_current_adapter', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    expect(patchRouter.globalConfidence).toBe('not_verifiable_with_current_adapter')
  })

  it('QA-SC-ROUT-001: ALL output source names are null (unresolved without probe)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    for (const output of patchRouter.analogOutputs) {
      expect(output.sourceName, `output ${output.outputIndex} has non-null sourceName`).toBeNull()
    }
  })

  it('QA-SC-ROUT-001: no output has confidence "observed" (probe session required for that)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    const observed = patchRouter.analogOutputs.filter((o) => o.confidence === 'observed')
    expect(observed).toHaveLength(0)
  })

  it('QA-SC-ROUT-001: no output has confidence "inferred" (output patch is always not_verifiable)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    const inferred = patchRouter.analogOutputs.filter((o) => o.confidence === 'inferred')
    expect(inferred).toHaveLength(0)
  })
})

// ─── REQ-F-ROUT-001 (#31): Channel send routing on real hardware ─────────────

describe.skipIf(!HIL)('routing-confidence HIL — channel send routing (REQ-F-ROUT-001 #31)', () => {
  /**
   * Verifies: REQ-F-ROUT-001 (#31) — Channel send routing extraction
   * Observed keys from real 32SC:
   *   line.ch1.sub1=1, sub2=1, sub3=0, sub4=0
   *   line.ch1.lr=0 (NOT assigned to main LR)
   */

  it('extractChannelSendRouting returns non-null for real CH1', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')
    expect(routing, 'extractChannelSendRouting returned null — no routing keys for line.ch1').toBeDefined()
  })

  it('parameterConfidence is "inferred" — NEVER "observed" on Layer A sends', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')!
    expect(
      routing.parameterConfidence,
      `parameterConfidence "${routing.parameterConfidence}" — must be "inferred", never "observed"`,
    ).toBe('inferred')
  })

  it('auxSends is non-empty (CH1 has sends to at least one AUX bus)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')!
    expect(routing.auxSends.length).toBeGreaterThanOrEqual(1)
  })

  it('fxSends has exactly 8 entries (FXA-FXH all present on 32SC)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')!
    expect(routing.fxSends.length).toBe(8)
    expect(routing.fxSends.map((s) => s.fxBus).sort()).toEqual(['FXA', 'FXB', 'FXC', 'FXD', 'FXE', 'FXF', 'FXG', 'FXH'])
  })

  it('subgroupAssigns has 4 entries (sub1-sub4)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')!
    expect(routing.subgroupAssigns.length).toBe(4)
  })

  it('subgroupAssigns has 4 entries with boolean assigned fields (structural check)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')!
    expect(routing.subgroupAssigns.length).toBe(4)
    for (const sa of routing.subgroupAssigns) {
      expect(sa.subBus).toBeGreaterThanOrEqual(1)
      expect(sa.subBus).toBeLessThanOrEqual(4)
      expect(typeof sa.assigned).toBe('boolean')
    }
  })

  it('mainLrAssigned is boolean or undefined — never a non-boolean', () => {
    // The specific value depends on the current show setup; just verify it\'s a valid type.
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')!
    const lr = routing.mainLrAssigned
    expect(lr === true || lr === false || lr === undefined).toBe(true)
  })

  it('all AUX send levels are in 0-1 range (not 0-100 scale — unlike master levels)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')!
    for (const send of routing.auxSends) {
      expect(send.sendLevelLinear).toBeGreaterThanOrEqual(0)
      expect(send.sendLevelLinear).toBeLessThanOrEqual(1)
    }
  })
})
