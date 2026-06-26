/**
 * Tests for routing state extraction and routing tools.
 *
 * Implements: #31 REQ-F-ROUT-001, #32 REQ-F-ROUT-002, #33 REQ-F-ROUT-003
 *             #34 REQ-F-ROUT-004, #35 REQ-F-ROUT-005, #36 REQ-F-ROUT-006
 *             #37 REQ-F-ROUT-007, #30 REQ-NF-ROUT-001
 * Architecture: #29 ADR-007
 *
 * TDD — tests written before implementation is complete.
 * Fixture values taken directly from captures/2026-06-24/SD7E21010066/state-full.json
 * OBSERVED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24)
 */
import { describe, it, expect } from 'vitest'
import { extractChannelSendRouting, extractOutputPatchRouter } from '../state-mapper.js'

// ---------------------------------------------------------------------------
// Synthetic flat state from real capture values
// ---------------------------------------------------------------------------

/** Real capture values for line.ch1 — StudioLive 32SC fw 3.3.0.109659 */
const ch1FlatState: Record<string, unknown> = {
  // AUX sends: mix of assigned (true) and not assigned (false), various send levels
  'line.ch1.aux1': 0,
  'line.ch1.aux2': 0.025390625,
  'line.ch1.aux3': 0.031249994412064552,
  'line.ch1.aux4': 0,
  'line.ch1.aux5': 0.5235602259635925,
  'line.ch1.aux6': 0,
  'line.ch1.aux7': 0,
  'line.ch1.aux8': 0,
  'line.ch1.aux9': 0,
  // (aux10–32 = 0 for brevity; real state has all 32)
  'line.ch1.assign_aux1': true,
  'line.ch1.assign_aux2': true,
  'line.ch1.assign_aux3': true,
  'line.ch1.assign_aux4': true,
  'line.ch1.assign_aux5': true,
  'line.ch1.assign_aux6': true,
  'line.ch1.assign_aux7': true,
  'line.ch1.assign_aux8': true,
  'line.ch1.assign_aux9': false,
  // FX sends (all zero in capture)
  'line.ch1.FXA': 0,
  'line.ch1.FXB': 0,
  'line.ch1.FXC': 0,
  'line.ch1.FXD': 0,
  'line.ch1.FXE': 0,
  'line.ch1.FXF': 0,
  'line.ch1.FXG': 0,
  'line.ch1.FXH': 0,
  // Subgroup assigns (sub1=1, sub2=1, sub3=0, sub4=0 in capture)
  'line.ch1.sub1': 1,
  'line.ch1.sub2': 1,
  'line.ch1.sub3': 0,
  'line.ch1.sub4': 0,
  // Main LR
  'line.ch1.lr': 0,
}

/** Real output patch router values from the 32SC capture */
const outputPatchFlat: Record<string, unknown> = {
  'outputpatchrouter.mix1_src.value': 0,
  'outputpatchrouter.mix1_src.range.max': 27,
  'outputpatchrouter.mix2_src.value': 0.03703703731298447,
  'outputpatchrouter.mix2_src.range.max': 27,
  'outputpatchrouter.mix3_src.value': 0.07407407462596893,
  'outputpatchrouter.mix3_src.range.max': 27,
  'outputpatchrouter.mix4_src.value': 0.1111111119389534,
  'outputpatchrouter.mix4_src.range.max': 27,
  'outputpatchrouter.mix5_src.value': 0.14814814925193787,
  'outputpatchrouter.mix5_src.range.max': 27,
}

// ---------------------------------------------------------------------------
// extractChannelSendRouting — REQ-F-ROUT-001 (#31)
// ---------------------------------------------------------------------------

