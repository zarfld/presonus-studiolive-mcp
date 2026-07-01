/**
 * Tests for extractInputRouting() — per-channel input source routing.
 *
 * HIL Evidence: captures/probe-input-source/ + captures/probe-idx23/ (StudioLive 32SC fw 3.4.0.111374, 2026-07-01)
 *   Key confirmed: line.chN.inputsrc.value
 *   Index 0 = 'Local'     (value 0     — observed, default state)
 *   Index 1 = 'Stage Box' (value ≈1/3  — observed, user changed Ch1 Local→Stage Box)
 *   Index 2 = 'USB'       (value ≈2/3  — observed 2026-07-01, Ch25-28/31-32 confirmed via UC Surface)
 *   Index 3 = 'SD Card'   (value 1.0   — observed 2026-07-01, Ch17-22/24/29-30 confirmed via UC Surface;
 *                                         Ch17 changed SD Card→USB confirmed by diff: 1.0→0.667)
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
// ---------------------------------------------------------------------------

/** Before-state: all channels at Local (index 0, value 0) */
const beforeFlatState: Record<string, unknown> = {
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.4.0.111374',
  'line.ch1.inputsrc.value': 0,   // index 0 = Local (confirmed)
  'line.ch2.inputsrc.value': 0,
  'line.ch3.inputsrc.value': 0,
}

/** After-state: Ch1–Ch12 switched to Stage Box (index 1, value ≈ 1/3) */
const afterFlatState: Record<string, unknown> = {
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.4.0.111374',
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

/**
 * All-four-indices fixture derived from captures/probe-idx23/baseline.json
 * (StudioLive 32SC SD7E21010066, fw 3.4.0.111374, 2026-07-01)
 *
 * UC Surface labels confirmed directly:
 *   Ch13 = index 0 = Local     (value 0.0000)
 *   Ch1  = index 1 = Stage Box (value 0.3333)
 *   Ch25 = index 2 = USB       (value 0.6667, confirmed on Ch25-28/31-32)
 *   Ch17 = index 3 = SD Card   (value 1.0000, confirmed on Ch17-22/24/29-30;
 *                                Ch17 changed SD Card→USB confirmed by probe diff)
 */
const allFourIndicesFlatState: Record<string, unknown> = {
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.4.0.111374',
  'line.ch13.inputsrc.value': 0,                     // index 0 = Local
  'line.ch1.inputsrc.value':  0.3333333432674408,    // index 1 = Stage Box
  'line.ch25.inputsrc.value': 0.6666666865348816,    // index 2 = USB (confirmed)
  'line.ch17.inputsrc.value': 1,                     // index 3 = SD Card (confirmed)
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
    expect(result.firmware).toBe('3.4.0.111374')
  })

  // ---------------------------------------------------------------------------
  // Indices 2 and 3 — HIL-confirmed labels (2026-07-01)
  //   Index 2 = 'USB'     — confirmed on Ch25-28/31-32 via UC Surface
  //   Index 3 = 'SD Card' — confirmed on Ch17-22/24/29-30 via UC Surface;
  //                          Ch17 changed SD Card→USB confirmed by probe diff (1.0→0.667)
  //   Evidence: captures/probe-idx23/baseline.json + after-ch17-usb.json
  // ---------------------------------------------------------------------------

  it('index 2 = USB: value ≈2/3 → inputSourceIndex 2, inputSourceLabel "USB"', () => {
    /**
     * Verifies: #45 REQ-F-ROUT-011 — index 2 label = 'USB'
     * HIL evidence: Ch25 at value 0.6666... confirmed as USB in UC Surface (2026-07-01)
     *               Ch17 changed from SD Card (1.0) to USB (0.667) confirmed by probe diff
     */
    const result = extractInputRouting(allFourIndicesFlatState)!
    const ch25 = result.channels.find((c) => c.channelNumber === 25)
    expect(ch25).toBeDefined()
    expect(ch25!.inputSourceIndex).toBe(2)
    expect(ch25!.inputSourceLabel).toBe('USB')
  })

  it('index 3 = SD Card: value 1.0 → inputSourceIndex 3, inputSourceLabel "SD Card"', () => {
    /**
     * Verifies: #45 REQ-F-ROUT-011 — index 3 label = 'SD Card'
     * HIL evidence: Ch17 at value 1.0 confirmed as SD Card in UC Surface (2026-07-01)
     *               Ch17 changed SD Card→USB: inputsrc.value went 1 → 0.6666... (probe diff confirmed)
     */
    const result = extractInputRouting(allFourIndicesFlatState)!
    const ch17 = result.channels.find((c) => c.channelNumber === 17)
    expect(ch17).toBeDefined()
    expect(ch17!.inputSourceIndex).toBe(3)
    expect(ch17!.inputSourceLabel).toBe('SD Card')
  })

  it('all four indices decoded from the all-four-indices fixture', () => {
    /**
     * Verifies: #45 REQ-F-ROUT-011 — complete label mapping confirmed by HIL probe
     * Ch13=Local, Ch1=Stage Box, Ch25=USB, Ch17=SD Card
     */
    const result = extractInputRouting(allFourIndicesFlatState)!
    const byChannel = Object.fromEntries(result.channels.map((c) => [c.channelNumber, c]))
    expect(byChannel[13]!.inputSourceLabel).toBe('Local')
    expect(byChannel[1]!.inputSourceLabel).toBe('Stage Box')
    expect(byChannel[25]!.inputSourceLabel).toBe('USB')
    expect(byChannel[17]!.inputSourceLabel).toBe('SD Card')
  })
})
