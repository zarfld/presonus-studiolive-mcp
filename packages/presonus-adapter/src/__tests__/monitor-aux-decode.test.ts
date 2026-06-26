/**
 * Tests for aux mix state extraction from flatState.
 *
 * Verifies: REQ-F-AUX-001 â€” extractAuxMixes() decodes aux send levels and mix masters
 * from the StudioLive III flat state key format.
 *
 * Key patterns (OBSERVED on 32SC fw 3.3.0.109659):
 *   line.chN.aux.chM  â€” aux send level from LINE ch N to AUX mix M (normalized 0.0â€“1.0)
 *   aux.chM.mute      â€” aux mix M master mute
 *   aux.chM.volume    â€” aux mix M master level (normalized 0.0â€“1.0)
 *   aux.chM.username  â€” aux mix M name (user-assigned)
 *
 * TDD: RED phase â€” written before extractAuxMixes() exists.
 */
import { describe, it, expect } from 'vitest'
import { extractAuxMixes } from '../state-mapper.js'

const syntheticFlatState: Record<string, unknown> = {
  // Line channels
  'line.ch1.name': 'Kick',
  'line.ch1.mute': false,
  'line.ch2.name': 'Snare',
  'line.ch2.mute': false,
  'line.ch8.name': 'Lead Vox',
  'line.ch8.mute': false,
  // Aux sends â€” ch1 and ch8 to aux 1
  'line.ch1.aux1': 0.5,
  'line.ch8.aux1': 0.9,
  // Aux sends â€” ch1 and ch2 to aux 2
  'line.ch1.aux2': 0.3,
  'line.ch2.aux2': 0.7,
  // Aux mix 1 master — realistic: 80 (0-100 scale) → masterLevel = 0.80
  'aux.ch1.mute': false,
  'aux.ch1.volume': 80,
  'aux.ch1.username': 'Wedge 1',
  // Aux mix 2 master — realistic: 60 (0-100 scale) → masterLevel = 0.60
  'aux.ch2.mute': true,
  'aux.ch2.volume': 60,
  'aux.ch2.username': 'IEM L',
}

describe('extractAuxMixes', () => {
  it('detects aux mix 1 with correct master state', () => {
    const mixes = extractAuxMixes(syntheticFlatState)
    const mix1 = mixes.find((m) => m.auxMixNumber === 1)
    expect(mix1).toBeDefined()
    expect(mix1?.name).toBe('Wedge 1')
    expect(mix1?.masterMuted).toBe(false)
    expect(mix1?.masterLevel).toBeCloseTo(0.8)
  })

  it('detects aux mix 2 as muted', () => {
    const mixes = extractAuxMixes(syntheticFlatState)
    const mix2 = mixes.find((m) => m.auxMixNumber === 2)
    expect(mix2).toBeDefined()
    expect(mix2?.masterMuted).toBe(true)
    expect(mix2?.name).toBe('IEM L')
  })

  it('extracts sends to aux mix 1', () => {
    const mixes = extractAuxMixes(syntheticFlatState)
    const mix1 = mixes.find((m) => m.auxMixNumber === 1)
    expect(mix1?.sends).toHaveLength(2)
    const kickSend = mix1?.sends.find((s) => s.fromChannel === 1)
    expect(kickSend?.level).toBeCloseTo(0.5)
    const voxSend = mix1?.sends.find((s) => s.fromChannel === 8)
    expect(voxSend?.level).toBeCloseTo(0.9)
  })

  it('uses levelDb computed from level (approximate dBFS)', () => {
    const mixes = extractAuxMixes(syntheticFlatState)
    const mix1 = mixes.find((m) => m.auxMixNumber === 1)
    const voxSend = mix1?.sends.find((s) => s.fromChannel === 8)
    // level 0.9 â†’ 20*log10(0.9/1.0) â‰ˆ -0.92 dBFS (approx)
    expect(voxSend?.levelDb).toBeLessThan(0)
  })

  it('marks prePost as unknown (not determinable from current adapter)', () => {
    const mixes = extractAuxMixes(syntheticFlatState)
    const mix1 = mixes.find((m) => m.auxMixNumber === 1)
    for (const send of mix1?.sends ?? []) {
      expect(send.prePost).toBe('unknown')
    }
  })

  it('returns empty array when no aux data present', () => {
    const mixes = extractAuxMixes({
      'line.ch1.mute': false,
      'global.mixer_name': 'StudioLive 32SC',
    })
    expect(mixes).toHaveLength(0)
  })

  it('uses channel name from flatState when available', () => {
    const mixes = extractAuxMixes(syntheticFlatState)
    const mix1 = mixes.find((m) => m.auxMixNumber === 1)
    const kickSend = mix1?.sends.find((s) => s.fromChannel === 1)
    expect(kickSend?.fromChannelName).toBe('Kick')
  })
})

