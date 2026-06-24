/**
 * Tests for line-check step schemas.
 *
 * Verifies: REQ-F-LINECHK-001 — MCP server shall analyse meter activity during line check
 * and report expected-silent, unexpected-active, and suspected swap anomalies.
 *
 * TDD: RED phase — written before line-check.ts schema exists.
 */
import { describe, it, expect } from 'vitest'
import {
  LineCheckStepInputSchema,
  LineCheckStepResultSchema,
} from '../schemas/line-check.js'

describe('LineCheckStepInputSchema', () => {
  it('parses valid input with expected channels and window', () => {
    const result = LineCheckStepInputSchema.parse({
      deviceId: 'serial:ABC',
      expectedActiveChannels: [
        { channel: 1, name: 'Kick' },
        { channel: 8, name: 'Lead Vox' },
      ],
      windowSec: 10,
    })
    expect(result.expectedActiveChannels).toHaveLength(2)
    expect(result.windowSec).toBe(10)
  })

  it('defaults windowSec to 10 when not provided', () => {
    const result = LineCheckStepInputSchema.parse({
      deviceId: 'serial:ABC',
      expectedActiveChannels: [{ channel: 1, name: 'Kick' }],
    })
    expect(result.windowSec).toBe(10)
  })

  it('accepts allowedOtherChannels as optional', () => {
    const result = LineCheckStepInputSchema.parse({
      deviceId: 'serial:ABC',
      expectedActiveChannels: [{ channel: 1, name: 'Kick' }],
      allowedOtherChannels: [{ channel: 2, name: 'Ambience' }],
    })
    expect(result.allowedOtherChannels).toHaveLength(1)
  })

  it('rejects missing deviceId', () => {
    expect(() =>
      LineCheckStepInputSchema.parse({
        expectedActiveChannels: [{ channel: 1, name: 'Kick' }],
      }),
    ).toThrow()
  })
})

describe('LineCheckStepResultSchema', () => {
  it('parses a problem result with silent expected and unexpected active', () => {
    const result = LineCheckStepResultSchema.parse({
      status: 'problem',
      expectedActive: [
        { channel: 1, name: 'Kick', signal: 'silent' },
      ],
      unexpectedActive: [
        { channel: 2, name: 'Snare', signal: 'active', peakDb: -12.5 },
      ],
      suspicions: [
        {
          type: 'possible_patch_swap',
          expected: 'Kick on channel 1',
          observed: 'signal on channel 2',
          confidence: 'medium',
        },
      ],
    })
    expect(result.status).toBe('problem')
    expect(result.suspicions).toHaveLength(1)
    expect(result.suspicions[0].confidence).toBe('medium')
  })

  it('parses an ok result with empty arrays', () => {
    const result = LineCheckStepResultSchema.parse({
      status: 'ok',
      expectedActive: [{ channel: 1, name: 'Kick', signal: 'active', peakDb: -18.0 }],
      unexpectedActive: [],
      suspicions: [],
    })
    expect(result.status).toBe('ok')
  })

  it('rejects unknown confidence level', () => {
    expect(() =>
      LineCheckStepResultSchema.parse({
        status: 'ok',
        expectedActive: [],
        unexpectedActive: [],
        suspicions: [
          {
            type: 'swap',
            expected: 'x',
            observed: 'y',
            confidence: 'very_high',  // invalid
          },
        ],
      }),
    ).toThrow()
  })
})
