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
 * @implements #41 REQ-F-AUX-001 — aux mix state exposure and monitor requirements validation
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

// ---------------------------------------------------------------------------
// Zero-expectation aux mix audit schemas (ADR-008 Layer A tools)
// Used by: validate_aux_mix, find_missing_monitor_sends, find_muted_monitor_sends,
//          find_hot_monitor_sends
// ---------------------------------------------------------------------------

/**
 * Default threshold in dBFS above which a send is considered "hot".
 * Level 1.0 linear = 0 dBFS; threshold -6 dBFS ≈ linear 0.501.
 */
export const HOT_SEND_THRESHOLD_DB = -6

/**
 * A single issue found during a zero-expectation aux mix audit.
 * Does not require agent-provided rider expectations — audits the mix's own state.
 */
export const AuxMixAuditIssueSchema = z.object({
  issueType: z.enum([
    'unassigned_send',  // send level > 0 but assigned = false (signal not routed)
    'muted_send',       // assigned = true but mute key active
    'very_low_send',    // assigned and not muted but level near zero (< 0.05 linear)
    'hot_send',         // send level above configurable threshold (default -6 dBFS)
    'master_muted',     // aux mix master output is muted
  ]),
  auxMixNumber: z.number().int().positive(),
  /** Channel number; 0 is used for aux-level issues (e.g. master_muted) */
  channel: z.number().int().min(0),
  channelName: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  /** Human-readable description of the issue */
  detail: z.string(),
  /** Send level at time of audit (0.0–1.0) */
  level: z.number().min(0).max(1).optional(),
  /** Approximate dBFS (−Infinity represented as null) */
  levelDb: z.number().nullable().optional(),
})
export type AuxMixAuditIssue = z.infer<typeof AuxMixAuditIssueSchema>

/** Result of validate_aux_mix — zero-expectation audit of one aux mix bus */
export const AuxMixAuditResultSchema = z.object({
  auxMixNumber: z.number().int().positive(),
  name: z.string(),
  masterLevel: z.number().min(0).max(1),
  masterMuted: z.boolean(),
  sendCount: z.number().int(),
  status: z.enum(['ok', 'warning', 'problem']),
  issues: z.array(AuxMixAuditIssueSchema),
  /** Threshold used for hot_send detection (dBFS) */
  hotThresholdDb: z.number(),
})
export type AuxMixAuditResult = z.infer<typeof AuxMixAuditResultSchema>

// ---------------------------------------------------------------------------
// Monitor layout and stereo-pair schemas (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Classification of an aux bus for monitor mixing purposes.
 * Stereo pairs (e.g. IEM L/R) are modelled as two buses with pairedWithBus set.
 */
export const MonitorBusTypeSchema = z.enum(['mono', 'stereo-left', 'stereo-right', 'iem-stereo'])
export type MonitorBusType = z.infer<typeof MonitorBusTypeSchema>

/** One aux bus in the monitor mix layout */
export const MonitorBusLayoutEntrySchema = z.object({
  /** 1-based aux bus number */
  auxBus: z.number().int().positive(),
  /** User-assigned or inferred bus name (e.g. "Wedge 1", "IEM L") */
  name: z.string().optional(),
  type: MonitorBusTypeSchema,
  /** For stereo-left/right: the paired bus number */
  pairedWithBus: z.number().int().positive().optional(),
  /** Confidence of stereo-pair inference */
  inferenceConfidence: z.enum(['observed', 'inferred', 'unknown']).optional(),
})
export type MonitorBusLayoutEntry = z.infer<typeof MonitorBusLayoutEntrySchema>

/** Complete monitor layout for a mixer */
export const MonitorLayoutSchema = z.object({
  deviceId: z.string(),
  capturedAt: z.string().datetime(),
  /** All aux buses, ordered 1…N */
  auxBuses: z.array(MonitorBusLayoutEntrySchema),
  /** Inferred stereo pairs — confidence 'inferred' unless probe-confirmed */
  inferredPairs: z.array(z.object({
    leftBus: z.number().int().positive(),
    rightBus: z.number().int().positive(),
    confidence: z.enum(['observed', 'inferred']),
  })),
})
export type MonitorLayout = z.infer<typeof MonitorLayoutSchema>

/** Input to validate_stereo_monitor_pair */
export const StereoPairInputSchema = z.object({
  deviceId: z.string(),
  /** Left aux bus number (1-based) */
  auxBusLeft: z.number().int().positive(),
  /** Right aux bus number (1-based) */
  auxBusRight: z.number().int().positive(),
  /** Optional user-facing name for the IEM/stereo pair */
  pairName: z.string().optional(),
  /** Optional: channel numbers expected to have sends on both buses */
  expectedSendChannels: z.array(z.number().int().positive()).optional(),
})
export type StereoPairInput = z.infer<typeof StereoPairInputSchema>

/** Result of validate_stereo_monitor_pair */
export const StereoPairValidationResultSchema = z.object({
  auxBusLeft: z.number().int().positive(),
  auxBusRight: z.number().int().positive(),
  pairName: z.string().optional(),
  valid: z.boolean(),
  issues: z.array(z.string()),
  leftSendCount: z.number().int(),
  rightSendCount: z.number().int(),
  /** Channels present on left but missing on right (or vice versa) */
  asymmetricChannels: z.array(z.number().int().positive()),
})
export type StereoPairValidationResult = z.infer<typeof StereoPairValidationResultSchema>

