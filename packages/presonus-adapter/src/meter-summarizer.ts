/**
 * Meter data summarizer — ring buffer → MeterSummary.
 *
 * @module meter-summarizer
 * @implements #18 REQ-F-004: Expose meter summary as MCP resource
 * @implements #23 REQ-NF-003: State cache freshness ≤ 500 ms
 * @architecture #12 ARC-C-002: presonus-adapter package
 * @architecture #7 ADR-002: Three-layer architecture
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/18
 *
 * Raw meter streams are never exposed to MCP consumers.
 * This class maintains a ring buffer of raw meter packets and computes
 * time-windowed summaries classifying channels by signal activity.
 *
 * NOTE: dBFS conversion thresholds are APPROXIMATE until calibrated
 * empirically using the probe CLI on physical hardware.
 * Raw meter values from StudioLive are not documented; conversion formula TBD.
 */
import type { MeterSummary, ChannelMeterReading, GainHint } from '@presonus-mcp/domain'
import type { RawMeterPacket } from './types.js'

/** Threshold configuration for gain classification (to be verified empirically) */
interface ThresholdConfig {
  /** Raw value above which channel is classified as 'clipping' */
  clipThreshold: number
  /** Raw value above which channel is classified as 'hot' */
  hotThreshold: number
  /** Raw value above which channel is classified as 'ok' */
  okThreshold: number
  /** Raw value above which channel is classified as 'low' */
  lowThreshold: number
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  // Calibrated 2026-06-24 from StudioLive 32SC hardware capture (serial SD7E21010066).
  // Raw meter values are uint16 (0–65535). Empirical noise floor: ~220 (quiet room).
  // dBFS mapping assumes linear amplitude: dBFS = 20 * log10(value / 65535)
  //   clipThreshold ≈ -0.75 dBFS (60 000 / 65535)
  //   hotThreshold  ≈ -3.1 dBFS  (46 000 / 65535)
  //   okThreshold   ≈ -20 dBFS   (6 554 / 65535)
  //   lowThreshold  ≈ -40 dBFS   (655 / 65535)
  clipThreshold: 60_000,
  hotThreshold: 46_000,
  okThreshold: 6_554,
  lowThreshold: 655,
}

/**
 * Convert a raw uint16 meter value (0–65535) to dBFS.
 *
 * Formula: dBFS = 20 * log10(raw / 65535)
 *
 * VERIFIED: Threshold comments in this file cross-check to within 0.1 dB:
 *   clipThreshold 60000 → 20*log10(60000/65535) = -0.77 dBFS ✓
 *   hotThreshold  46000 → 20*log10(46000/65535) = -3.07 dBFS ✓
 *   okThreshold    6554 → 20*log10( 6554/65535) = -20.00 dBFS ✓
 *   lowThreshold    655 → 20*log10(  655/65535) = -40.00 dBFS ✓
 *
 * Returns null for raw ≤ 0 (no signal / below noise floor).
 *
 * OBSERVED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24)
 */
export function rawToDbfs(raw: number): number | null {
  if (raw <= 0) return null
  return 20 * Math.log10(raw / 65535)
}

function classifyLevel(rawValue: number, thresholds: ThresholdConfig): GainHint {
  if (rawValue >= thresholds.clipThreshold) return 'clipping'
  if (rawValue >= thresholds.hotThreshold) return 'hot'
  if (rawValue >= thresholds.okThreshold) return 'ok'
  if (rawValue >= thresholds.lowThreshold) return 'low'
  return 'no-signal'
}

/** Entry in the ring buffer */
interface BufferEntry {
  packet: RawMeterPacket
  receivedAt: number
}

export class PresonusMeterSummarizer {
  private readonly bufferMaxMs: number
  private readonly buffer: BufferEntry[] = []
  private readonly thresholds: ThresholdConfig
  /** Optional input list for expected-vs-actual comparison */
  private expectedChannelIds: Map<string, string> = new Map()

  constructor(options: {
    bufferMaxMs?: number
    thresholds?: Partial<ThresholdConfig>
  } = {}) {
    this.bufferMaxMs = options.bufferMaxMs ?? 60_000
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds }
  }

  /** Feed a raw meter packet into the ring buffer */
  ingest(packet: RawMeterPacket): void {
    const now = Date.now()
    this.buffer.push({ packet, receivedAt: now })
    // Evict entries older than bufferMaxMs
    const cutoff = now - this.bufferMaxMs
    let i = 0
    while (i < this.buffer.length && (this.buffer[i]?.receivedAt ?? 0) < cutoff) {
      i++
    }
    if (i > 0) {
      this.buffer.splice(0, i)
    }
  }

  /** Set the expected channel list from a loaded input list */
  setExpectedChannels(channelMap: Map<string, string>): void {
    this.expectedChannelIds = channelMap
  }

  /** Compute a meter summary over the last `windowSec` seconds */
  getSummary(windowSec: 1 | 10 | 60): MeterSummary {
    const now = Date.now()
    const cutoff = now - windowSec * 1000
    const windowEntries = this.buffer.filter((e) => e.receivedAt >= cutoff)

    if (windowEntries.length === 0) {
      return {
        windowSec,
        computedAt: new Date(now).toISOString(),
        silentChannels: [],
        activeChannels: [],
        clippingChannels: [],
        hotChannels: [],
        noSignalButExpected: [],
        signalButUnexpected: [],
      }
    }

    // Accumulate max reading per channel index across the window.
    // Initial value of -1 ensures channels with raw value 0 (no-signal) are tracked.
    const maxByIndex = new Map<number, number>()
    for (const { packet } of windowEntries) {
      packet.channels.forEach((val, idx) => {
        const current = maxByIndex.get(idx) ?? -1
        if (val > current) {
          maxByIndex.set(idx, val)
        }
      })
    }

    // Classify each channel
    const readings: ChannelMeterReading[] = []
    for (const [idx, maxVal] of maxByIndex) {
      readings.push({
        channelId: `line.ch${idx + 1}`,  // TODO: verify 0-based vs 1-based after probe
        db: rawToDbfs(maxVal),
        raw: maxVal,
        gainHint: classifyLevel(maxVal, this.thresholds),
        timestampMs: now,
      })
    }

    const silent = readings.filter((r) => r.gainHint === 'no-signal').map((r) => r.channelId)
    const active = readings.filter((r) => r.gainHint !== 'no-signal').map((r) => r.channelId)
    const clipping = readings.filter((r) => r.gainHint === 'clipping').map((r) => r.channelId)
    const hot = readings.filter((r) => r.gainHint === 'hot').map((r) => r.channelId)

    const activeSet = new Set(active)
    const silentSet = new Set(silent)

    const noSignalButExpected = [...this.expectedChannelIds.entries()]
      .filter(([channelId]) => silentSet.has(channelId))
      .map(([channelId, label]) => ({ channelId, label }))

    const signalButUnexpected = active.filter(
      (id) => this.expectedChannelIds.size > 0 && !this.expectedChannelIds.has(id),
    )

    // Build channelPeakDbfs map (active channels only — silent have no meaningful dBFS)
    const channelPeakDbfs: Record<string, number> = {}
    for (const r of readings) {
      if (r.db !== null) {
        channelPeakDbfs[r.channelId] = r.db
      }
    }

    return {
      windowSec,
      computedAt: new Date(now).toISOString(),
      silentChannels: silent,
      activeChannels: active,
      clippingChannels: clipping,
      hotChannels: hot,
      noSignalButExpected,
      signalButUnexpected,
      channelPeakDbfs: Object.keys(channelPeakDbfs).length > 0 ? channelPeakDbfs : undefined,
    }
  }
}
