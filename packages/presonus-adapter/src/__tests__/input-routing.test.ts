/**
 * Tests for extractInputRouting() — per-channel input source routing.
 *
 * HIL Evidence: captures/probe-input-source/ (StudioLive 32SC fw 3.3.0.109659, 2026-07-01)
 *   Key confirmed: line.chN.inputsrc.value
 *   Index 0 = 'Local' (observed), Index 1 = 'Stage Box' (observed by user action Local→Stage Box)
 *   Indices 2–3 = probe_required (labels unknown)
 *
 * TDD:
 *   RED  = extractInputRouting returns undefined (stub)
 *   GREEN = extractInputRouting returns InputRoutingReport with correct channel data
 *
 * @implements #45 REQ-F-ROUT-011 — input routing observable after HIL probe
 * @verifies #45 REQ-F-ROUT-011 — line.chN.inputsrc.value decoded correctly
 * @architecture #47 ADR-008: Layer B → Layer A promotion
 * Traces to: #33 REQ-F-ROUT-003
 */
import { describe, it, expect } from 'vitest'
import { extractInputRouting } from '../state-mapper.js'

// ---------------------------------------------------------------------------
// Synthetic flat states from real probe captures (2026-07-01)
// Before: channels at Local (index 0)
// After: Ch1–Ch12 at Stage Box (index 1, value ≈ 0.333)
// ---------------------------------------------------------------------------

/** Before-state: all channels at Local (index 0, value 0) */
const beforeFlatState: Record<string, unknown> = {
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.3.0.109659',
  'line.ch1.inputsrc.value': 0,   // index 0 = Local (confirmed)
  'line.ch2.inputsrc.value': 0,
  'line.ch3.inputsrc.value': 0,
}

/** After-state: Ch1–Ch12 switched to Stage Box (index 1, value ≈ 1/3) */
const afterFlatState: Record<string, unknown> = {
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.3.0.109659',
  'line.ch1.inputsrc.value':  0.3333333432674408,  // index 1 = Stage Box (confirmed)
  'line.ch2.inputsrc.value':  0.3333333432674408,
  'line.ch3.inputsrc.value':  0.3333333432674408,
  'line.ch4.inputsrc.value':  0.3333333432674408,
  'line.ch5.inputsrc.value':  0.3333333432674408,
  'line.ch6.inputsrc.value':  0.3333333432674408,
  'line.ch7.inputsrc.value':  0.3333333432674408,
  'line.ch8.inputsrc.value':  0.3333333432674408,
  'line.ch9.inputsrc.value':  0.3333333432674408,
  'line.ch10.inputsrc.value': 0.3333333432674408,
  'line.ch11.inputsrc.value': 0.3333333432674408,
  'line.ch12.inputsrc.value': 0.3333333432674408,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractInputRouting — REQ-F-ROUT-011 (#45)', () => {
  it('returns undefined when no inputsrc keys are present', () => {
    /**
     * Given: empty flat state
     * When:  extractInputRouting is called
     * Then:  returns undefined (no routing data available)
     */
    expect(extractInputRouting({})).toBeUndefined()
    expect(extractInputRouting({ 'line.ch1.mute': false })).toBeUndefined()
  })

  it('returns inferred confidence report when inputsrc keys are present', () => {
    /**
     * Given: flat state with line.chN.inputsrc.value keys
     * When:  extractInputRouting is called
     * Then:  returns InputRoutingReport with confidence='inferred'
     */
    const result = extractInputRouting(beforeFlatState)
    expect(result).toBeDefined()
    expect(result!.confidence).toBe('inferred')
  })

  it('index 0 = Local: value 0 → inputSourceIndex 0, inputSourceLabel "Local"', () => {
    /**
     * Given: ch1 inputsrc.value = 0 (before-state, Local)
     * When:  extractInputRouting is called
     * Then:  ch1 inputSourceIndex = 0, inputSourceLabel = 'Local'
     * HIL evidence: before-state captures/probe-input-source/before.json ch1 value=0
     */
    const result = extractInputRouting(beforeFlatState)!
    const ch1 = result.channels.find((c) => c.channelNumber === 1)
    expect(ch1).toBeDefined()
    expect(ch1!.inputSourceIndex).toBe(0)
    expect(ch1!.inputSourceLabel).toBe('Local')
  })

  it('index 1 = Stage Box: value ≈1/3 → inputSourceIndex 1, inputSourceLabel "Stage Box"', () => {
    /**
     * Given: ch1 inputsrc.value = 0.333... (after-state, Stage Box)
     * When:  extractInputRouting is called
     * Then:  ch1 inputSourceIndex = 1, inputSourceLabel = 'Stage Box'
     * HIL evidence: user changed Ch1 Local→Stage Box, after value = 0.3333333432674408
     */
    const result = extractInputRouting(afterFlatState)!
    const ch1 = result.channels.find((c) => c.channelNumber === 1)
    expect(ch1).toBeDefined()
    expect(ch1!.inputSourceIndex).toBe(1)
    expect(ch1!.inputSourceLabel).toBe('Stage Box')
  })

  it('all extracted channels have confidence = inferred', () => {
    const result = extractInputRouting(afterFlatState)!
    for (const ch of result.channels) {
      expect(ch.confidence).toBe('inferred')
    }
  })

  it('returns only channels that have inputsrc keys — no phantom channels', () => {
    /**
     * Given: afterFlatState has keys for ch1–ch12 only
     * Then:  channels.length = 12, all channel numbers 1–12
     */
    const result = extractInputRouting(afterFlatState)!
    expect(result.channels.length).toBe(12)
    expect(result.channels.every((c) => c.channelNumber >= 1 && c.channelNumber <= 32)).toBe(true)
  })

  it('rawValue preserved: ch1 rawValue matches actual capture value', () => {
    const result = extractInputRouting(afterFlatState)!
    const ch1 = result.channels.find((c) => c.channelNumber === 1)!
    expect(ch1.rawValue).toBeCloseTo(0.3333333432674408, 6)
  })

  it('extracts mixer serial and firmware from flat state', () => {
    const result = extractInputRouting(afterFlatState)!
    expect(result.mixerSerial).toBe('SD7E21010066')
    expect(result.firmware).toBe('3.3.0.109659')
  })
})
