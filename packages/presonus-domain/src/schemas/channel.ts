/**
 * Normalized mixer channel schemas.
 *
 * @module channel-schemas
 * @implements #17 REQ-F-003: Expose normalized channel list as MCP resource
 * @architecture #11 ARC-C-001: presonus-domain package — Zod schemas
 * @architecture #7 ADR-002: Three-layer architecture
 *
 * ChannelType values mirror featherbear ChannelTypes enum (ADR-004 #9).
 * Key mapping is empirically determined via presonus-probe CLI (ARC-C-003 #13).
 */
import { z } from 'zod'
import { ChannelFatStateSchema } from './fat-channel.js'
import { ChannelSendRoutingSchema } from './routing.js'

/**
 * Channel type enum — matches featherbear `ChannelTypes`.
 * Verified against @featherbear/presonus-studiolive-api v1.8.0
 */
export const ChannelTypeSchema = z.enum([
  'LINE',
  'RETURN',
  'FXRETURN',
  'TALKBACK',
  'AUX',
  'FX',
  'SUB',
  'MAIN',
])
export type ChannelType = z.infer<typeof ChannelTypeSchema>

/**
 * Unambiguous address for a single channel on a mixer.
 * For send-context channels (e.g. AUX send on LINE channel), use mixType + mixNumber.
 */
export const ChannelSelectorSchema = z.object({
  type: ChannelTypeSchema,
  channel: z.number().int().positive(),
  /** For send-context: the destination mix type (AUX/FX) */
  mixType: z.enum(['AUX', 'FX']).optional(),
  /** For send-context: the destination mix number */
  mixNumber: z.number().int().positive().optional(),
})
export type ChannelSelector = z.infer<typeof ChannelSelectorSchema>

/** Fader state in multiple units for agent readability */
export const FaderStateSchema = z.object({
  /** Level in dBFS (null = unknown / pre-mapping) */
  db: z.number().nullable().optional(),
  /** Linear value 0–1.0 as reported by mixer (null = unknown) */
  linear: z.number().min(0).max(1).nullable().optional(),
  /** Raw value from mixer state for diagnostic purposes */
  raw: z.unknown().optional(),
})
export type FaderState = z.infer<typeof FaderStateSchema>

/**
 * Normalized channel state — primary agent-facing channel model.
 * Unknown/unmapped fields from raw mixer state are preserved in `rawExtra`.
 */
export const MixerChannelSchema = z.object({
  /** Unique channel ID within this mixer snapshot, e.g. "line.ch1" */
  id: z.string(),
  selector: ChannelSelectorSchema,
  /** Channel label as set on the mixer (from opt.username; falls back to opt.name) */
  name: z.string().optional(),
  /** true = channel is muted */
  mute: z.boolean().optional(),
  /** true = channel is soloed */
  solo: z.boolean().optional(),
  fader: FaderStateSchema.optional(),
  /**
   * Pan position 0.0 (full left) – 1.0 (full right), 0.5 = center.
   * OBSERVED on StudioLive 32SC fw 3.3.0.109659
   */
  pan: z.number().min(0).max(1).optional(),
  /** true = channel is stereo-linked with adjacent channel */
  linked: z.boolean().optional(),
  /** Channel color as RGBA hex string e.g. "0000ffff" (blue, full opacity) */
  color: z.string().optional(),
  /**
   * Active Fat Channel compressor model name (normalized enum).
   * Decoded from line.chN.opt.compmodel.value.
   * Examples: "STANDARD", "FET", "TUBE", "COMP_160", "EVEREST_C100A"
   */
  compModelName: z.string().optional(),
  /**
   * Active Fat Channel EQ model name (normalized enum).
   * Decoded from line.chN.opt.eqmodel.value.
   * Examples: "STANDARD", "PASSIVE", "VINTAGE"
   */
  eqModelName: z.string().optional(),
  /**
   * Preamp gain in dB (0–60 dB range).
   * Key: line.chN.preampgain.value (normalized 0–1), formula: dB = value × 60 (linear).
   * OBSERVED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01): 5 anchor points match exactly.
   */
  preampGainDb: z.number().min(0).max(60).optional(),
  /**
   * Normalized Fat Channel DSP state: EQ bands, compressor, gate, limiter.
   * Values in real units (dB, Hz, ms). parameterConfidence='guessed' until
   * probe-fat-channel calibration confirms de-normalization formulas.
   * Absent when no DSP state is available in the current snapshot.
   */
  fatChannel: ChannelFatStateSchema.optional(),
  /**
   * Per-channel send routing: AUX sends (1–32), FX sends (FXA–FXH), subgroup assigns (1–4).
   * Send levels are raw 0–1 linear values (parameterConfidence='guessed' until AUX probe).
   * Absent when routing state not yet received from mixer.
   */
  sendRouting: ChannelSendRoutingSchema.optional(),
  /** Raw fields from mixer state not yet mapped to normalized fields */
  rawExtra: z.record(z.string(), z.unknown()).optional(),
})
export type MixerChannel = z.infer<typeof MixerChannelSchema>
