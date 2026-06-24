/**
 * Show preparation schemas — rider, input list, patch plan.
 *
 * @module show-schemas
 * @implements #2 StR-2: Show preparation from rider documents
 * @architecture #11 ARC-C-001: presonus-domain package — Zod schemas
 * @architecture #7 ADR-002: Three-layer architecture
 *
 * These schemas are STUBS for Phase G (show-prep layer).
 * They define the data contracts that rider analysis tools will produce.
 */
import { z } from 'zod'

export const MonitorImportanceSchema = z.enum(['low', 'normal', 'critical'])
export type MonitorImportance = z.infer<typeof MonitorImportanceSchema>

/** A single input from a rider document */
export const ShowInputSchema = z.object({
  /** Physical channel number on FOH mixer (1-based, assigned during patching) */
  inputNo: z.number().int().positive().optional(),
  /** Source name as listed in the rider (e.g. "Kick In", "Snare Top", "Lead Vox") */
  sourceName: z.string(),
  performer: z.string().optional(),
  instrumentType: z.string().optional(),
  micPreference: z.string().optional(),
  phantomRequired: z.boolean().optional(),
  standRequired: z.boolean().optional(),
  monitorImportance: MonitorImportanceSchema.optional(),
  notes: z.string().optional(),
})
export type ShowInput = z.infer<typeof ShowInputSchema>

/** Conflict between two riders using the same resource */
export const RiderConflictSchema = z.object({
  kind: z.enum(['channel-overlap', 'phantom-conflict', 'aux-shortage', 'naming-collision']),
  description: z.string(),
  affectedInputs: z.array(z.string()),
})
export type RiderConflict = z.infer<typeof RiderConflictSchema>

/** Normalized plan derived from one or more rider documents */
export const RiderPlanSchema = z.object({
  showName: z.string(),
  /** ISO 8601 date */
  showDate: z.string().optional(),
  /** Ordered bands/acts in changeover sequence */
  bands: z.array(
    z.object({
      name: z.string(),
      inputs: z.array(ShowInputSchema),
    }),
  ),
  /** Merged input list across all bands */
  mergedInputList: z.array(ShowInputSchema),
  conflicts: z.array(RiderConflictSchema),
  requiredMixerChannels: z.number().int(),
  requiredAuxMixes: z.number().int(),
  requiredFxReturns: z.number().int().optional(),
})
export type RiderPlan = z.infer<typeof RiderPlanSchema>
