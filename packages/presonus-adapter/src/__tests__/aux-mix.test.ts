/**
 * Tests for extractAuxMixes — bug fix and non-LINE channel routing.
 *
 * Verifies: #40 REQ-F-ROUT-010 — non-LINE channel AUX routing extraction
 * Bug fix: old regex matched 'line.ch1.aux.ch2' (wrong); correct key is 'line.ch1.aux1'
 * Architecture: #47 ADR-008
 */
import { describe, it, expect } from 'vitest'
import { extractAuxMixes } from '../state-mapper.js'

describe('extractAuxMixes — regex fix (REQ-F-ROUT-010)', () => {
  it('reads line.chN.auxM keys (observed format — NOT line.chN.aux.chM)', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux1': 0.75,
      'line.ch1.assign_aux1': true,
      'aux.ch1.mute': false,
      'aux.ch1.volume': 0.8,
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes).toHaveLength(1)
    expect(mixes[0]!.auxMixNumber).toBe(1)
    expect(mixes[0]!.sends).toHaveLength(1)
    expect(mixes[0]!.sends[0]!.level).toBe(0.75)
  })

  it('old wrong key format line.ch1.aux.ch1 produces NO sends', () => {
    // This verifies the bug is fixed — old keys should NOT produce sends
    const flat: Record<string, unknown> = {
      'line.ch1.aux.ch1': 0.75,   // ← wrong format (was matched before fix)
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes.every((m) => m.sends.length === 0)).toBe(true)
  })

  it('muted = false when assign_auxN is true', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux3': 0.5,
      'line.ch1.assign_aux3': true,
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes[0]!.sends[0]!.muted).toBe(false)
  })

  it('muted = true when assign_auxN is false', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux3': 0.5,
      'line.ch1.assign_aux3': false,
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes[0]!.sends[0]!.muted).toBe(true)
  })

  it('muted = true when assign_auxN is 0 (integer format)', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux2': 0.6,
      'line.ch1.assign_aux2': 0,   // integer 0 = not assigned
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes[0]!.sends[0]!.muted).toBe(true)
  })
})

describe('extractAuxMixes — non-LINE channels (REQ-F-ROUT-010)', () => {
  it('includes fxreturn sends as fx-return sends with correct name', () => {
    const flat: Record<string, unknown> = {
      'fxreturn.ch1.aux2': 0.8,
      'fxreturn.ch1.assign_aux2': true,
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes).toHaveLength(1)
    expect(mixes[0]!.sends[0]!.fromChannelName).toBe('FX Ret 1')
    expect(mixes[0]!.sends[0]!.muted).toBe(false)
  })

  it('includes talkback sends', () => {
    const flat: Record<string, unknown> = {
      'talkback.ch1.aux5': 0.6,
      'talkback.ch1.assign_aux5': true,
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes).toHaveLength(1)
    expect(mixes[0]!.sends[0]!.fromChannelName).toBe('Talkback')
  })

  it('includes return channel sends', () => {
    const flat: Record<string, unknown> = {
      'return.ch2.aux1': 0.4,
      'return.ch2.assign_aux1': true,
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes[0]!.sends[0]!.fromChannelName).toBe('Return 2')
  })

  it('combines LINE and FXRETURN sends in the same AuxMix', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux1': 0.5,
      'line.ch1.assign_aux1': true,
      'fxreturn.ch1.aux1': 0.8,
      'fxreturn.ch1.assign_aux1': true,
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes).toHaveLength(1)
    expect(mixes[0]!.sends).toHaveLength(2)
  })

  it('uses username over name for LINE channels', () => {
    const flat: Record<string, unknown> = {
      'line.ch3.aux1': 0.6,
      'line.ch3.assign_aux1': true,
      'line.ch3.username': 'Kick In',
      'line.ch3.name': 'Ch 3',
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes[0]!.sends[0]!.fromChannelName).toBe('Kick In')
  })
})

describe('extractAuxMixes — master state', () => {
  it('reads aux master level and mute from state', () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux2': 0.5,
      'line.ch1.assign_aux2': true,
      'aux.ch2.mute': true,
      // REALISTIC: raw value 90 (0-100 scale from mixer) → masterLevel = 0.9 after /100
      'aux.ch2.volume': 90,
      'aux.ch2.username': 'Wedge 1',
    }
    const mixes = extractAuxMixes(flat)
    expect(mixes[0]!.masterMuted).toBe(true)
    expect(mixes[0]!.masterLevel).toBeCloseTo(0.9)
    expect(mixes[0]!.name).toBe('Wedge 1')
  })
})
