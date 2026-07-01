/**
 * Tests for extractAvbStreamRouting() — AVB stream block source assignments.
 *
 * HIL Evidence: captures/probe-avb/ (StudioLive 32SC + StudioLive 32R, fw 3.4.0.111374, 2026-07-01)
 *   Keys confirmed: stageboxsetup.avb_src_{range}.value + .strings
 *   User changed two stream assignments (avb_src_9_16 ↔ avb_src_17_24 swapped)
 *   Labels fully known from stageboxsetup.avb_src_*.strings array
 *   Confidence: observed (key + value + labels all confirmed)
 *
 * TDD:
 *   RED  = extractAvbStreamRouting returns undefined (stub)
 *   GREEN = extractAvbStreamRouting returns AvbStreamRouting with correct block data
 *
 * @implements #45 REQ-F-ROUT-011 — AVB routing observable after HIL probe
 * @verifies #45 REQ-F-ROUT-011 — stageboxsetup.avb_src_{range}.value decoded correctly
 * @architecture #47 ADR-008: Layer B → Layer A promotion
 * Traces to: #34 REQ-F-ROUT-004
 */
import { describe, it, expect } from 'vitest'
import { extractAvbStreamRouting } from '../state-mapper.js'

// ---------------------------------------------------------------------------
// Synthetic flat states from real probe captures (2026-07-01)
// Default stream labels are device-specific (PreSonus StudioLive 32R)
// ---------------------------------------------------------------------------

const LABELS_1_8 = [
  'None',
  'PreSonus StudioLive 32R:Send 1-8',
  'PreSonus StudioLive 32R:Send 9-16',
  'PreSonus StudioLive 32R:Send 17-24',
  'PreSonus StudioLive 32R:Send 25-32',
  'PreSonus StudioLive 32R:Send 33-40',
  'PreSonus StudioLive 32R:Send 41-48',
  'PreSonus StudioLive 32R:Send 49-56',
  'PreSonus StudioLive 32R:Send 57-64',
]

/** Before: default sequential mapping (block 1→stream 1, block 9-16→stream 2, etc.) */
const avbBeforeFlatState: Record<string, unknown> = {
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.4.0.111374',
  'stageboxsetup.connect_status': 1,
  'stageboxsetup.selected_name': 'PreSonus StudioLive 32R',
  'stageboxsetup.avb_src_1_8.value': 0.125,    // index 1 = "PreSonus StudioLive 32R:Send 1-8"
  'stageboxsetup.avb_src_1_8.strings': LABELS_1_8,
  'stageboxsetup.avb_src_9_16.value': 0.25,    // index 2 = "PreSonus StudioLive 32R:Send 9-16"
  'stageboxsetup.avb_src_9_16.strings': LABELS_1_8,
  'stageboxsetup.avb_src_17_24.value': 0.375,  // index 3 = "PreSonus StudioLive 32R:Send 17-24"
  'stageboxsetup.avb_src_17_24.strings': LABELS_1_8,
}

/** After: avb_src_9_16 and avb_src_17_24 swapped (user changed two stream assignments) */
const avbAfterFlatState: Record<string, unknown> = {
  ...avbBeforeFlatState,
  'stageboxsetup.avb_src_9_16.value': 0.375,   // now index 3 = "Send 17-24"
  'stageboxsetup.avb_src_17_24.value': 0.25,   // now index 2 = "Send 9-16"
}

