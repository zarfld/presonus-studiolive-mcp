/**
 * Tests for MixerCapabilitiesSchema.
 *
 * Verifies: REQ-F-CAPS-001 — MCP server shall expose mixer capabilities
 * so that sound engineer agents can validate capacity before planning.
 *
 * TDD: These tests are written BEFORE the schema exists (RED phase).
 */
import { describe, it, expect } from 'vitest'
import { MixerCapabilitiesSchema } from '../schemas/mixer.js'

describe('MixerCapabilitiesSchema', () => {
  it('parses capabilities for a StudioLive 32SC', () => {
    const result = MixerCapabilitiesSchema.parse({
      deviceId: 'serial:ABC123',
      model: 'StudioLive 32SC',
      role: 'FOH',
      capabilities: {
        lineInputs: 32,
        auxMixes: 16,
        subgroups: 4,
        fxBuses: 4,
        mainOutputs: true,
        fatChannel: true,
        avbStagebox: true,
      },
    })
    expect(result.capabilities.lineInputs).toBe(32)
    expect(result.capabilities.auxMixes).toBe(16)
    expect(result.capabilities.subgroups).toBe(4)
    expect(result.capabilities.fxBuses).toBe(4)
    expect(result.capabilities.mainOutputs).toBe(true)
    expect(result.capabilities.fatChannel).toBe(true)
    expect(result.capabilities.avbStagebox).toBe(true)
  })

  it('requires lineInputs and auxMixes', () => {
    expect(() =>
      MixerCapabilitiesSchema.parse({
        deviceId: 'serial:X',
        model: 'StudioLive 32SC',
        role: 'FOH',
        capabilities: {
          // missing lineInputs and auxMixes
          mainOutputs: true,
          fatChannel: true,
          avbStagebox: false,
        },
      }),
    ).toThrow()
  })

  it('accepts minimal capabilities (integer mixer-like device)', () => {
    const result = MixerCapabilitiesSchema.parse({
      deviceId: 'serial:Y',
      model: 'StudioLive 16',
      role: 'MONITOR',
      capabilities: {
        lineInputs: 16,
        auxMixes: 10,
        subgroups: 2,
        fxBuses: 2,
        mainOutputs: true,
        fatChannel: true,
        avbStagebox: false,
      },
    })
    expect(result.capabilities.lineInputs).toBe(16)
    expect(result.capabilities.avbStagebox).toBe(false)
  })
})
