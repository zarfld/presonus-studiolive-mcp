/**
 * Channel setup and requirements validation schemas.
 *
 * The agent provides rider-derived expectations; the MCP server validates
 * against actual mixer state.
 *
 * Design principle:
 *   - Agent owns: what the rider requires (channels, names, phantom, capacity)
 *   - MCP owns: the actual mixer state and capabilities
 *
 * @module validation-schemas
 * @implements #45 REQ-F-VAL-001 — validate_channel_setup tool contract
 * @implements #76 REQ-F-VAL-002 — check_required_setup tool contract
 * @architecture ADR-002 (#7): domain types never depend on adapter
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// validate_channel_setup schemas
// ---------------------------------------------------------------------------

/** An expected channel state — from the agent/rider */
export const ExpectedChannelSchema = z.object({
  /** 1-based physical channel number */
  channel: z.number().int().positive(),
  /** Expected channel name (scribble strip) */
  name: z.string(),
  /** Optional expected source type (e.g. "vocal", "kick") */
  sourceType: z.string().optional(),
  /** Whether phantom power is expected on this channel */
  phantomRequired: z.boolean().optional(),
})
export type ExpectedChannel = z.infer<typeof ExpectedChannelSchema>

/** An issue found when validating a channel against expectations */
export const ChannelSetupIssueSchema = z.object({
  channel: z.number().int().positive(),
  issue: z.enum([
    'expected_name_mismatch',
    'muted_expected_channel',
    'phantom_mismatch',
    'channel_not_found',
    'wrong_type',
  ]),
  current: z.string(),
  expected: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
})
export type ChannelSetupIssue = z.infer<typeof ChannelSetupIssueSchema>

/** Output of validate_channel_setup */
export const ChannelSetupValidationResultSchema = z.object({
  status: z.enum(['ok', 'warning', 'problem']),
  issues: z.array(ChannelSetupIssueSchema),
})
export type ChannelSetupValidationResult = z.infer<typeof ChannelSetupValidationResultSchema>

// ---------------------------------------------------------------------------
// check_required_setup schemas
// ---------------------------------------------------------------------------

/** Mixer capacity requirements — from the agent/rider */
export const MixerRequirementsSchema = z.object({
  /** Minimum number of input channels required */
  inputChannels: z.number().int().positive().optional(),
  /** Minimum number of independent monitor mixes required */
  monitorMixes: z.number().int().positive().optional(),
  /** Minimum number of FX buses required */
  fxBuses: z.number().int().positive().optional(),
  /** Number of stereo input pairs required */
  stereoInputs: z.number().int().nonnegative().optional(),
  /** Whether a talkback path is required */
  talkbackRequired: z.boolean().optional(),
  /** Whether an AVB stagebox connection is required */
  stageboxRequired: z.boolean().optional(),
})
export type MixerRequirements = z.infer<typeof MixerRequirementsSchema>

/** A single requirement check result */
export const RequirementCheckSchema = z.object({
  requirement: z.string(),
  required: z.number().optional(),
  available: z.number().optional(),
  status: z.enum(['ok', 'insufficient', 'unavailable', 'unknown']),
})
export type RequirementCheck = z.infer<typeof RequirementCheckSchema>

/** Output of check_required_setup */
export const RequirementsCheckResultSchema = z.object({
  status: z.enum(['ok', 'warning', 'problem']),
  checks: z.array(RequirementCheckSchema),
})
export type RequirementsCheckResult = z.infer<typeof RequirementsCheckResultSchema>
