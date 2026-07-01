/**
 * Mock tests for routing confidence model — output patch router extraction and QA-SC-ROUT-001.
 *
 * Uses REALISTIC fixture values from captures/2026-06-24/SD7E21010066/state-full.json.
 *
 * FIXTURE NOTES (from HIL captures):
 *   outputpatchrouter.mix1_src.value = 0              → sourceIndex = 0
 *   outputpatchrouter.mix2_src.value = 0.03703703...  → sourceIndex = 1 (Math.round(0.037 × 27))
 *   outputpatchrouter.mix3_src.value = 0.07407407...  → sourceIndex = 2
 *   outputpatchrouter.mix4_src.value = 0.11111111...  → sourceIndex = 3
 *   All confidence fields = 'not_verifiable_with_current_adapter' (Layer B invariant)
 *   All sourceNames = null (unresolved without probe session)
 *
 * @implements REQ-F-ROUT-007 (#37) — Output patch router extraction
 * @implements QA-SC-ROUT-001 (#49) — Confidence never misrepresented
 * @implements TEST-ROUT-007 (#51) — Output patch router extraction test
 * @verifies #37 REQ-F-ROUT-007 — output patch router extraction and confidence fields
 * @verifies #49 QA-SC-ROUT-001 — routing confidence never misrepresented as observed
 * Traces to: #3 (StR: Soundcheck assistance)
 */
import { describe, it, expect } from 'vitest'
import { extractOutputPatchRouter, extractChannelSendRouting } from '../state-mapper.js'

// ---------------------------------------------------------------------------
// Realistic fixture from real StudioLive 32SC capture (2026-06-24)
// Formula: sourceIndex = Math.round(value × range.max) where range.max = 27
// ---------------------------------------------------------------------------
const realOutputPatchFlat: Record<string, unknown> = {
  // mix1 → sourceIndex = Math.round(0 × 27) = 0
  'outputpatchrouter.mix1_src.value': 0,
  'outputpatchrouter.mix1_src.range.max': 27,
  // mix2 → sourceIndex = Math.round(0.03703703731298447 × 27) = Math.round(1.0) = 1
  'outputpatchrouter.mix2_src.value': 0.03703703731298447,
  'outputpatchrouter.mix2_src.range.max': 27,
  // mix3 → sourceIndex = Math.round(0.07407407462596893 × 27) = Math.round(2.0) = 2
  'outputpatchrouter.mix3_src.value': 0.07407407462596893,
  'outputpatchrouter.mix3_src.range.max': 27,
  // mix4 → sourceIndex = Math.round(0.1111111119389534 × 27) = Math.round(3.0) = 3
  'outputpatchrouter.mix4_src.value': 0.1111111119389534,
  'outputpatchrouter.mix4_src.range.max': 27,
  // mix5 → sourceIndex = Math.round(0.14814814925193787 × 27) = Math.round(4.0) = 4
  'outputpatchrouter.mix5_src.value': 0.14814814925193787,
  'outputpatchrouter.mix5_src.range.max': 27,
}

/** Realistic channel send routing from real capture */
const ch1SendFlat: Record<string, unknown> = {
  'line.ch1.aux1': 0,
  'line.ch1.assign_aux1': true,
  'line.ch1.FXA': 0, 'line.ch1.FXB': 0, 'line.ch1.FXC': 0, 'line.ch1.FXD': 0,
  'line.ch1.FXE': 0, 'line.ch1.FXF': 0, 'line.ch1.FXG': 0, 'line.ch1.FXH': 0,
  // sub1=1, sub2=1 (assigned); sub3=0, sub4=0 (not assigned) — from real capture
  'line.ch1.sub1': 1,
  'line.ch1.sub2': 1,
  'line.ch1.sub3': 0,
  'line.ch1.sub4': 0,
  'line.ch1.lr': 0,   // NOT assigned to main LR
}

// ---------------------------------------------------------------------------
// REQ-F-ROUT-007 (#37) / TEST #51: Output patch router extraction
// ---------------------------------------------------------------------------

