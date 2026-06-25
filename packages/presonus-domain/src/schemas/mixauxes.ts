/**
 * Aux mix schemas — monitor sends, IEM mixes, and monitor requirements validation.
 *
 * The agent provides rider-derived monitor expectations.
 * The MCP server checks the mixer's actual aux send state against those expectations.
 *
 * Design principle:
 *   - Agent owns: which sends the vocalist needs, from the rider
 *   - MCP owns: the actual aux send state from the mixer
 *
 * NOTE: Windows reserves "AUX" as a device name. This file is named mixauxes.ts
 * (cannot be named aux.ts on Windows).
 *
 * @module mixauxes-schemas
 * @implements REQ-F-AUX-001 — aux mix state exposure and monitor requirements validation
 * @architecture ADR-002 (#7): domain types never depend on adapter
 */
import { z } from 'zod'

/**
 * A single aux send — from a LINE channel to an AUX mix bus.
 * Pre/Post fader state is currently 'unknown' until hardware probed.
 */
export const AuxMixSendSchema = z.object({
  /** 1-based source line channel number */
  fromChannel: z.number().int().positive(),
  /** Channel name (from scribble strip) */
  fromChannelName: z.string(),
  /** 1-based aux mix number */
  auxMixNumber: z.number().int().positive(),
  /** Send level, normalized 0.0–1.0 */
  level: z.number().min(0).max(1),
  /** Send level in dBFS (approximate — computed from level) */
  levelDb: z.number(),
  /** Pre or post fader; 'unknown' when not determinable from current adapter */
  prePost: z.enum(['pre', 'post', 'unknown']),
  /** Whether this send is muted */
  muted: z.boolean(),
})
export type AuxMixSend = z.infer<typeof AuxMixSendSchema>

/** An aux mix bus with its master state and all sends */
export const AuxMixSchema = z.object({
  /** 1-based aux mix number */
  auxMixNumber: z.number().int().positive(),
  /** User-assigned name for this mix (e.g. "Wedge 1", "IEM L") */
  name: z.string(),
  /** Master output level, normalized 0.0–1.0 */
  masterLevel: z.number().min(0).max(1),
  /** Whether the mix master output is muted */
  masterMuted: z.boolean(),
  /** All sends contributing to this aux mix */
  sends: z.array(AuxMixSendSchema),
})
export type AuxMix = z.infer<typeof AuxMixSchema>

/** Summary of all aux mixes on a mixer */
export const AuxMixSummarySchema = z.object({
  deviceId: z.string(),
  capturedAt: z.string().datetime(),
  auxMixes: z.array(AuxMixSchema),
  _stale: z.boolean().optional(),
})
export type AuxMixSummary = z.infer<typeof AuxMixSummarySchema>

// ---------------------------------------------------------------------------
// Monitor requirements validation schemas
// ---------------------------------------------------------------------------

/** Minimum presence level required for a monitor send */
export const MonitorPresenceSchema = z.enum(['strong', 'medium', 'any'])
export type MonitorPresence = z.infer<typeof MonitorPresenceSchema>

/** An expected send in a monitor mix — from the agent/rider */
export const ExpectedMonitorSendSchema = z.object({
  /** 1-based physical channel number */
  channel: z.number().int().positive(),
  /** Signal name (from rider/agent) */
  name: z.string(),
  /** Minimum required presence level */
  minimumPresence: MonitorPresenceSchema,
})
export type ExpectedMonitorSend = z.infer<typeof ExpectedMonitorSendSchema>

/** Input for validate_monitor_requirements tool */
export const MonitorRequirementsInputSchema = z.object({
  deviceId: z.string(),
  /** 1-based aux mix number */
  auxMix: z.number().int().positive(),
  /** Agent-provided expected sends (from rider) */
  expectedSends: z.array(ExpectedMonitorSendSchema),
})
export type MonitorRequirementsInput = z.infer<typeof MonitorRequirementsInputSchema>

/** A single issue found during monitor requirements validation */
export const MonitorRequirementsIssueSchema = z.object({
  type: z.enum(['missing_monitor_send', 'muted_send', 'very_low_send', 'unexpectedly_hot_send']),
  auxMix: z.number().int().positive(),
  channel: z.number().int().positive(),
  name: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
})
export type MonitorRequirementsIssue = z.infer<typeof MonitorRequirementsIssueSchema>

/** Output of validate_monitor_requirements tool */
export const MonitorRequirementsResultSchema = z.object({
  status: z.enum(['ok', 'warning', 'problem']),
  issues: z.array(MonitorRequirementsIssueSchema),
})
export type MonitorRequirementsResult = z.infer<typeof MonitorRequirementsResultSchema>