describe('extractChannelSendRouting — REQ-F-ROUT-001 (#31)', () => {
  it('returns undefined when no AUX send keys present', () => {
    expect(extractChannelSendRouting({}, 'line.ch1')).toBeUndefined()
    expect(extractChannelSendRouting({ 'line.ch1.mute': false }, 'line.ch1')).toBeUndefined()
  })

  it('extracts all 9 AUX sends from partial state', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')
    expect(result).toBeDefined()
    expect(result!.auxSends.length).toBe(9)  // aux1–aux9 in test fixture
  })

  it('aux5 send level matches capture value 0.5235602...', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    const aux5 = result.auxSends.find((s) => s.auxBus === 5)
    expect(aux5).toBeDefined()
    expect(aux5!.sendLevelLinear).toBeCloseTo(0.5235602, 5)
  })

  it('aux5 is assigned (assign_aux5 = true)', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    const aux5 = result.auxSends.find((s) => s.auxBus === 5)!
    expect(aux5.assigned).toBe(true)
  })

  it('aux9 is NOT assigned (assign_aux9 = false)', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    const aux9 = result.auxSends.find((s) => s.auxBus === 9)!
    expect(aux9.assigned).toBe(false)
  })

  it('extracts 8 FX sends (FXA–FXH)', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    expect(result.fxSends.length).toBe(8)
    expect(result.fxSends.map((s) => s.fxBus)).toContain('FXA')
    expect(result.fxSends.map((s) => s.fxBus)).toContain('FXH')
  })

  it('extracts 4 subgroup assignments', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    expect(result.subgroupAssigns.length).toBe(4)
  })

  it('sub1 and sub2 are assigned (value=1), sub3 and sub4 not (value=0)', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    expect(result.subgroupAssigns.find((s) => s.subBus === 1)!.assigned).toBe(true)
    expect(result.subgroupAssigns.find((s) => s.subBus === 2)!.assigned).toBe(true)
    expect(result.subgroupAssigns.find((s) => s.subBus === 3)!.assigned).toBe(false)
    expect(result.subgroupAssigns.find((s) => s.subBus === 4)!.assigned).toBe(false)
  })

  it('mainLrAssigned is false (lr = 0 in capture)', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    expect(result.mainLrAssigned).toBe(false)
  })

  it('parameterConfidence is inferred (send level formula unverified)', () => {
    const result = extractChannelSendRouting(ch1FlatState, 'line.ch1')!
    expect(result.parameterConfidence).toBe('inferred')
  })

  it('send level values are clamped to [0, 1]', () => {
    const flat = { 'line.ch1.aux1': 1.5, 'line.ch1.assign_aux1': true }
    const result = extractChannelSendRouting(flat, 'line.ch1')!
    expect(result.auxSends[0]!.sendLevelLinear).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------
// extractOutputPatchRouter — REQ-F-ROUT-007 (#37) + REQ-NF-ROUT-001 (#30)
// ---------------------------------------------------------------------------

describe('extractOutputPatchRouter — REQ-F-ROUT-007 (#37)', () => {
  it('returns undefined when no output patch keys present', () => {
    expect(extractOutputPatchRouter({}, 'test-device')).toBeUndefined()
  })

  it('extracts 5 analog outputs from partial fixture', () => {
    const result = extractOutputPatchRouter(outputPatchFlat, 'test-device')
    expect(result).toBeDefined()
    expect(result!.analogOutputs.length).toBe(5)
  })

  it('mix1_src sourceIndex = 0 (value=0, max=27)', () => {
    const result = extractOutputPatchRouter(outputPatchFlat, 'test-device')!
    expect(result.analogOutputs[0]!.outputIndex).toBe(1)
    expect(result.analogOutputs[0]!.sourceIndex).toBe(0)
  })

  it('mix2_src sourceIndex = 1 (Math.round(0.037 * 27) = 1)', () => {
    const result = extractOutputPatchRouter(outputPatchFlat, 'test-device')!
    const out2 = result.analogOutputs.find((o) => o.outputIndex === 2)!
    expect(out2.sourceIndex).toBe(1)
  })

  it('mix3_src sourceIndex = 2 (Math.round(0.074 * 27) = 2)', () => {
    const result = extractOutputPatchRouter(outputPatchFlat, 'test-device')!
    const out3 = result.analogOutputs.find((o) => o.outputIndex === 3)!
    expect(out3.sourceIndex).toBe(2)
  })

  it('sourceName is null until probe confirms mapping — REQ-NF-ROUT-001 (#30)', () => {
    const result = extractOutputPatchRouter(outputPatchFlat, 'test-device')!
    for (const output of result.analogOutputs) {
      expect(output.sourceName).toBeNull()
    }
  })

  it('confidence is not_verifiable_with_current_adapter — REQ-NF-ROUT-001 (#30)', () => {
    const result = extractOutputPatchRouter(outputPatchFlat, 'test-device')!
    for (const output of result.analogOutputs) {
      expect(output.confidence).toBe('not_verifiable_with_current_adapter')
    }
    expect(result.globalConfidence).toBe('not_verifiable_with_current_adapter')
  })
})

// ---------------------------------------------------------------------------
// Send routing excluded from rawExtra — REQ-F-ROUT-001 (#31)
// ---------------------------------------------------------------------------

import { extractLineChannels } from '../state-mapper.js'

describe('Send routing keys not in rawExtra', () => {
  it('AUX send keys do not appear in rawExtra', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.mute': false,
      'line.ch1.aux1': 0.5,
      'line.ch1.assign_aux1': true,
      'line.ch1.FXA': 0,
      'line.ch1.sub1': 1,
      'line.ch1.lr': 0,
    }
    const channels = extractLineChannels(flat)
    const ch1 = channels.find((c) => c.id === 'line.ch1')!
    expect(ch1.rawExtra?.['line.ch1.aux1']).toBeUndefined()
    expect(ch1.rawExtra?.['line.ch1.assign_aux1']).toBeUndefined()
    expect(ch1.rawExtra?.['line.ch1.FXA']).toBeUndefined()
    expect(ch1.rawExtra?.['line.ch1.sub1']).toBeUndefined()
  })

  it('sendRouting is populated on channel', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.mute': false,
      'line.ch1.aux1': 0.5,
      'line.ch1.assign_aux1': true,
    }
    const channels = extractLineChannels(flat)
    const ch1 = channels.find((c) => c.id === 'line.ch1')!
    expect(ch1.sendRouting).toBeDefined()
    expect(ch1.sendRouting!.auxSends.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// FX send assignment extraction — REQ-F-ROUT-009 (#53)
// ---------------------------------------------------------------------------

describe('FX send assignment extraction (REQ-F-ROUT-009 #53)', () => {
  /**
   * Verifies: REQ-F-ROUT-009 (#53) — FX send assignment extraction
   * Traces to: #3 (StR: Soundcheck assistance)
   *
   * OBSERVED: Real StudioLive 32SC uses two SEPARATE key patterns for FX sends:
   *   - Send level:  line.chN.FXA  (uppercase letter A-H)
   *   - Assignment:  line.chN.assign_fx1  (lowercase with number 1-8)
   * Both must be read to determine if a channel is assigned to an FX bus.
   */

  it('FX sends extracted from line.chN.FXA-H uppercase keys (8 sends)', () => {
    const flat: Record<string, unknown> = {
      // Minimal AUX key required — extractChannelSendRouting returns undefined without it
      'line.ch1.aux1': 0, 'line.ch1.assign_aux1': true,
      'line.ch1.FXA': 0,
      'line.ch1.FXB': 0.3,
      'line.ch1.FXC': 0,
      'line.ch1.FXD': 0,
      'line.ch1.FXE': 0,
      'line.ch1.FXF': 0,
      'line.ch1.FXG': 0,
      'line.ch1.FXH': 0.7,
    }
    const result = extractChannelSendRouting(flat, 'line.ch1')!
    expect(result.fxSends.length).toBe(8)
    expect(result.fxSends.map((s) => s.fxBus)).toEqual(['FXA', 'FXB', 'FXC', 'FXD', 'FXE', 'FXF', 'FXG', 'FXH'])
  })

  it('FX send level FXB=0.3 is extracted correctly', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux1': 0, 'line.ch1.assign_aux1': true,
      'line.ch1.FXA': 0,
      'line.ch1.FXB': 0.3,
      'line.ch1.FXC': 0, 'line.ch1.FXD': 0, 'line.ch1.FXE': 0,
      'line.ch1.FXF': 0, 'line.ch1.FXG': 0, 'line.ch1.FXH': 0,
    }
    const result = extractChannelSendRouting(flat, 'line.ch1')!
    const fxB = result.fxSends.find((s) => s.fxBus === 'FXB')!
    expect(fxB.sendLevelLinear).toBeCloseTo(0.3)
  })

  it('FX sends on real capture fixture (all FXA-FXH present with assign_fx1-8=true)', () => {
    // Realistic fixture from real capture (2026-06-24): all 8 FX buses assigned
    const realisticFxFlat: Record<string, unknown> = {
      // AUX send needed for presence check; real channels always have AUX keys too
      'line.ch1.aux1': 0, 'line.ch1.assign_aux1': true,
      'line.ch1.FXA': 0, 'line.ch1.FXB': 0, 'line.ch1.FXC': 0, 'line.ch1.FXD': 0,
      'line.ch1.FXE': 0, 'line.ch1.FXF': 0, 'line.ch1.FXG': 0, 'line.ch1.FXH': 0,
      // Assignment keys use number (1-8), NOT letter (A-H) — observed in capture
      'line.ch1.assign_fx1': true,
      'line.ch1.assign_fx2': true,
      'line.ch1.assign_fx3': true,
      'line.ch1.assign_fx4': true,
      'line.ch1.assign_fx5': true,
      'line.ch1.assign_fx6': true,
      'line.ch1.assign_fx7': true,
      'line.ch1.assign_fx8': true,
    }
    const result = extractChannelSendRouting(realisticFxFlat, 'line.ch1')!
    expect(result.fxSends.length).toBe(8)
    // All FX send entries should be present regardless of assignment key format
    for (const fxSend of result.fxSends) {
      expect(fxSend.sendLevelLinear).toBe(0)  // all zero in this capture
    }
  })
})

