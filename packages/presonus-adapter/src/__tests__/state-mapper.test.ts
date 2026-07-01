/**
 * Tests for state-mapper using synthetic fixtures.
 *
 * Verifies: REQ-F-003 (#17)
 * TDD: Tests define the expected mapping behavior BEFORE real fixtures exist.
 * Golden fixtures in test/fixtures/32sc/ will replace synthetic data after first probe run.
 */
import { describe, it, expect } from 'vitest'
import { extractLineChannels, extractMixerName, extractFatChannelState, extractCurrentProject, mapRawStateToSnapshot } from '../state-mapper.js'
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
  'line.ch1.volume': 73.36,  // real 0-100 scale; 73.36 = unity (0 dB), OBSERVED on 32SC
  'line.ch1.pan': 0.5,
  'line.ch1.link': false,
  'line.ch1.color': '0000ffff',
  'line.ch2.name': 'Snare',
  'line.ch2.mute': true,
  'line.ch2.volume': 73.36,
  'line.ch3.name': 'Lead Vox',
  'line.ch3.mute': false,
  'line.ch3.volume': 73.36,
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
    expect(ch1?.fader?.linear).toBeCloseTo(0.7336, 3)  // 73.36 / 100
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

  it('defaults isStale=false and disconnectedAt=undefined', () => {
    const snapshot = mapRawStateToSnapshot(mockIdentity, syntheticState32SC)
    expect(snapshot.isStale).toBe(false)
    expect(snapshot.disconnectedAt).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractCurrentProject tests — REQ-F-005 (#19)
// ---------------------------------------------------------------------------

describe('extractCurrentProject — REQ-F-005: scene/project state key extraction', () => {
  it('extracts project title from presets.loaded_project_title', () => {
    const flat = { 'presets.loaded_project_title': '32SCKellersessions' }
    expect(extractCurrentProject(flat)).toBe('32SCKellersessions')
  })

  it('trims whitespace from project title', () => {
    const flat = { 'presets.loaded_project_title': '  MyShow  ' }
    expect(extractCurrentProject(flat)).toBe('MyShow')
  })

  it('falls back to presets.loaded_project_name when title is absent', () => {
    const flat = { 'presets.loaded_project_name': 'proj/01.32SCKellersessions.proj' }
    expect(extractCurrentProject(flat)).toBe('32SCKellersessions')
  })

  it('falls back to raw path string when parsing fails', () => {
    const flat = { 'presets.loaded_project_name': 'somepath' }
    expect(extractCurrentProject(flat)).toBe('somepath')
  })

  it('returns undefined when neither key is present', () => {
    expect(extractCurrentProject({})).toBeUndefined()
  })

  it('prefers loaded_project_title over loaded_project_name', () => {
    const flat = {
      'presets.loaded_project_title': 'ShowTitle',
      'presets.loaded_project_name': 'proj/01.OtherTitle.proj',
    }
    expect(extractCurrentProject(flat)).toBe('ShowTitle')
  })

  it('snapshot.currentProject populated from presets key in mapRawStateToSnapshot', () => {
    const stateWithProject = {
      ...syntheticState32SC,
      'presets.loaded_project_title': 'FestivalNight',
    }
    const snapshot = mapRawStateToSnapshot(mockIdentity, stateWithProject)
    expect(snapshot.currentProject).toBe('FestivalNight')
  })
})

// ---------------------------------------------------------------------------
// extractFatChannelState tests (TDD — formulas are guessed, will be refined
// after probe-fat-channel calibration on physical 32SC hardware)
// ---------------------------------------------------------------------------

/** Realistic flat state for ch1 matching before-model-switch.json capture (32SC fw 3.3.0.109659) */
const fatChannelFlat: Record<string, unknown> = {
  'line.ch1.eq.eqallon': 1,
  'line.ch1.eq.eqgain1': 0.5412371158599854,  // observed on Kick In channel
  'line.ch1.eq.eqfreq1': 0.10809767991304398,
  'line.ch1.eq.eqq1': 0.75,
  'line.ch1.eq.eqtype1': 0.3333333432674408,
  'line.ch1.eq.eqbandon1': 1,
  'line.ch1.eq.eqgain2': 0.4020618796348572,
  'line.ch1.eq.eqfreq2': 0.4409181773662567,
  'line.ch1.eq.eqq2': 0.6932796239852905,
  'line.ch1.eq.eqtype2': 1,
  'line.ch1.eq.eqbandon2': 1,
  'line.ch1.eq.eqgain3': 0.639175295829773,
  'line.ch1.eq.eqfreq3': 0.6819997429847717,
  'line.ch1.eq.eqq3': 0.5,
  'line.ch1.eq.eqtype3': 1,
  'line.ch1.eq.eqbandon3': 1,
  'line.ch1.eq.eqgain4': 0.6494845151901245,
  'line.ch1.eq.eqfreq4': 0.8142744898796082,
  'line.ch1.eq.eqq4': 0.6200000047683716,
  'line.ch1.eq.eqtype4': 1,
  'line.ch1.eq.eqbandon4': 1,
  'line.ch1.comp.on': 1,
  'line.ch1.comp.input': 0.3571428656578064,
  'line.ch1.comp.output': 1,
  'line.ch1.comp.attack': 0.8985878825187683,
  'line.ch1.comp.release': 0.8095237612724304,
  'line.ch1.comp.ratio': 0,
  'line.ch1.gate.on': 1,
  'line.ch1.gate.threshold': 0.5909090638160706,
  'line.ch1.gate.attack': 0.004999998025596142,
  'line.ch1.gate.release': 0.26499998569488525,
  'line.ch1.gate.range': 0,
  'line.ch1.gate.expander': true,
  'line.ch1.limit.limiteron': 0,
  'line.ch1.limit.threshold': 0.6149057149887085,
  'line.ch1.limit.release': 0.5,
  'line.ch1.filter.hpf': 2.013811162271395e-8,
  'line.ch1.opt.compmodel.value': 0.20000000298023224,  // FET compressor
  'line.ch1.opt.eqmodel.value': 0,                       // STANDARD EQ
}

describe('extractFatChannelState', () => {
  it('returns undefined when no fat channel keys present', () => {
    expect(extractFatChannelState({}, 'line.ch1')).toBeUndefined()
    expect(extractFatChannelState({ 'line.ch1.mute': false }, 'line.ch1')).toBeUndefined()
  })

  it('extracts 4 EQ bands from full state', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat).toBeDefined()
    expect(fat!.eqBands).toHaveLength(4)
  })

  it('sets parameterConfidence to guessed', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.parameterConfidence).toBe('guessed')
  })

  it('decodes EQ model from opt.eqmodel.value', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.eqModel).toBe('STANDARD')
  })

  it('decodes comp model from opt.compmodel.value', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.compModel).toBe('FET')
  })

  it('EQ master switch is enabled (eqallon=1)', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.eqEnabled).toBe(true)
  })

  it('EQ band 1 gain is in dB range [-18, +18]', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    const band1 = fat!.eqBands![0]!
    expect(band1.gainDb).toBeDefined()
    expect(band1.gainDb!).toBeGreaterThanOrEqual(-18)
    expect(band1.gainDb!).toBeLessThanOrEqual(18)
  })

  it('EQ band 1 frequency is in Hz range [20, 20000]', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    const band1 = fat!.eqBands![0]!
    expect(band1.frequencyHz).toBeDefined()
    expect(band1.frequencyHz!).toBeGreaterThanOrEqual(20)
    expect(band1.frequencyHz!).toBeLessThanOrEqual(20000)
  })

  it('EQ band 1 gain ~+1.5 dB (raw=0.5412, formula: (raw-0.5)*36)', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    // (0.5412 - 0.5) * 36 = 1.48 dB — GUESSED FORMULA, update after probe calibration
    expect(fat!.eqBands![0]!.gainDb!).toBeCloseTo(1.48, 0)
  })

  it('EQ band 1 freq ~42 Hz (raw=0.108, formula: 20*1000^raw)', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    // 20 * 1000^0.108 ≈ 42 Hz — GUESSED FORMULA, update after probe calibration
    expect(fat!.eqBands![0]!.frequencyHz!).toBeCloseTo(42, -1)  // within ±10 Hz
  })

  it('compressor is enabled (comp.on=1)', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.comp!.enabled).toBe(true)
  })

  it('comp threshold is in dBFS range [-60, 0]', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.comp!.thresholdDb!).toBeGreaterThanOrEqual(-60)
    expect(fat!.comp!.thresholdDb!).toBeLessThanOrEqual(0)
  })

  it('gate expander mode is true (gate.expander=true)', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.gate!.expander).toBe(true)
  })

  it('limiter is disabled (limiteron=0)', () => {
    const fat = extractFatChannelState(fatChannelFlat, 'line.ch1')
    expect(fat!.limiter!.enabled).toBe(false)
  })

  it('fat channel keys do NOT appear in channel rawExtra', () => {
    const stateWithFat: RawStateTree = {
      ...syntheticState32SC,
      ...fatChannelFlat,
    }
    const channels = extractLineChannels(stateWithFat)
    const ch1 = channels.find((c) => c.id === 'line.ch1')
    expect(ch1).toBeDefined()
    // Fat keys must NOT spill into rawExtra
    expect(ch1?.rawExtra?.['line.ch1.eq.eqgain1']).toBeUndefined()
    expect(ch1?.rawExtra?.['line.ch1.comp.on']).toBeUndefined()
    // fatChannel should be populated instead
    expect(ch1?.fatChannel).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Fader and preamp gain calibration tests
// HIL evidence: captures/probe-fader-preamp-cal/ (StudioLive 32SC fw 3.4.0.111374, 2026-07-01)
// 5 fader anchor points confirmed; preamp formula: dB = value x 60 (linear, 5/5 match)
// ---------------------------------------------------------------------------

describe('fader normalization and dB conversion � HIL 2026-07-01', () => {
  /** Calibrated flat state: volume uses real 0-100 raw scale from StudioLive */
  const calState: Record<string, unknown> = {
    'line.ch1.mute': false,
    'line.ch1.volume': 0,          // raw=0 -> -84 dB (minimum stop)
    'line.ch1.preampgain.value': 0.5333333611488342,  // -> 32 dB
    'line.ch2.mute': false,
    'line.ch2.volume': 100,        // raw=100 -> +10 dB (maximum)
    'line.ch2.preampgain.value': 0.36666667461395264, // -> 22 dB
    'line.ch3.mute': false,
    'line.ch3.volume': 73.3590841293335,  // raw=73.36 -> 0 dB (unity)
    'line.ch3.preampgain.value': 0.36666667461395264, // -> 22 dB
  }

  it('normalizes raw 0-100 volume to 0-1 linear (volume/100)', () => {
    /**
     * Verifies: fader.linear = volume / 100 (NOT Math.min(1, volume))
     * Given: Ch2 volume=100 (max), Ch3 volume=73.36 (unity)
     * Then:  Ch2 fader.linear=1.0, Ch3 fader.linear~0.7336
     */
    const chs = extractLineChannels(calState)
    const ch2 = chs.find(c => c.id === 'line.ch2')!
    const ch3 = chs.find(c => c.id === 'line.ch3')!
    expect(ch2.fader?.linear).toBeCloseTo(1.0, 3)
    expect(ch3.fader?.linear).toBeCloseTo(0.7336, 3)
  })

  it('fader.db at minimum (raw=0) = -84 dB', () => {
    /**
     * HIL anchor: Ch1 volume=0, UC Surface shows -84 dB (minimum stop)
     * StudioLive 32SC fw 3.4.0.111374, 2026-07-01
     */
    const chs = extractLineChannels(calState)
    const ch1 = chs.find(c => c.id === 'line.ch1')!
    expect(ch1.fader?.db).toBe(-84)
  })

  it('fader.db at unity (raw=73.36) = 0 dB', () => {
    /**
     * HIL anchor: Ch3 volume=73.36, UC Surface shows 0 dB (unity)
     */
    const chs = extractLineChannels(calState)
    const ch3 = chs.find(c => c.id === 'line.ch3')!
    expect(ch3.fader?.db).toBeCloseTo(0, 1)
  })

  it('fader.db at maximum (raw=100) = +10 dB', () => {
    /**
     * HIL anchor: Ch2 volume=100, UC Surface shows +10 dB (maximum)
     */
    const chs = extractLineChannels(calState)
    const ch2 = chs.find(c => c.id === 'line.ch2')!
    expect(ch2.fader?.db).toBeCloseTo(10, 1)
  })

  it('preampGainDb extracted correctly from preampgain.value', () => {
    /**
     * HIL anchors: formula dB = value x 60 (linear, 5/5 match)
     * Ch1: 0.5333 x 60 = 32 dB; Ch2/Ch3: 0.3667 x 60 = 22 dB
     */
    const chs = extractLineChannels(calState)
    const ch1 = chs.find(c => c.id === 'line.ch1')!
    const ch2 = chs.find(c => c.id === 'line.ch2')!
    const ch3 = chs.find(c => c.id === 'line.ch3')!
    expect(ch1.preampGainDb).toBeCloseTo(32, 0)
    expect(ch2.preampGainDb).toBeCloseTo(22, 0)
    expect(ch3.preampGainDb).toBeCloseTo(22, 0)
  })

  it('preampGainDb is undefined when preampgain key is absent', () => {
    const noPreamp: Record<string, unknown> = { 'line.ch4.mute': false, 'line.ch4.volume': 50 }
    const chs = extractLineChannels(noPreamp)
    const ch4 = chs.find(c => c.id === 'line.ch4')
    expect(ch4?.preampGainDb).toBeUndefined()
  })
})
