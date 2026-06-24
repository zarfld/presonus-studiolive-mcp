/**
 * Tests for meter summary schemas.
 *
 * Verifies: REQ-F-004 (#18)
 * TDD: Defines the expected shape of meter summary resources.
 */
import { describe, it, expect } from 'vitest'
import { GainHintSchema, MeterSummarySchema } from '../schemas/metering.js'

const validSummary = {
  windowSec: 10,
  computedAt: '2026-06-24T12:00:00.000Z',
  silentChannels: ['line.ch3', 'line.ch4'],
  activeChannels: ['line.ch1', 'line.ch2'],
  clippingChannels: [],
  hotChannels: ['line.ch1'],
  noSignalButExpected: [{ channelId: 'line.ch3', label: 'Lead Vox' }],
  signalButUnexpected: [],
}

describe('GainHintSchema', () => {
  it('accepts all valid hints', () => {
    for (const hint of ['no-signal', 'low', 'ok', 'hot', 'clipping']) {
      expect(GainHintSchema.parse(hint)).toBe(hint)
    }
  })

  it('rejects invalid hint', () => {
    expect(() => GainHintSchema.parse('quiet')).toThrow()
  })
})

describe('MeterSummarySchema', () => {
  it('parses a valid meter summary', () => {
    const result = MeterSummarySchema.parse(validSummary)
    expect(result.windowSec).toBe(10)
    expect(result.silentChannels).toHaveLength(2)
    expect(result.noSignalButExpected[0]?.label).toBe('Lead Vox')
  })

  it('accepts summary with all empty arrays (no signal data yet)', () => {
    const result = MeterSummarySchema.parse({
      windowSec: 1,
      computedAt: '2026-06-24T12:00:00.000Z',
      silentChannels: [],
      activeChannels: [],
      clippingChannels: [],
      hotChannels: [],
      noSignalButExpected: [],
      signalButUnexpected: [],
    })
    expect(result.silentChannels).toHaveLength(0)
  })

  it('rejects missing required fields', () => {
    expect(() => MeterSummarySchema.parse({ windowSec: 10 })).toThrow()
  })

  it('rejects zero or negative windowSec', () => {
    expect(() => MeterSummarySchema.parse({ ...validSummary, windowSec: 0 })).toThrow()
    expect(() => MeterSummarySchema.parse({ ...validSummary, windowSec: -1 })).toThrow()
  })

  it('rejects invalid computedAt datetime', () => {
    expect(() =>
      MeterSummarySchema.parse({ ...validSummary, computedAt: 'yesterday' }),
    ).toThrow()
  })
})
