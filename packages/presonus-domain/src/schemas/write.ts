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
  /** Current normalized value from snapshot (null if not in state) */
  currentRawValue: z.number().nullable(),
  /** Proposed normalized value to send to mixer (0.0–1.0) */
  proposedRawValue: z.number().min(0).max(1),
  /** Human-readable current value, e.g. "+1.5 dB" */
  currentDisplayValue: z.string(),
  /** Human-readable proposed value, e.g. "-3.0 dB" */
  proposedDisplayValue: z.string(),
})
export type ProposedChange = z.infer<typeof ProposedChangeSchema>

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
