/**
 * Soundcheck diagnostic scenario tests.
 *
 * Verifies: #3 StR — Soundcheck assistance via read-only mixer diagnostics
 *
 * These tests demonstrate that the MCP infrastructure (meter summarizer +
 * channel state) is sufficient for AI-assisted soundcheck diagnostics WITHOUT
 * any new tools. The agent uses existing resources:
 *   - presonus://mixer/{id}/meters/summary  → signal activity classification
 *   - presonus://mixer/{id}/channels        → mute/name/fader/fatChannel state
 *
 * Acceptance criteria from #3:
 *   1. Identify channels with no signal when signal is expected  → noSignalButExpected
 *   2. Identify channels clipping or running hot                → clippingChannels / hotChannels
 *   3. Detect channels muted unexpectedly                       → mute: true in channels resource
 *   4. Detect active signal on a muted channel (possible mute oversight)
 *
 * No hardware required — uses synthetic meter packets and state.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { PresonusMeterSummarizer } from '../meter-summarizer.js'
import { extractLineChannels } from '../state-mapper.js'

// ---------------------------------------------------------------------------
// Scenario 1: Detect silent channel that should have signal (#3 criterion 1)
// ---------------------------------------------------------------------------

describe('Soundcheck scenario 1: silent-but-expected channel', () => {
  let summarizer: PresonusMeterSummarizer

  beforeEach(() => {
    summarizer = new PresonusMeterSummarizer()
    // Load input list: Lead Vox (ch7) and Kick (ch1) expected
    summarizer.setExpectedChannels(new Map([
      ['line.ch7', 'Lead Vox'],
      ['line.ch1', 'Kick'],
    ]))
  })

  it('detects lead vocal mic with no signal in noSignalButExpected', () => {
    // 10 seconds of silence on ch7 (lead vox), active signal on ch1 (kick)
    for (let i = 0; i < 20; i++) {
      summarizer.ingest({
        channels: [8000, 0, 0, 0, 0, 0, 0, 0],  // ch1=active, ch7=silent
        timestamp: Date.now(),
      })
    }
    const summary = summarizer.getSummary(10)
    const noSignalIds = summary.noSignalButExpected.map((e) => e.channelId)
    expect(noSignalIds).toContain('line.ch7')
    const entry = summary.noSignalButExpected.find((e) => e.channelId === 'line.ch7')
    expect(entry?.label).toBe('Lead Vox')
    // Kick is active, so NOT in noSignalButExpected
    expect(noSignalIds).not.toContain('line.ch1')
  })

  it('confirms kick drum is active when signal present', () => {
    summarizer.ingest({ channels: [50000, 0, 0, 0, 0, 0, 0, 0], timestamp: Date.now() })
    const summary = summarizer.getSummary(10)
    expect(summary.activeChannels).toContain('line.ch1')
    expect(summary.silentChannels).not.toContain('line.ch1')
  })
})

// ---------------------------------------------------------------------------
// Scenario 2: Detect clipping channel (#3 criterion 2)
// ---------------------------------------------------------------------------

describe('Soundcheck scenario 2: clipping channel detection', () => {
  let summarizer: PresonusMeterSummarizer

  beforeEach(() => {
    summarizer = new PresonusMeterSummarizer()
  })

  it('detects vocalist clipping (gain too hot before soundcheck correction)', () => {
    // ch3 (lead vox) clipping at 62000 (above 60000 clip threshold)
    summarizer.ingest({
      channels: [8000, 6000, 62000, 5000],  // ch3 = clipping
      timestamp: Date.now(),
    })
    const summary = summarizer.getSummary(10)
    expect(summary.clippingChannels).toContain('line.ch3')
    expect(summary.channelPeakDbfs?.['line.ch3']).toBeDefined()
    // Peak dBFS should be close to 0 (very hot)
    const peakDb = summary.channelPeakDbfs?.['line.ch3'] ?? -Infinity
    expect(peakDb).toBeGreaterThan(-1.5)  // near 0 dBFS
  })

  it('detects hot-but-not-clipping channel — agent recommends gain reduction', () => {
    // ch2 (snare) running hot at 48000 (above 46000 hot threshold, below 60000 clip)
    summarizer.ingest({ channels: [0, 48000, 0], timestamp: Date.now() })
    const summary = summarizer.getSummary(10)
    expect(summary.hotChannels).toContain('line.ch2')
    expect(summary.clippingChannels).not.toContain('line.ch2')
  })
})

// ---------------------------------------------------------------------------
// Scenario 3: Muted channel with active signal (#3 criterion 3 + 4)
// ---------------------------------------------------------------------------

describe('Soundcheck scenario 3: muted channel with meter activity', () => {
  it('agent can correlate mute=true on a channel that also has active meter signal', () => {
    // Channel 5 is muted in state (e.g. engineer muted it by accident)
    const flatState: Record<string, unknown> = {
      'line.ch5.name': 'Bass DI',
      'line.ch5.mute': true,         // ← muted!
      'line.ch5.volume': 0.75,
      'line.ch5.pan': 0.5,
      'line.ch5.solo': false,
    }
    const channels = extractLineChannels(flatState)
    const ch5 = channels.find((c) => c.id === 'line.ch5')

    // Meter: ch5 (index 4) has active signal at 20000
    const summarizer = new PresonusMeterSummarizer()
    summarizer.ingest({ channels: [0, 0, 0, 0, 20000, 0, 0, 0], timestamp: Date.now() })
    const summary = summarizer.getSummary(10)

    // Agent can combine both facts:
    // 1. Channel has mute=true
    expect(ch5?.mute).toBe(true)
    expect(ch5?.name).toBe('Bass DI')
    // 2. Channel has active meter signal
    expect(summary.activeChannels).toContain('line.ch5')

    // Combined: "Bass DI is muted but receiving signal — possible mute oversight"
    const isMutedWithSignal = ch5?.mute === true && summary.activeChannels.includes('line.ch5')
    expect(isMutedWithSignal).toBe(true)
  })

  it('channel correctly shown as not-muted when mute=false', () => {
    const flatState: Record<string, unknown> = {
      'line.ch1.name': 'Kick',
      'line.ch1.mute': false,
      'line.ch1.volume': 0.8,
    }
    const channels = extractLineChannels(flatState)
    const ch1 = channels.find((c) => c.id === 'line.ch1')
    expect(ch1?.mute).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Scenario 4: Stale state visible during soundcheck (#3 criterion 5 + isStale)
// ---------------------------------------------------------------------------

describe('Soundcheck scenario 4: stale state during disconnect', () => {
  it('last known channel state preserved when mixer disconnects mid-soundcheck', () => {
    // Pre-disconnect: good state with channels
    const flatState: Record<string, unknown> = {
      'line.ch1.name': 'Kick In',
      'line.ch1.mute': false,
      'line.ch1.volume': 0.75,
      'line.ch2.name': 'Snare Top',
      'line.ch2.mute': false,
      'line.ch2.volume': 0.70,
    }
    const channels = extractLineChannels(flatState)
    expect(channels.length).toBe(2)  // both channels present

    // Simulate what happens when snapshot is marked stale after disconnect:
    // The snapshot is preserved (not cleared) — channels still accessible
    // This is tested in client-manager.test.ts ('snapshot is preserved after disconnect')
    // Here we verify the channel data is structurally sound for agent use

    const kick = channels.find((c) => c.id === 'line.ch1')
    expect(kick?.name).toBe('Kick In')
    expect(kick?.mute).toBe(false)
  })

  it('meter summary correctly classifies channels when no packets arrive (empty window)', () => {
    const summarizer = new PresonusMeterSummarizer()
    // No packets ingested — simulates disconnected state
    const summary = summarizer.getSummary(10)
    // All arrays empty — agent knows no data available
    expect(summary.silentChannels).toHaveLength(0)
    expect(summary.activeChannels).toHaveLength(0)
    expect(summary.windowSec).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Scenario 5: Unexpected signal on a channel not in input list (#3 criterion 5)
// ---------------------------------------------------------------------------

describe('Soundcheck scenario 5: unexpected signal detection', () => {
  it('flags channel with signal not present in input list as signalButUnexpected', () => {
    const summarizer = new PresonusMeterSummarizer()
    // Input list: only ch1 (Kick) and ch2 (Snare) expected
    summarizer.setExpectedChannels(new Map([
      ['line.ch1', 'Kick'],
      ['line.ch2', 'Snare'],
    ]))

    // Meter: ch3 (maybe a ghost signal / wrong patch) also has signal
    summarizer.ingest({
      channels: [8000, 8000, 15000],  // ch1+ch2 expected, ch3 unexpected
      timestamp: Date.now(),
    })

    const summary = summarizer.getSummary(10)
    expect(summary.signalButUnexpected).toContain('line.ch3')
    expect(summary.signalButUnexpected).not.toContain('line.ch1')  // expected, so not flagged
    expect(summary.signalButUnexpected).not.toContain('line.ch2')
  })
})
