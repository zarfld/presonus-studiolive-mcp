/**
 * Channel diagnosis schemas — input/output for diagnose_channel tool.
 *
 * The MCP server diagnoses a single channel by inspecting mute, fader,
 * solo, meter, and gate state. Returns structured causes and safe next steps.
 * Physical routing is explicitly NOT diagnosed (not verifiable).
 *
 * @module diagnosis-schemas
 * @implements #78 REQ-F-DIAG-001 — diagnose_channel tool contract
 * @architecture ADR-002 (#7): domain types never depend on adapter
 */
import { z } from 'zod'

/** Input for the diagnose_channel tool */
export const DiagnoseChannelInputSchema = z.object({
  /** Mixer device ID from discover_mixers */
  deviceId: z.string(),
  /** 1-based physical channel number (as labeled on the mixer front panel) */
  channel: z.number().int().positive(),
  /** Optional human label for the expected source (e.g. "Lead Vox") */
  expectedSource: z.string().optional(),
})
export type DiagnoseChannelInput = z.infer<typeof DiagnoseChannelInputSchema>

/** A single check result within a channel diagnosis */
export const ChannelCheckSchema = z.object({
  check: z.enum(['meter', 'mute', 'fader', 'solo', 'gate']),
  result: z.string(),
})
export type ChannelCheck = z.infer<typeof ChannelCheckSchema>

/** Output of the diagnose_channel tool */
export const DiagnoseChannelResultSchema = z.object({
  status: z.enum(['ok', 'warning', 'problem']),
  channel: z.number().int().positive(),
  checks: z.array(ChannelCheckSchema),
  mostLikelyCauses: z.array(z.string()),
  safeNextSteps: z.array(z.string()),
})
export type DiagnoseChannelResult = z.infer<typeof DiagnoseChannelResultSchema>
