/**
 * Tests for diagnostics.ts — channel diagnosis logic.
 *
 * Verifies: REQ-F-DIAG-001 — diagnoseChannel() combines mute/fader/solo/meter state
 * into structured diagnosis with likelyCauses and safeNextSteps.
 *
 * TDD: RED phase — written before diagnostics.ts exists in adapter.
 */
import { describe, it, expect } from 'vitest'
import { diagnoseChannel, analyzeLineCheckStep } from '../diagnostics.js'
import type { MixerSnapshot } from '../state-mapper.js'
import type { MixerIdentity } from '@presonus-mcp/domain'

const mockIdentity: MixerIdentity = {
  deviceId: 'serial:TEST',
  serial: 'TEST',
  ip: '192.168.1.1',
  port: 53000,
  lastSeen: new Date().toISOString(),
  role: 'FOH',
  controllable: false,
  confidence: 'observed',
}

function makeSnapshot(channels: Partial<{
  id: string
  name: string
  mute: boolean
  fader?: { linear: number; dB: number | null; raw: number }
  solo: boolean
}>[]): MixerSnapshot {
  return {
    identity: mockIdentity,
    channels: channels.map((c, i) => ({
      id: c.id ?? `line.ch${i + 1}`,
      name: c.name ?? `Ch ${i + 1}`,
      type: 'LINE' as const,
      mute: c.mute ?? false,
      solo: c.solo ?? false,
      pan: 0.5,
      color: undefined,
      linked: false,
      fader: c.fader ?? { linear: 0.75, dB: -3, raw: 0.75 },
      sendRouting: undefined,
      fatChannel: undefined,
    })),
    currentProject: undefined,
    currentScene: undefined,
    availableProjects: [],
    capturedAt: new Date().toISOString(),
    rawState: {},
    flatState: {},
    isStale: false,
    disconnectedAt: undefined,
    outputPatch: undefined,
  }
}

describe('diagnoseChannel', () => {
  it('reports muted channel as problem with mute cause', () => {
    const snapshot = makeSnapshot([{ id: 'line.ch8', name: 'Lead Vox', mute: true }])
    const result = diagnoseChannel(snapshot, 8, null, 'Lead Vox')
    expect(result.status).toBe('problem')
    const muteCheck = result.checks.find((c) => c.check === 'mute')
    expect(muteCheck?.result).toBe('muted')
    expect(result.mostLikelyCauses).toContain('Channel is muted')
  })

  it('reports fader-down channel as problem', () => {
    const snapshot = makeSnapshot([{
      id: 'line.ch1',
      name: 'Kick',
      mute: false,
      fader: { linear: 0.0, dB: null, raw: 0.0 },
    }])
    const result = diagnoseChannel(snapshot, 1, null, undefined)
    expect(result.status).toBe('problem')
    const faderCheck = result.checks.find((c) => c.check === 'fader')
    expect(faderCheck?.result).toBe('fader_down')
    expect(result.mostLikelyCauses.some((c) => c.toLowerCase().includes('fader'))).toBe(true)
  })

  it('reports ok when channel is unmuted with fader up and active signal', () => {
    const snapshot = makeSnapshot([{
      id: 'line.ch1',
      name: 'Kick',
      mute: false,
      fader: { linear: 0.75, dB: -3, raw: 0.75 },
    }])
    // Simulate active signal via meter summary
    const meterSummary = {
      windowSec: 10,
      computedAt: new Date().toISOString(),
      silentChannels: [],
      activeChannels: ['line.ch1'],
      clippingChannels: [],
      hotChannels: [],
      noSignalButExpected: [],
      signalButUnexpected: [],
    }
    const result = diagnoseChannel(snapshot, 1, meterSummary, undefined)
    expect(result.status).toBe('ok')
    expect(result.mostLikelyCauses).toHaveLength(0)
  })

  it('returns channel not found when channel number does not exist', () => {
    const snapshot = makeSnapshot([{ id: 'line.ch1', name: 'Kick' }])
    const result = diagnoseChannel(snapshot, 99, null, undefined)
    expect(result.status).toBe('problem')
    expect(result.mostLikelyCauses.some((c) => c.toLowerCase().includes('not found'))).toBe(true)
  })
})

describe('analyzeLineCheckStep', () => {
  it('detects silent expected channel', () => {
    const snapshot = makeSnapshot([
      { id: 'line.ch1', name: 'Kick' },
      { id: 'line.ch2', name: 'Snare' },
    ])
    const meterSummary = {
      windowSec: 10,
      computedAt: new Date().toISOString(),
      silentChannels: ['line.ch1'],
      activeChannels: ['line.ch2'],
      clippingChannels: [],
      hotChannels: [],
      noSignalButExpected: [],
      signalButUnexpected: [],
    }
    const result = analyzeLineCheckStep(
      snapshot,
      [{ channel: 1, name: 'Kick' }],
      [],
      meterSummary,
    )
    expect(result.status).toBe('problem')
    const kickEntry = result.expectedActive.find((c) => c.channel === 1)
    expect(kickEntry?.signal).toBe('silent')
  })

  it('detects unexpected active channel and flags possible swap', () => {
    const snapshot = makeSnapshot([
      { id: 'line.ch1', name: 'Kick' },
      { id: 'line.ch2', name: 'Snare' },
    ])
    const meterSummary = {
      windowSec: 10,
      computedAt: new Date().toISOString(),
      silentChannels: ['line.ch1'],
      activeChannels: ['line.ch2'],
      clippingChannels: [],
      hotChannels: [],
      noSignalButExpected: [],
      signalButUnexpected: [],
    }
    const result = analyzeLineCheckStep(
      snapshot,
      [{ channel: 1, name: 'Kick' }],
      [],  // no allowed other channels
      meterSummary,
    )
    // ch2 is active but not expected and not allowed → unexpected
    expect(result.unexpectedActive.some((c) => c.channel === 2)).toBe(true)
    // Expected silent + adjacent unexpected active → swap suspicion
    expect(result.suspicions.some((s) => s.type === 'possible_patch_swap')).toBe(true)
  })

  it('returns ok when expected channel is active and nothing else', () => {
    const snapshot = makeSnapshot([
      { id: 'line.ch1', name: 'Kick' },
    ])
    const meterSummary = {
      windowSec: 10,
      computedAt: new Date().toISOString(),
      silentChannels: [],
      activeChannels: ['line.ch1'],
      clippingChannels: [],
      hotChannels: [],
      noSignalButExpected: [],
      signalButUnexpected: [],
    }
    const result = analyzeLineCheckStep(
      snapshot,
      [{ channel: 1, name: 'Kick' }],
      [],
      meterSummary,
    )
    expect(result.status).toBe('ok')
    expect(result.suspicions).toHaveLength(0)
  })
})
