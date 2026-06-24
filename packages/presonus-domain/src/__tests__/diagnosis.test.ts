/**
 * Tests for channel diagnosis schemas.
 *
 * Verifies: REQ-F-DIAG-001 — MCP server shall diagnose a channel with no signal
 * by checking mute, fader, solo, meter, gate state and returning structured causes + steps.
 *
 * TDD: RED phase — written before diagnosis.ts schema exists.
 */
import { describe, it, expect } from 'vitest'
import {
  DiagnoseChannelInputSchema,
  DiagnoseChannelResultSchema,
} from '../schemas/diagnosis.js'

describe('DiagnoseChannelInputSchema', () => {
  it('parses valid input with channel number', () => {
    const result = DiagnoseChannelInputSchema.parse({
      deviceId: 'serial:ABC',
      channel: 8,
    })
    expect(result.channel).toBe(8)
    expect(result.expectedSource).toBeUndefined()
  })

  it('accepts optional expectedSource label', () => {
    const result = DiagnoseChannelInputSchema.parse({
      deviceId: 'serial:ABC',
      channel: 8,
      expectedSource: 'Lead Vox',
    })
    expect(result.expectedSource).toBe('Lead Vox')
  })

  it('rejects non-positive channel number', () => {
    expect(() =>
      DiagnoseChannelInputSchema.parse({ deviceId: 'serial:ABC', channel: 0 }),
    ).toThrow()
  })
})

describe('DiagnoseChannelResultSchema', () => {
  it('parses a muted channel diagnosis', () => {
    const result = DiagnoseChannelResultSchema.parse({
      status: 'problem',
      channel: 8,
      checks: [
        { check: 'mute', result: 'muted' },
        { check: 'fader', result: 'fader_down' },
        { check: 'meter', result: 'silent' },
        { check: 'solo', result: 'not_soloed' },
      ],
      mostLikelyCauses: ['Channel is muted', 'Fader is down'],
      safeNextSteps: ['Confirm microphone/cable first', 'Check channel mute'],
    })
    expect(result.status).toBe('problem')
    expect(result.checks).toHaveLength(4)
    expect(result.mostLikelyCauses).toContain('Channel is muted')
  })

  it('parses an ok diagnosis with active signal', () => {
    const result = DiagnoseChannelResultSchema.parse({
      status: 'ok',
      channel: 1,
      checks: [
        { check: 'mute', result: 'not_muted' },
        { check: 'fader', result: 'at_unity' },
        { check: 'meter', result: 'active' },
        { check: 'solo', result: 'not_soloed' },
      ],
      mostLikelyCauses: [],
      safeNextSteps: [],
    })
    expect(result.status).toBe('ok')
  })

  it('requires mostLikelyCauses and safeNextSteps arrays', () => {
    expect(() =>
      DiagnoseChannelResultSchema.parse({
        status: 'ok',
        channel: 1,
        checks: [],
        // missing required fields
      }),
    ).toThrow()
  })
})
