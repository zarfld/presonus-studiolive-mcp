/**
 * Tests for state-mapper using synthetic fixtures.
 *
 * Verifies: REQ-F-003 (#17)
 * TDD: Tests define the expected mapping behavior BEFORE real fixtures exist.
 * Golden fixtures in test/fixtures/32sc/ will replace synthetic data after first probe run.
 */
import { describe, it, expect } from 'vitest'
import { extractLineChannels, extractMixerName, mapRawStateToSnapshot } from '../state-mapper.js'
import type { RawStateTree } from '../types.js'
import type { MixerIdentity } from '@presonus-mcp/domain'

/** Synthetic state tree based on documented featherbear key patterns (OBSERVED on 32SC fw 3.3.0.109659)
 * This represents the FLAT format produced by flattenFeatherbearState() from the nested tree.
 */
const syntheticState32SC: RawStateTree = {
  'global.mixer_name': 'StudioLive 32SC',
  'global.mixer_serial': 'SD7E21010066',
  'global.mixer_version': '3.3.0.109659',
  'line.ch1.name': 'Kick',
  'line.ch1.mute': false,
  'line.ch1.solo': false,
  'line.ch1.volume': 0.675,
  'line.ch1.pan': 0.5,
  'line.ch1.link': false,
  'line.ch1.color': '0000ffff',
  'line.ch2.name': 'Snare',
  'line.ch2.mute': true,
  'line.ch2.volume': 0.72,
  'line.ch3.name': 'Lead Vox',
  'line.ch3.mute': false,
  'line.ch3.volume': 0.80,
  'line.ch3.unknown_future_key': 'some_value',  // Unknown key — must be preserved
}

const mockIdentity: MixerIdentity = {
  deviceId: 'serial:TEST123',
  serial: 'TEST123',
  configuredAlias: 'FOH-32SC',
  ip: '192.168.10.50',
  port: 53000,
  lastSeen: new Date().toISOString(),
  role: 'FOH',
  controllable: false,
  confidence: 'observed',
}

describe('extractMixerName', () => {
  it('extracts mixer name from global key', () => {
    expect(extractMixerName(syntheticState32SC)).toBe('StudioLive 32SC')
  })

  it('returns undefined when key is absent', () => {
    expect(extractMixerName({})).toBeUndefined()
  })

  it('returns undefined when value is not a string', () => {
    expect(extractMixerName({ 'global.mixer_name': 42 })).toBeUndefined()
  })
})

describe('extractLineChannels', () => {
  it('discovers channel numbers from mute keys', () => {
    const channels = extractLineChannels(syntheticState32SC)
    const ids = channels.map((c) => c.id)
    expect(ids).toContain('line.ch1')
    expect(ids).toContain('line.ch2')
    expect(ids).toContain('line.ch3')
  })

  it('maps name, mute, volume, pan correctly', () => {
    const channels = extractLineChannels(syntheticState32SC)
    const ch1 = channels.find((c) => c.id === 'line.ch1')
    expect(ch1).toBeDefined()
    expect(ch1?.name).toBe('Kick')
    expect(ch1?.mute).toBe(false)
    expect(ch1?.fader?.linear).toBeCloseTo(0.675)
    // Pan is 0.0-1.0 range (OBSERVED on 32SC fw 3.3.0.109659)
    expect(ch1?.pan).toBeCloseTo(0.5)
  })

  it('reflects mute=true correctly', () => {
    const channels = extractLineChannels(syntheticState32SC)
    const ch2 = channels.find((c) => c.id === 'line.ch2')
    expect(ch2?.mute).toBe(true)
  })

  it('preserves unknown keys in rawExtra', () => {
    const channels = extractLineChannels(syntheticState32SC)
    const ch3 = channels.find((c) => c.id === 'line.ch3')
    expect(ch3?.rawExtra?.['line.ch3.unknown_future_key']).toBe('some_value')
  })

  it('returns empty array for empty state', () => {
    expect(extractLineChannels({})).toHaveLength(0)
  })

  it('returns channels in ascending channel number order', () => {
    const channels = extractLineChannels(syntheticState32SC)
    const nums = channels.map((c) => c.selector.channel)
    expect(nums).toEqual([...nums].sort((a, b) => a - b))
  })
})

describe('mapRawStateToSnapshot', () => {
  it('produces a valid snapshot from synthetic state', () => {
    const snapshot = mapRawStateToSnapshot(mockIdentity, syntheticState32SC)
    expect(snapshot.identity.name).toBe('StudioLive 32SC')
    expect(snapshot.channels.length).toBeGreaterThan(0)
    expect(snapshot.capturedAt).toBeTruthy()
  })

  it('preserves rawState for diagnostic use', () => {
    const snapshot = mapRawStateToSnapshot(mockIdentity, syntheticState32SC)
    expect(snapshot.rawState['global.mixer_name']).toBe('StudioLive 32SC')
  })
})
