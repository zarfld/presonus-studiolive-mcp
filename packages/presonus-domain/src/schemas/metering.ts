/**
 * Meter summary schemas.
 *
 * @module metering-schemas
 * @implements #18 REQ-F-004: Expose meter summary as MCP resource
 * @implements #23 REQ-NF-003: State cache freshness ≤ 500 ms
 * @architecture #11 ARC-C-001: presonus-domain package — Zod schemas
 * @architecture #7 ADR-002: Three-layer architecture
 *
 * Raw meter streams are NOT exposed to MCP consumers.
 * Agents receive time-windowed summaries that classify channels
 * by signal activity — safe for agent context consumption.
 *
 * Threshold reference (TODO: verify empirically with probe CLI):
 *   clipping  >= 0 dBFS (digital full-scale)
 *   hot       >= -6 dBFS
 *   ok        >= -40 dBFS
 *   low       >= -60 dBFS
 *   no-signal  < -60 dBFS
 */
import { z } from 'zod'

/** Semantic signal-level classification for a channel */
export const GainHintSchema = z.enum([
  'no-signal',
  'low',
  'ok',
  'hot',
  'clipping',
])
export type GainHint = z.infer<typeof GainHintSchema>

/**
 * Time-windowed meter summary for a mixer.
 * The primary resource exposed to AI agents for soundcheck diagnostics.
 * REF: presonus://mixer/{deviceId}/meters/summary
 */
export const MeterSummarySchema = z.object({
  /** Observation window in seconds (1, 10, or 60) */
  windowSec: z.number().int().positive(),
  /** ISO 8601 timestamp when this summary was computed */
  computedAt: z.string().datetime(),
  /** Channels with no measurable signal during the window */
  silentChannels: z.array(z.string()),
  /** Channels with active signal during the window */
  activeChannels: z.array(z.string()),
  /** Channels that clipped (>= 0 dBFS) during the window */
  clippingChannels: z.array(z.string()),
  /** Channels running hot (-6 to 0 dBFS) during the window */
  hotChannels: z.array(z.string()),
  /**
   * Channels in the loaded input list that showed no signal.
   * Empty when no input list is loaded.
   */
  noSignalButExpected: z.array(
    z.object({ channelId: z.string(), label: z.string() }),
  ),
  /**
   * Channels with signal that were not in the loaded input list.
   * Empty when no input list is loaded.
   */
  signalButUnexpected: z.array(z.string()),
  /**
   * Peak dBFS per channel over the observation window.
   * Formula: 20 * log10(rawPeak / 65535) — empirically verified against
   * threshold comments in meter-summarizer.ts (2026-06-24).
   * Absent for channels with no signal (raw=0).
   */
  channelPeakDbfs: z.record(z.string(), z.number()).optional(),
})
export type MeterSummary = z.infer<typeof MeterSummarySchema>

/** Per-channel instantaneous meter reading (internal, not exposed to MCP) */
export const ChannelMeterReadingSchema = z.object({
  channelId: z.string(),
  /** Level in dBFS (converted from raw mixer value; null = conversion not yet implemented) */
  db: z.number().nullable(),
  raw: z.number(),
  gainHint: GainHintSchema,
  timestampMs: z.number(),
})
export type ChannelMeterReading = z.infer<typeof ChannelMeterReadingSchema>
