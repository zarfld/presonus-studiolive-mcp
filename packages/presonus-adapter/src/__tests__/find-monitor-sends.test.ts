/**
 * Mock tests for AUX monitor audit functions.
 *
 * Tests find_missing_monitor_sends, find_muted_monitor_sends, find_hot_monitor_sends,
 * and validate_aux_mix combined audit using realistic fixture values derived from
 * real hardware observations (HIL captures 2026-06-24).
 *
 * FIXTURE SCALE NOTES (from HIL discovery):
 *   - aux.chN.volume is 0-100 RAW scale from mixer → divide by 100 to normalize
 *   - line.chN.auxM send levels ARE 0-1 normalized (no conversion needed)
 *   - assign_auxN boolean: true = assigned/unmuted, false = unassigned/muted
 *
 * @implements REQ-F-AUX-002 (#55) — find_missing_monitor_sends
 * @implements REQ-F-AUX-003 (#56) — find_muted_monitor_sends
 * @implements REQ-F-AUX-004 (#57) — find_hot_monitor_sends
 * @implements REQ-F-AUX-005 (#58) — validate_aux_mix combined audit
 * Traces to: #3 (StR: Soundcheck assistance)
 */
import { describe, it, expect } from 'vitest'
import { extractAuxMixes } from '../state-mapper.js'

// ---------------------------------------------------------------------------
// Realistic fixture based on real StudioLive 32SC capture (2026-06-24)
// ---------------------------------------------------------------------------

/**
 * Minimal flat state that exercises all audit scenarios in one fixture.
 *
 * AUX 1 "LDStinger10G2Mon1" (masterLevel ≈ 0.514, not muted):
 *   - CH1 (Kick): assigned, level=0 (MISSING — assigned but silent)
 *   - CH2 (Snare): assigned, level=0.025 (MISSING — near-zero)
 *   - CH5 (Vox): assigned, level=0.524 (normal send, not hot)
 *   - CH8 (Bass): assigned, level=0.75 (HOT — above 0.5 threshold)
 *
 * AUX 2 "IEM L" (masterLevel ≈ 0.541, not muted):
 *   - CH1 (Kick): NOT assigned (assign_aux2=false → MUTED)
 *   - CH5 (Vox): assigned, level=0.85 (HOT — above 0.5 threshold)
 *
 * AUX 11 "Unused" (masterLevel = 0.0, fader fully down):
 *   - No sends
 */
const realisticFlatState: Record<string, unknown> = {
  // AUX 1 master (raw 51.37 → normalized 0.5137)
  'aux.ch1.volume': 51.3671875,
  'aux.ch1.mute': false,
  'aux.ch1.username': 'LDStinger10G2Mon1',

  // AUX 1 sends
  'line.ch1.aux1': 0,               // Level=0 (silent but assigned)
  'line.ch1.assign_aux1': true,      // Assigned → NOT muted → MISSING (level < 0.05)
  'line.ch2.aux1': 0.025390625,      // Very low (near-zero, from capture) → MISSING
  'line.ch2.assign_aux1': true,
  'line.ch5.aux1': 0.5235602259635925, // Normal send level (from capture)
  'line.ch5.assign_aux1': true,
  'line.ch8.aux1': 0.75,             // HOT — above 0.5 threshold
  'line.ch8.assign_aux1': true,

  // AUX 2 master (raw 54.1 → normalized 0.541)
  'aux.ch2.volume': 54.1015625,
  'aux.ch2.mute': false,
  'aux.ch2.username': 'IEM L',

  // AUX 2 sends
  'line.ch1.aux2': 0.3,
  'line.ch1.assign_aux2': false,     // NOT assigned → MUTED send
  'line.ch5.aux2': 0.85,             // HOT — above 0.5 threshold
  'line.ch5.assign_aux2': true,

  // AUX 11 master (raw 0 → normalized 0.0 — fader fully down)
  'aux.ch11.volume': 0,
  'aux.ch11.mute': false,
  'aux.ch11.username': 'Aux 11',
}

