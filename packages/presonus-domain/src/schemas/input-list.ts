/**
 * Input-list and patch-sheet domain schemas.
 *
 * Design principle (agent/MCP boundary):
 *   - Agent owns: the input list (derived from rider/show plan)
 *   - MCP owns: actual mixer channel state and validation results
 *
 * The agent creates an input list; the MCP validates it against the mixer
 * and returns grounded patch rows for the agent to present to a human.
 *
 * @module input-list-schemas
 * @implements REQ-F-INP-001 — validate_input_list_against_mixer tool contract
 * @implements REQ-F-INP-002 — validate_patch_sheet tool contract
 * @implements REQ-F-INP-003 — render_patch_sheet_data tool contract
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Agent-provided input list entry
// ---------------------------------------------------------------------------

/** One entry in an agent-generated input list (derived from rider). */
export const InputListEntrySchema = z.object({
  /** 1-based physical input/channel number */
  inputNo: z.number().int().positive(),
  /** Source name from rider (e.g. "Kick In", "Lead Vox") */
  sourceName: z.string(),
  /** Optional mic or DI preference for patch sheet printing */
  micPreference: z.string().optional(),
  /** Whether 48V phantom power is required for this input */
  phantomRequired: z.boolean(),
  /** Whether a mic stand is needed (for patch sheet printing) */
  standRequired: z.boolean().optional(),
  /** Free-text notes for the patch document (e.g. "inside kick") */
  notes: z.string().optional(),
})
export type InputListEntry = z.infer<typeof InputListEntrySchema>

// ---------------------------------------------------------------------------
// Validation issue types
// ---------------------------------------------------------------------------

export const InputListValidationIssueTypeSchema = z.enum([
  /** Mixer channel label does not match expected sourceName */
  'channel_name_mismatch',
  /** Actual phantom state does not match phantomRequired */
  'phantom_mismatch',
  /** inputNo is outside the mixer's physical input range */
  'input_out_of_range',
  /** Two entries have the same inputNo */
  'duplicate_input_number',
  /** Channel is muted (signal will not pass during line check) */
  'channel_muted',
  /** Two channels on the same input have conflicting phantom requirements */
  'phantom_conflict',
])
export type InputListValidationIssueType = z.infer<typeof InputListValidationIssueTypeSchema>

export const InputListValidationIssueSchema = z.object({
  inputNo: z.number().int().positive(),
  issue: InputListValidationIssueTypeSchema,
  /** Current value on the mixer (e.g. current channel name) */
  current: z.string().optional(),
  /** Expected value from the input list */
  expected: z.string().optional(),
  severity: z.enum(['high', 'medium', 'low']),
})
export type InputListValidationIssue = z.infer<typeof InputListValidationIssueSchema>

// ---------------------------------------------------------------------------
// Patch sheet row — returned to agent for human-facing document generation
// ---------------------------------------------------------------------------

/** One row in a grounded patch sheet (mixer state + agent expectations combined). */
export const PatchSheetRowSchema = z.object({
  inputNo: z.number().int().positive(),
  sourceName: z.string(),
  micPreference: z.string().optional(),
  phantomRequired: z.boolean(),
  standRequired: z.boolean().optional(),
  notes: z.string().optional(),
  /** Instruction for the human running cables (e.g. "Patch Kick to stagebox input 1") */
  manualPatchInstruction: z.string(),
  /** Current scribble-strip label on the mixer channel (null = channel not found) */
  currentMixerLabel: z.string().nullable(),
  /** Current phantom state on the mixer channel (null = not readable) */
  currentPhantomState: z.enum(['on', 'off']).nullable(),
  /** Current mute state of the channel */
  currentMuteState: z.enum(['muted', 'active', 'unknown']),
  /** Warnings to surface to the agent/human */
  warnings: z.array(z.string()),
})
export type PatchSheetRow = z.infer<typeof PatchSheetRowSchema>

// ---------------------------------------------------------------------------
// validate_input_list_against_mixer result
// ---------------------------------------------------------------------------

export const InputListValidationResultSchema = z.object({
  status: z.enum(['ok', 'warning', 'error']),
  issues: z.array(InputListValidationIssueSchema),
  printablePatchRows: z.array(PatchSheetRowSchema),
})
export type InputListValidationResult = z.infer<typeof InputListValidationResultSchema>

// ---------------------------------------------------------------------------
// validate_patch_sheet result (offline-only — no mixer connection required)
// ---------------------------------------------------------------------------

export const PatchSheetValidationIssueTypeSchema = z.enum([
  'duplicate_input_number',
  'input_out_of_range',
  /** Two inputs with opposite phantom requirements on the same physical connector */
  'phantom_conflict',
  /** Stereo pair channels have inconsistent phantom requirements */
  'stereo_pair_phantom_mismatch',
])
export type PatchSheetValidationIssueType = z.infer<typeof PatchSheetValidationIssueTypeSchema>

export const PatchSheetValidationIssueSchema = z.object({
  inputNo: z.number().int().positive(),
  issue: PatchSheetValidationIssueTypeSchema,
  detail: z.string(),
})
export type PatchSheetValidationIssue = z.infer<typeof PatchSheetValidationIssueSchema>

export const PatchSheetValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(PatchSheetValidationIssueSchema),
})
export type PatchSheetValidationResult = z.infer<typeof PatchSheetValidationResultSchema>
