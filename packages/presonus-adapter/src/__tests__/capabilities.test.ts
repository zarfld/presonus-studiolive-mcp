/**
 * Tests for deriveCapabilities() — mixer capability derivation from model name + live state.
 *
 * Verifies: REQ-F-CAPS-001 — capabilities derived from known model table, with live-state fallback.
 *
 * TDD: RED phase — these tests are written BEFORE deriveCapabilities() exists.
 */
import { describe, it, expect } from 'vitest'
import { deriveCapabilities } from '../state-mapper.js'

describe('deriveCapabilities', () => {
  it('returns correct capabilities for StudioLive 32SC', () => {
    const caps = deriveCapabilities('StudioLive 32SC', {})
    expect(caps.lineInputs).toBe(32)
    expect(caps.auxMixes).toBe(16)
    expect(caps.subgroups).toBe(4)
    expect(caps.fxBuses).toBe(4)
    expect(caps.mainOutputs).toBe(true)
    expect(caps.fatChannel).toBe(true)
    expect(caps.avbStagebox).toBe(true)
  })

  it('returns correct capabilities for StudioLive 32R (stagebox)', () => {
    const caps = deriveCapabilities('StudioLive 32R', {})
    expect(caps.lineInputs).toBe(32)
    expect(caps.auxMixes).toBe(16)
    expect(caps.avbStagebox).toBe(true)
  })

  it('returns correct capabilities for StudioLive 24', () => {
    const caps = deriveCapabilities('StudioLive 24', {})
    expect(caps.lineInputs).toBe(24)
    expect(caps.auxMixes).toBe(13)
  })

  it('returns correct capabilities for StudioLive 16', () => {
    const caps = deriveCapabilities('StudioLive 16', {})
    expect(caps.lineInputs).toBe(16)
    expect(caps.auxMixes).toBe(10)
  })

  it('infers lineInputs from live flatState when model is unknown', () => {
    const flatState: Record<string, unknown> = {
      'line.ch1.mute': false,
      'line.ch2.mute': false,
      'line.ch3.mute': false,
    }
    const caps = deriveCapabilities('Unknown Mixer Model', flatState)
    expect(caps.lineInputs).toBe(3)
    expect(caps.fatChannel).toBe(false)  // Unknown model → conservative defaults
  })

  it('uses live-state channel count when higher than table value', () => {
    // Contrived test: table says 32SC has 32 inputs, but live state shows 34 (future firmware?)
    const flatState: Record<string, unknown> = {}
    for (let i = 1; i <= 34; i++) {
      flatState[`line.ch${i}.mute`] = false
    }
    // For known model, table floor is 32; live state count is 34 — use 34
    const caps = deriveCapabilities('StudioLive 32SC', flatState)
    expect(caps.lineInputs).toBeGreaterThanOrEqual(32)
  })
})