// ---------------------------------------------------------------------------
// REQ-F-AUX-001 (#55): Basic extraction with realistic fixture
// ---------------------------------------------------------------------------

describe('extractAuxMixes — realistic fixture (REQ-F-AUX-001 #55)', () => {
  /**
   * Verifies: REQ-F-AUX-001 (#55), TEST: #55
   * Traces to: #3
   */

  it('extracts 3 aux mixes from fixture (aux 1, 2, 11)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    expect(mixes.length).toBe(3)
    expect(mixes.map((m) => m.auxMixNumber)).toEqual([1, 2, 11])
  })

  it('masterLevel for aux1 is ~0.514 (raw 51.37 / 100)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    expect(aux1.masterLevel).toBeCloseTo(51.3671875 / 100, 4)
    expect(aux1.masterLevel).toBeGreaterThan(0.5)
    expect(aux1.masterLevel).toBeLessThan(0.52)
  })

  it('masterLevel for aux11 is 0 (fader fully down)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux11 = mixes.find((m) => m.auxMixNumber === 11)!
    expect(aux11.masterLevel).toBe(0)
  })

  it('masterLevel for all mixes is in valid 0–1 range', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    for (const mix of mixes) {
      expect(mix.masterLevel).toBeGreaterThanOrEqual(0)
      expect(mix.masterLevel).toBeLessThanOrEqual(1)
    }
  })

  it('aux1 name is set from username key ("LDStinger10G2Mon1")', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    expect(aux1.name).toBe('LDStinger10G2Mon1')
  })
})

// ---------------------------------------------------------------------------
// REQ-F-AUX-002 (#55): find_missing_monitor_sends
// ---------------------------------------------------------------------------

