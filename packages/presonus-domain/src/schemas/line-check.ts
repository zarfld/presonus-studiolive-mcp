/**
 * Line check step schemas — input/output for analyze_line_check_step tool.
 *
 * The agent says "we are checking Kick on channel 1 now."
 * The MCP server observes the mixer meters and reports signal behaviour.
 *
 * @module line-check-schemas
 * @implements #74 REQ-F-LINECHK-001 — analyze_line_check_step tool contract
 * @architecture ADR-002 (#7): domain types never depend on adapter
 */
import { z } from 'zod'

/** A single expected-active channel entry (1-based physical channel number) */
export const ExpectedActiveChannelSchema = z.object({
  /** 1-based physical channel number matching the mixer's front-panel label */
  channel: z.number().int().positive(),
  /** Human label for this source (e.g. "Kick", "Lead Vox") — from agent/rider */
  name: z.string(),
})
export type ExpectedActiveChannel = z.infer<typeof ExpectedActiveChannelSchema>

/** Input for the analyze_line_check_step tool */
export const LineCheckStepInputSchema = z.object({
  /** Mixer device ID from discover_mixers */
  deviceId: z.string(),
  /** Channels the agent expects to be active right now */
  expectedActiveChannels: z.array(ExpectedActiveChannelSchema),
  /** Channels the agent knows may also be active (e.g. ambient mics, talkback) */
  allowedOtherChannels: z.array(ExpectedActiveChannelSchema).optional().default([]),
  /** Meter observation window in seconds */
  windowSec: z.number().int().positive().optional().default(10),
})
export type LineCheckStepInput = z.infer<typeof LineCheckStepInputSchema>

/** Signal state for a channel in a line check result */
export const ChannelSignalStateSchema = z.enum(['active', 'silent', 'clipping', 'hot', 'unknown'])
export type ChannelSignalState = z.infer<typeof ChannelSignalStateSchema>

/** A channel entry in the line check result */
export const LineCheckChannelEntrySchema = z.object({
  channel: z.number().int().positive(),
  name: z.string(),
  signal: ChannelSignalStateSchema,
  peakDb: z.number().optional(),
})
export type LineCheckChannelEntry = z.infer<typeof LineCheckChannelEntrySchema>

/** Confidence level for a line-check suspicion */
export const SuspicionConfidenceSchema = z.enum(['high', 'medium', 'low'])
export type SuspicionConfidence = z.infer<typeof SuspicionConfidenceSchema>

/** A suspected problem flagged by the line check */
export const LineCheckSuspicionSchema = z.object({
  type: z.string(),
  expected: z.string(),
  observed: z.string(),
  confidence: SuspicionConfidenceSchema,
})
export type LineCheckSuspicion = z.infer<typeof LineCheckSuspicionSchema>

/** Output of the analyze_line_check_step tool */
export const LineCheckStepResultSchema = z.object({
  status: z.enum(['ok', 'warning', 'problem']),
  expectedActive: z.array(LineCheckChannelEntrySchema),
  unexpectedActive: z.array(LineCheckChannelEntrySchema),
  suspicions: z.array(LineCheckSuspicionSchema),
})
export type LineCheckStepResult = z.infer<typeof LineCheckStepResultSchema>
