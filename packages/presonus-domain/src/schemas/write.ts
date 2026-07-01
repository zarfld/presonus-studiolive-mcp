/**
 * Write-flow domain types: ProposedChangeSet + AppliedChange.
 *
 * @module write-schemas
 * @implements ADR-006: Semi-automated write tools (propose → confirm → apply)
 * @architecture #11 ARC-C-001: presonus-domain package — Zod schemas
 *
 * These types represent the propose-and-confirm write workflow.
 * No write operation reaches the mixer without an explicit apply_change_set call.
 */
import { z } from 'zod'

/**
 * Writable mixer parameters (initial scope: EQ only — Phase C).
 * Additional parameters (comp, gate, limiter) follow the same pattern.
 */
export const ChangeParameterSchema = z.enum([
  // EQ band parameters (1–4)
  'eq.gain1', 'eq.freq1', 'eq.q1', 'eq.enabled1',
  'eq.gain2', 'eq.freq2', 'eq.q2', 'eq.enabled2',
  'eq.gain3', 'eq.freq3', 'eq.q3', 'eq.enabled3',
  'eq.gain4', 'eq.freq4', 'eq.q4', 'eq.enabled4',
  // EQ master switch
  'eq.enabled',
  // Compressor parameters
  'comp.threshold', 'comp.makeup', 'comp.ratio', 'comp.attack', 'comp.release', 'comp.enabled',
  // Gate parameters
  'gate.threshold', 'gate.attack', 'gate.release', 'gate.enabled',
  // Limiter parameters
  'limiter.threshold', 'limiter.release', 'limiter.enabled',
  // Channel-level
  'fader', 'mute',
  // String writes (REQ-F-WRITE-005a #86)
  'username',
  // Binary routing writes (REQ-F-WRITE-005c/d #86)
  'sub.membership', 'aux.assignment',
])
export type ChangeParameter = z.infer<typeof ChangeParameterSchema>

/**
 * A single parameter change within a ProposedChangeSet.
 *
 * Tracks both the raw normalized value (for protocol) and human-readable
 * display strings (for operator review in the MCP response).
 */
export const ProposedChangeSchema = z.object({
  parameter: ChangeParameterSchema,
  /** Dot-notation state key path, e.g. "line.ch1.eq.eqgain1" */
  rawKeyPath: z.string(),
  /**
   * Current normalized value from snapshot (null if not in state, or if this is a string write).
   * Null for username/sub.membership/aux.assignment changes.
   */
  currentRawValue: z.number().nullable(),
  /**
   * Proposed normalized value to send to mixer (0.0–1.0).
   * Null for string writes (use proposedStringValue instead).
   */
  proposedRawValue: z.number().min(0).max(1).nullable(),
  /**
   * Proposed string value — only set when parameter === 'username'.
   * Sent via PS (ParamString) packet instead of PV (ParamValue).
   */
  proposedStringValue: z.string().nullable().optional(),
  /** Human-readable current value, e.g. "+1.5 dB" or channel name */
  currentDisplayValue: z.string(),
  /** Human-readable proposed value, e.g. "-3.0 dB" or new channel name */
  proposedDisplayValue: z.string(),
})
export type ProposedChange = z.infer<typeof ProposedChangeSchema>

/**
 * Confidence level for a proposed change set.
 *
 * Reflects the calibration confidence of the underlying de-normalization formulas:
 *   'observed'  = state key and value mapping confirmed by probe on real hardware.
 *   'inferred'  = key pattern observed; value mapping plausible but not probe-confirmed.
 *   'guessed'   = best-estimate formula; run probe-fat-channel or fader probe to verify.
 *
 * Applied to each write-tool response so the operator knows how much to trust
 * the proposed values before applying.
 *
 * This is separate from RoutingConfidence (routing.ts) — write confidence
 * specifically addresses parameter de-normalization accuracy.
 */
export const ChangeSetConfidenceSchema = z.enum(['observed', 'inferred', 'guessed'])
export type ChangeSetConfidence = z.infer<typeof ChangeSetConfidenceSchema>

/**
 * A complete set of proposed changes for one channel.
 * Created by propose_eq_change and consumed by apply_change_set.
 *
 * Expires 60 seconds after creation (see tools.ts).
 */
export const ProposedChangeSetSchema = z.object({
  changeSetId: z.string().uuid(),
  deviceId: z.string(),
  channelId: z.string(),
  proposedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  changes: z.array(ProposedChangeSchema).min(1),
  /** Human-readable description of the full proposal, e.g. "Set EQ band 1 gain on Ch.1 Kick from +1.5 dB to -3.0 dB" */
  description: z.string(),
  /**
   * Calibration confidence of the proposed parameter values.
   * 'observed'  = state key + value formula confirmed by probe diff-state.
   * 'inferred'  = key pattern confirmed; value formula plausible, needs probe.
   * 'guessed'   = best-estimate formula; verify with probe-fat-channel / fader probe.
   *
   * Do not apply changes with confidence 'guessed' without operator review.
   */
  changeSetConfidence: ChangeSetConfidenceSchema,
})
export type ProposedChangeSet = z.infer<typeof ProposedChangeSetSchema>

/**
 * Audit record written after a successful apply_change_set call.
 */
export const AppliedChangeSchema = z.object({
  changeSetId: z.string().uuid(),
  deviceId: z.string(),
  channelId: z.string(),
  appliedAt: z.string().datetime(),
  /** Free-text confirmation from operator (passed to apply_change_set) */
  operatorNote: z.string().optional(),
  appliedChanges: z.array(ProposedChangeSchema),
})
export type AppliedChange = z.infer<typeof AppliedChangeSchema>