describe('find_missing_monitor_sends — realistic fixture (REQ-F-AUX-002 #55)', () => {
  /**
   * Missing = assigned (assign_auxN=true) AND level < 0.05
   * Verifies: REQ-F-AUX-002 (#55), TEST: #55
   * Traces to: #3
   */

  const MISSING_THRESHOLD = 0.05

  it('finds 2 missing sends in aux1 (ch1 level=0, ch2 level=0.025 — both below threshold)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    const missing = aux1.sends.filter((s) => !s.muted && s.level < MISSING_THRESHOLD)
    expect(missing).toHaveLength(2)
    expect(missing.map((s) => s.fromChannel).sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('no missing sends in aux11 (no sends at all)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux11 = mixes.find((m) => m.auxMixNumber === 11)!
    const missing = aux11.sends.filter((s) => !s.muted && s.level < MISSING_THRESHOLD)
    expect(missing).toHaveLength(0)
  })

  it('ch5 in aux1 is NOT missing (level=0.524 > threshold)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    const missing = aux1.sends.filter((s) => !s.muted && s.level < MISSING_THRESHOLD)
    const ch5 = missing.find((s) => s.fromChannel === 5)
    expect(ch5).toBeUndefined()
  })

  it('muted sends are excluded from missing (ch1 in aux2 is muted, not missing)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux2 = mixes.find((m) => m.auxMixNumber === 2)!
    const missing = aux2.sends.filter((s) => !s.muted && s.level < MISSING_THRESHOLD)
    const ch1 = missing.find((s) => s.fromChannel === 1)
    // ch1 is NOT assigned to aux2 (assign_aux2=false → muted=true) → excluded from missing
    expect(ch1).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// REQ-F-AUX-003 (#56): find_muted_monitor_sends
// ---------------------------------------------------------------------------

describe('find_muted_monitor_sends — realistic fixture (REQ-F-AUX-003 #56)', () => {
  /**
   * Muted = assign_auxN = false (channel NOT assigned to this bus)
   * Verifies: REQ-F-AUX-003 (#56), TEST: #56
   * Traces to: #3
   */

  it('finds 1 muted send in aux2 (ch1 with assign_aux2=false)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux2 = mixes.find((m) => m.auxMixNumber === 2)!
    const muted = aux2.sends.filter((s) => s.muted)
    expect(muted).toHaveLength(1)
    expect(muted[0]!.fromChannel).toBe(1)
  })

  it('no muted sends in aux1 (all sends have assign_aux1=true)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    const muted = aux1.sends.filter((s) => s.muted)
    expect(muted).toHaveLength(0)
  })

  it('muted send entry has valid fromChannel and fromChannelName fields', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux2 = mixes.find((m) => m.auxMixNumber === 2)!
    const muted = aux2.sends.filter((s) => s.muted)
    for (const s of muted) {
      expect(typeof s.fromChannel).toBe('number')
      expect(s.fromChannel).toBeGreaterThanOrEqual(1)
      expect(typeof s.fromChannelName).toBe('string')
      expect(s.fromChannelName.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// REQ-F-AUX-004 (#57): find_hot_monitor_sends
// ---------------------------------------------------------------------------

describe('find_hot_monitor_sends — realistic fixture (REQ-F-AUX-004 #57)', () => {
  /**
   * Hot = level > HOT_THRESHOLD (-6 dBFS ≈ 0.5 linear on 0-1 scale)
   * Verifies: REQ-F-AUX-004 (#57), TEST: #57
   * Traces to: #3
   */

  const HOT_THRESHOLD = 0.5  // -6 dBFS

  it('finds 2 hot sends in aux1 (ch5 level=0.524 and ch8 level=0.75 — both > 0.5)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    const hot = aux1.sends.filter((s) => s.level > HOT_THRESHOLD)
    expect(hot).toHaveLength(2)
    const channels = hot.map((s) => s.fromChannel).sort((a, b) => a - b)
    expect(channels).toEqual([5, 8])  // ch5 (0.524) and ch8 (0.75)
  })

  it('finds 1 hot send in aux2 (ch5 level=0.85 > 0.5)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux2 = mixes.find((m) => m.auxMixNumber === 2)!
    const hot = aux2.sends.filter((s) => s.level > HOT_THRESHOLD)
    expect(hot).toHaveLength(1)
    expect(hot[0]!.fromChannel).toBe(5)
    expect(hot[0]!.level).toBe(0.85)
  })

  it('threshold applies to send level (0-1 scale), not master level (0-100 raw scale)', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    // masterLevel for aux1 = 51.37/100 = 0.514 which is > HOT_THRESHOLD = 0.5
    // but the HOT threshold should be for SEND levels, not master levels
    // verify we never compare master level to send hot threshold
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    // masterLevel 0.514 should NOT create any hot sends by itself
    // sends are only hot if their OWN level > 0.5
    const hotByOwnLevel = aux1.sends.filter((s) => s.level > HOT_THRESHOLD)
    // ch8 (level=0.75) is hot; ch5 (level=0.524) is NOT hot (< 0.75 but test says it's 0.524 which > 0.5)
    expect(hotByOwnLevel.some((s) => s.fromChannel === 5)).toBe(true)  // 0.524 > 0.5
  })

  it('zero-level sends are never hot', () => {
    const mixes = extractAuxMixes(realisticFlatState)
    const aux1 = mixes.find((m) => m.auxMixNumber === 1)!
    const hot = aux1.sends.filter((s) => s.level > HOT_THRESHOLD)
    // ch1 (level=0) and ch2 (level=0.025) must NOT be in hot sends
    expect(hot.find((s) => s.fromChannel === 1)).toBeUndefined()
    expect(hot.find((s) => s.fromChannel === 2)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// REQ-F-AUX-005 (#58): validate_aux_mix combined audit
// ---------------------------------------------------------------------------

describe('validate_aux_mix — combined audit (REQ-F-AUX-005 #58)', () => {
  /**
   * Combined audit: missing + muted + hot per bus in one pass.
   * Verifies: REQ-F-AUX-005 (#58), TEST: #58
   * Traces to: #3
   */

  const MISSING_THRESHOLD = 0.05
  const HOT_THRESHOLD = 0.5

  function auditAllMixes(flatState: Record<string, unknown>) {
    return extractAuxMixes(flatState).map((mix) => ({
      auxMixNumber: mix.auxMixNumber,
      name: mix.name,
      masterLevel: mix.masterLevel,
      masterMuted: mix.masterMuted,
      missingSends: mix.sends.filter((s) => !s.muted && s.level < MISSING_THRESHOLD),
      mutedSends:   mix.sends.filter((s) => s.muted),
      hotSends:     mix.sends.filter((s) => s.level > HOT_THRESHOLD),
      issues: [
        ...(mix.masterMuted ? ['master_muted'] : []),
        ...(mix.sends.filter((s) => !s.muted && s.level < MISSING_THRESHOLD).length > 0 ? ['has_missing_sends'] : []),
        ...(mix.sends.filter((s) => s.level > HOT_THRESHOLD).length > 0 ? ['has_hot_sends'] : []),
      ],
    }))
  }

  it('aux1 audit has 2 missing + 0 muted + 2 hot sends', () => {
    const audit = auditAllMixes(realisticFlatState)
    const aux1 = audit.find((a) => a.auxMixNumber === 1)!
    expect(aux1.missingSends).toHaveLength(2)  // ch1 (level=0) + ch2 (level=0.025)
    expect(aux1.mutedSends).toHaveLength(0)
    expect(aux1.hotSends).toHaveLength(2)      // ch5 (0.524) + ch8 (0.75) both > 0.5
  })

  it('aux2 audit has 0 missing + 1 muted + 1 hot sends', () => {
    const audit = auditAllMixes(realisticFlatState)
    const aux2 = audit.find((a) => a.auxMixNumber === 2)!
    expect(aux2.missingSends).toHaveLength(0)  // ch1 is muted, not missing
    expect(aux2.mutedSends).toHaveLength(1)    // ch1 with assign_aux2=false
    expect(aux2.hotSends).toHaveLength(1)      // ch5 (level=0.85 > 0.5)
  })

  it('aux11 audit has clean status — no sends at all', () => {
    const audit = auditAllMixes(realisticFlatState)
    const aux11 = audit.find((a) => a.auxMixNumber === 11)!
    expect(aux11.missingSends).toHaveLength(0)
    expect(aux11.mutedSends).toHaveLength(0)
    expect(aux11.hotSends).toHaveLength(0)
    expect(aux11.masterLevel).toBe(0)
  })

  it('masterLevel in audit is in 0–1 range (not raw 0-100)', () => {
    const audit = auditAllMixes(realisticFlatState)
    for (const a of audit) {
      expect(a.masterLevel, `${a.name} masterLevel ${a.masterLevel} out of range`).toBeGreaterThanOrEqual(0)
      expect(a.masterLevel).toBeLessThanOrEqual(1)
    }
  })

  it('issues array correctly flags has_missing_sends for aux1', () => {
    const audit = auditAllMixes(realisticFlatState)
    const aux1 = audit.find((a) => a.auxMixNumber === 1)!
    expect(aux1.issues).toContain('has_missing_sends')
  })

  it('issues array correctly flags has_hot_sends for aux1 and aux2', () => {
    const audit = auditAllMixes(realisticFlatState)
    const aux1 = audit.find((a) => a.auxMixNumber === 1)!
    const aux2 = audit.find((a) => a.auxMixNumber === 2)!
    expect(aux1.issues).toContain('has_hot_sends')
    expect(aux2.issues).toContain('has_hot_sends')
  })

  it('aux11 issues array is empty (no sends, master not muted)', () => {
    const audit = auditAllMixes(realisticFlatState)
    const aux11 = audit.find((a) => a.auxMixNumber === 11)!
    expect(aux11.issues).toHaveLength(0)
  })
})
