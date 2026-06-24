/**
 * Tests for PresonusMeterSummarizer.
 *
 * Verifies: REQ-F-004 (#18)
 * TDD: Tests define classification behavior with synthetic meter data.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { PresonusMeterSummarizer } from '../meter-summarizer.js'

describe('PresonusMeterSummarizer', () => {
  let summarizer: PresonusMeterSummarizer

  beforeEach(() => {
    summarizer = new PresonusMeterSummarizer({
      // Use deterministic thresholds for tests
      thresholds: {
        clipThreshold: 250,
        hotThreshold: 220,
        okThreshold: 100,
        lowThreshold: 10,
      },
    })
  })

  it('returns empty summary when no packets ingested', () => {
    const summary = summarizer.getSummary(10)
    expect(summary.windowSec).toBe(10)
    expect(summary.silentChannels).toHaveLength(0)
    expect(summary.activeChannels).toHaveLength(0)
    expect(summary.clippingChannels).toHaveLength(0)
  })

  it('classifies a clipping channel correctly', () => {
    summarizer.ingest({
      channels: [255, 50, 0],  // ch1: clipping, ch2: ok, ch3: no-signal
      timestamp: Date.now(),
    })
    const summary = summarizer.getSummary(10)
    expect(summary.clippingChannels).toContain('line.ch1')
    expect(summary.activeChannels).toContain('line.ch2')
    expect(summary.silentChannels).toContain('line.ch3')
  })

  it('classifies a hot channel correctly', () => {
    summarizer.ingest({ channels: [225, 0, 0], timestamp: Date.now() })
    const summary = summarizer.getSummary(10)
    expect(summary.hotChannels).toContain('line.ch1')
    expect(summary.clippingChannels).not.toContain('line.ch1')
  })

  it('reports noSignalButExpected when input list is set', () => {
    summarizer.setExpectedChannels(new Map([
      ['line.ch3', 'Lead Vox'],
      ['line.ch4', 'Backing Vox'],
    ]))
    summarizer.ingest({
      channels: [200, 200, 0, 0],  // ch3 and ch4 are silent
      timestamp: Date.now(),
    })
    const summary = summarizer.getSummary(10)
    const expectedIds = summary.noSignalButExpected.map((e) => e.channelId)
    expect(expectedIds).toContain('line.ch3')
    expect(summary.noSignalButExpected.find((e) => e.channelId === 'line.ch3')?.label).toBe('Lead Vox')
  })

  it('reports signalButUnexpected when input list is set', () => {
    summarizer.setExpectedChannels(new Map([['line.ch1', 'Kick']]))
    summarizer.ingest({
      channels: [200, 200],  // ch2 has signal but is not in expected list
      timestamp: Date.now(),
    })
    const summary = summarizer.getSummary(10)
    expect(summary.signalButUnexpected).toContain('line.ch2')
    expect(summary.signalButUnexpected).not.toContain('line.ch1')
  })

  it('uses max value across multiple packets in window', () => {
    summarizer.ingest({ channels: [50, 0], timestamp: Date.now() })
    summarizer.ingest({ channels: [260, 0], timestamp: Date.now() })  // ch1 clips briefly
    const summary = summarizer.getSummary(10)
    expect(summary.clippingChannels).toContain('line.ch1')
  })

  it('computedAt is a valid ISO datetime string', () => {
    summarizer.ingest({ channels: [100], timestamp: Date.now() })
    const summary = summarizer.getSummary(1)
    expect(() => new Date(summary.computedAt)).not.toThrow()
    expect(new Date(summary.computedAt).getTime()).toBeGreaterThan(0)
  })
})