/** Not connected: connect_status absent */
const avbDisconnectedFlatState: Record<string, unknown> = {
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.4.0.111374',
  'stageboxsetup.connect_status': 0,
  'stageboxsetup.avb_src_1_8.value': 0,         // index 0 = "None"
  'stageboxsetup.avb_src_1_8.strings': LABELS_1_8,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractAvbStreamRouting — REQ-F-ROUT-011 (#45)', () => {
  it('returns undefined when no stageboxsetup.avb_src_* keys are present', () => {
    /**
     * Given: empty flat state or state without avb_src keys
     * Then:  returns undefined
     */
    expect(extractAvbStreamRouting({})).toBeUndefined()
    expect(extractAvbStreamRouting({ 'stageboxsetup.connect_status': 0 })).toBeUndefined()
  })

  it('returns observed confidence report when avb_src keys are present', () => {
    /**
     * Given: flat state with stageboxsetup.avb_src_* keys
     * Then:  returns AvbStreamRouting with confidence='observed'
     */
    const result = extractAvbStreamRouting(avbBeforeFlatState)
    expect(result).toBeDefined()
    expect(result!.confidence).toBe('observed')
  })

  it('stagebox name from stageboxsetup.selected_name', () => {
    const result = extractAvbStreamRouting(avbBeforeFlatState)!
    expect(result.stageboxName).toBe('PreSonus StudioLive 32R')
  })

  it('connected = true when connect_status = 1', () => {
    const result = extractAvbStreamRouting(avbBeforeFlatState)!
    expect(result.connected).toBe(true)
  })

  it('connected = false when connect_status = 0', () => {
    const result = extractAvbStreamRouting(avbDisconnectedFlatState)!
    expect(result.connected).toBe(false)
  })

  it('avb_src_1_8 value 0.125 → streamIndex 1, label "PreSonus StudioLive 32R:Send 1-8"', () => {
    /**
     * HIL evidence: before-state avb_src_1_8.value=0.125, strings[1]="PreSonus StudioLive 32R:Send 1-8"
     * Math.round(0.125 × 8) = 1
     */
    const result = extractAvbStreamRouting(avbBeforeFlatState)!
    const block = result.streamBlocks.find((b) => b.keyRange === '1_8')
    expect(block).toBeDefined()
    expect(block!.streamIndex).toBe(1)
    expect(block!.streamLabel).toBe('PreSonus StudioLive 32R:Send 1-8')
    expect(block!.channelRange).toBe('1-8')
    expect(block!.confidence).toBe('observed')
  })

  it('avb_src_9_16 value 0.25 → streamIndex 2, label "PreSonus StudioLive 32R:Send 9-16"', () => {
    /**
     * HIL evidence: before-state avb_src_9_16.value=0.25
     * Math.round(0.25 × 8) = 2
     */
    const result = extractAvbStreamRouting(avbBeforeFlatState)!
    const block = result.streamBlocks.find((b) => b.keyRange === '9_16')!
    expect(block.streamIndex).toBe(2)
    expect(block.streamLabel).toBe('PreSonus StudioLive 32R:Send 9-16')
  })

  it('detects swapped streams: after-state avb_src_9_16 ↔ avb_src_17_24', () => {
    /**
     * HIL evidence: user swapped the two assignments — avb_src_9_16 now points to "Send 17-24",
     * avb_src_17_24 now points to "Send 9-16"
     */
    const result = extractAvbStreamRouting(avbAfterFlatState)!
    const b9_16  = result.streamBlocks.find((b) => b.keyRange === '9_16')!
    const b17_24 = result.streamBlocks.find((b) => b.keyRange === '17_24')!
    expect(b9_16.streamIndex).toBe(3)
    expect(b9_16.streamLabel).toBe('PreSonus StudioLive 32R:Send 17-24')
    expect(b17_24.streamIndex).toBe(2)
    expect(b17_24.streamLabel).toBe('PreSonus StudioLive 32R:Send 9-16')
  })

  it('all stream block confidence values are observed', () => {
    const result = extractAvbStreamRouting(avbBeforeFlatState)!
    for (const block of result.streamBlocks) {
      expect(block.confidence).toBe('observed')
    }
  })

  it('streamLabel is null for streamIndex 0 (None)', () => {
    const result = extractAvbStreamRouting(avbDisconnectedFlatState)!
    const b = result.streamBlocks.find((b) => b.keyRange === '1_8')!
    expect(b.streamIndex).toBe(0)
    expect(b.streamLabel).toBeNull()
  })

  it('extracts mixer serial and firmware from flat state', () => {
    const result = extractAvbStreamRouting(avbBeforeFlatState)!
    expect(result.mixerSerial).toBe('SD7E21010066')
    expect(result.firmware).toBe('3.4.0.111374')
  })
})
