/**
 * Tests for channel schemas.
 *
 * Verifies: REQ-F-003 (#17)
 * TDD: Contract tests for the primary agent-facing data structure.
 */
import { describe, it, expect } from 'vitest'
import {
  ChannelTypeSchema,
  ChannelSelectorSchema,
  MixerChannelSchema,
} from '../schemas/channel.js'

describe('ChannelTypeSchema', () => {
  it('accepts all valid channel types', () => {
    const types = ['LINE', 'RETURN', 'FXRETURN', 'TALKBACK', 'AUX', 'FX', 'SUB', 'MAIN']
    for (const t of types) {
      expect(ChannelTypeSchema.parse(t)).toBe(t)
    }
  })

  it('rejects invalid channel type', () => {
    expect(() => ChannelTypeSchema.parse('MONO')).toThrow()
    expect(() => ChannelTypeSchema.parse('')).toThrow()
  })
})

describe('ChannelSelectorSchema', () => {
  it('parses minimal selector', () => {
    const result = ChannelSelectorSchema.parse({ type: 'LINE', channel: 1 })
    expect(result.type).toBe('LINE')
    expect(result.channel).toBe(1)
    expect(result.mixType).toBeUndefined()
  })

  it('parses send-context selector', () => {
    const result = ChannelSelectorSchema.parse({
      type: 'LINE',
      channel: 1,
      mixType: 'AUX',
      mixNumber: 3,
    })
    expect(result.mixType).toBe('AUX')
    expect(result.mixNumber).toBe(3)
  })

  it('rejects zero/negative channel number', () => {
    expect(() => ChannelSelectorSchema.parse({ type: 'LINE', channel: 0 })).toThrow()
    expect(() => ChannelSelectorSchema.parse({ type: 'LINE', channel: -1 })).toThrow()
  })
})

describe('MixerChannelSchema', () => {
  const validChannel = {
    id: 'line.ch1',
    selector: { type: 'LINE', channel: 1 },
    name: 'Kick',
    mute: false,
    solo: false,
    fader: { db: -10.0, linear: 0.675 },
    pan: 0.5,
    linked: false,
    color: '#FF0000',
  }

  it('parses a fully-specified channel', () => {
    const result = MixerChannelSchema.parse(validChannel)
    expect(result.id).toBe('line.ch1')
    expect(result.name).toBe('Kick')
    expect(result.mute).toBe(false)
    expect(result.fader?.db).toBe(-10.0)
  })

  it('accepts channel with only required fields', () => {
    const result = MixerChannelSchema.parse({
      id: 'aux.ch1',
      selector: { type: 'AUX', channel: 1 },
    })
    expect(result.id).toBe('aux.ch1')
    expect(result.name).toBeUndefined()
    expect(result.mute).toBeUndefined()
  })

  it('preserves unknown fields in rawExtra', () => {
    const result = MixerChannelSchema.parse({
      ...validChannel,
      rawExtra: { 'line.ch1.unknown_key': 42 },
    })
    expect(result.rawExtra?.['line.ch1.unknown_key']).toBe(42)
  })

  it('accepts null fader db (not yet mapped)', () => {
    const result = MixerChannelSchema.parse({
      ...validChannel,
      fader: { db: null },
    })
    expect(result.fader?.db).toBeNull()
  })

  it('accepts compModelName and eqModelName', () => {
    const result = MixerChannelSchema.parse({
      ...validChannel,
      compModelName: 'FET',
      eqModelName: 'STANDARD',
    })
    expect(result.compModelName).toBe('FET')
    expect(result.eqModelName).toBe('STANDARD')
  })

  it('rejects pan out of range', () => {
    expect(() =>
      MixerChannelSchema.parse({ ...validChannel, pan: 1.1 }),
    ).toThrow()
    expect(() =>
      MixerChannelSchema.parse({ ...validChannel, pan: -0.1 }),
    ).toThrow()
  })
})