describe('extractOutputPatchRouter — realistic fixture (REQ-F-ROUT-007 #37, TEST #51)', () => {
  /**
   * Verifies: REQ-F-ROUT-007 (#37), TEST-ROUT-007 (#51)
   * Traces to: #3
   */

  it('returns 5 analog outputs from partial fixture', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')
    expect(result).toBeDefined()
    expect(result!.analogOutputs.length).toBe(5)
  })

  it('mix1 sourceIndex = 0 (Math.round(0 × 27) = 0)', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    const mix1 = result.analogOutputs.find((o) => o.outputIndex === 1)!
    expect(mix1.sourceIndex).toBe(0)
  })

  it('mix2 sourceIndex = 1 (Math.round(0.037037 × 27) = Math.round(0.999) = 1)', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    const mix2 = result.analogOutputs.find((o) => o.outputIndex === 2)!
    expect(mix2.sourceIndex).toBe(1)
  })

  it('mix3 sourceIndex = 2, mix4 = 3, mix5 = 4 (sequential mapping)', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    for (const [idx, expected] of [[3, 2], [4, 3], [5, 4]] as const) {
      const output = result.analogOutputs.find((o) => o.outputIndex === idx)!
      expect(output.sourceIndex).toBe(expected)
    }
  })

  it('all sourceIndex values are non-negative integers', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    for (const output of result.analogOutputs) {
      expect(Number.isInteger(output.sourceIndex)).toBe(true)
      expect(output.sourceIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it('outputIndex matches key position (mix1→1, mix2→2, etc.)', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    const outputIndexes = result.analogOutputs.map((o) => o.outputIndex).sort((a, b) => a - b)
    expect(outputIndexes).toEqual([1, 2, 3, 4, 5])
  })

  it('returns undefined when no outputpatchrouter.* keys present', () => {
    const result = extractOutputPatchRouter({}, 'test-device')
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// QA-SC-ROUT-001 (#49): Routing confidence NEVER misrepresents Layer B
// ---------------------------------------------------------------------------

describe('QA-SC-ROUT-001 — Layer B confidence invariant (#49, ADR-008 #47)', () => {
  /**
   * QA-SC-ROUT-001: "Routing confidence propagation — unverified routes never misrepresented"
   *
   * INVARIANT:
   *   - Output patch outputs: ALWAYS 'not_verifiable_with_current_adapter'
   *   - Never 'observed' or 'inferred' for output patch (Layer B)
   *   - Channel send routing: ALWAYS 'inferred' (never 'observed' until probe)
   *
   * Verifies: QA-SC-ROUT-001 (#49), ADR-008 (#47)
   * Traces to: #3
   */

  it('QA-SC-ROUT-001: ALL output patch outputs have not_verifiable confidence', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    for (const output of result.analogOutputs) {
      expect(
        output.confidence,
        `output ${output.outputIndex} has confidence "${output.confidence}"`,
      ).toBe('not_verifiable_with_current_adapter')
    }
  })

  it('QA-SC-ROUT-001: globalConfidence is not_verifiable_with_current_adapter', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    expect(result.globalConfidence).toBe('not_verifiable_with_current_adapter')
  })

  it('QA-SC-ROUT-001: all sourceName fields are null (not populated without probe)', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    for (const output of result.analogOutputs) {
      expect(output.sourceName).toBeNull()
    }
  })

  it('QA-SC-ROUT-001: no output has confidence "observed" without a probe session', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    const observed = result.analogOutputs.filter((o) => o.confidence === 'observed')
    expect(observed).toHaveLength(0)
  })

  it('QA-SC-ROUT-001: no output has confidence "inferred" (output patch is always not_verifiable)', () => {
    const result = extractOutputPatchRouter(realOutputPatchFlat, 'test-device')!
    const inferred = result.analogOutputs.filter((o) => o.confidence === 'inferred')
    expect(inferred).toHaveLength(0)
  })

  it('QA-SC-ROUT-001: channel send routing parameterConfidence is "inferred", not "observed"', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.parameterConfidence).toBe('inferred')
    // 'inferred' = we can read the value but haven't probe-confirmed the formula
    // 'observed' would mean probe-confirmed, which hasn't happened
    expect(result.parameterConfidence).not.toBe('observed')
  })

  it('QA-SC-ROUT-001: parameterConfidence is never "not_verifiable" for Layer A sends', () => {
    // Layer A sends (channel-to-aux, channel-to-fx) ARE observable in software
    // They must not be 'not_verifiable' — that label is reserved for Layer B
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.parameterConfidence).not.toBe('not_verifiable_with_current_adapter')
  })
})

// ---------------------------------------------------------------------------
// REQ-F-ROUT-001 (#31): Channel send routing fixture validation
// ---------------------------------------------------------------------------

describe('extractChannelSendRouting — realistic fixture (REQ-F-ROUT-001 #31)', () => {
  /**
   * Verifies: REQ-F-ROUT-001 (#31)
   * Traces to: #3
   */

  it('parameterConfidence is "inferred" (ADR-008: Layer A observable, formula unverified)', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.parameterConfidence).toBe('inferred')
  })

  it('subgroupAssigns has 4 entries from real capture keys (sub1-sub4)', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.subgroupAssigns.length).toBe(4)
  })

  it('sub1 and sub2 assigned=true from real capture (sub1=1, sub2=1)', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.subgroupAssigns.find((s) => s.subBus === 1)!.assigned).toBe(true)
    expect(result.subgroupAssigns.find((s) => s.subBus === 2)!.assigned).toBe(true)
  })

  it('sub3 and sub4 assigned=false from real capture (sub3=0, sub4=0)', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.subgroupAssigns.find((s) => s.subBus === 3)!.assigned).toBe(false)
    expect(result.subgroupAssigns.find((s) => s.subBus === 4)!.assigned).toBe(false)
  })

  it('mainLrAssigned=false (line.ch1.lr=0 in real capture — not assigned to main LR)', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.mainLrAssigned).toBe(false)
  })

  it('fxSends has 8 entries (FXA-FXH)', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    expect(result.fxSends.length).toBe(8)
  })

  it('all FX send levels are 0 (all zero in real capture)', () => {
    const result = extractChannelSendRouting(ch1SendFlat, 'line.ch1')!
    for (const fx of result.fxSends) {
      expect(fx.sendLevelLinear).toBe(0)
    }
  })
})
