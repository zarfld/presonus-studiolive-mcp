/**
 * Audio routing schemas.
 *
 * @module routing-schemas
 * @implements #4 StR-4: Routing validation between FOH and stagebox mixer units
 * @architecture #11 ARC-C-001: presonus-domain package — Zod schemas
 * @architecture #7 ADR-002: Three-layer architecture
 *
 * NOTE: Deep AVB/AVDECC routing validation is out of scope for MVP.
 * This schema covers mixer-level routing state visible via the featherbear API.
 */
import { z } from 'zod'

export const AudioRouteStatusSchema = z.enum([
  'ok',          // route is present and matches expected
  'missing',     // expected route is absent
  'unexpected',  // route exists but was not expected
  'ambiguous',   // multiple possible interpretations
  'unknown',     // cannot determine status from available data
])
export type AudioRouteStatus = z.infer<typeof AudioRouteStatusSchema>

export const AudioRouteSchema = z.object({
  sourceDeviceId: z.string(),
  sourcePort: z.string(),
  destinationDeviceId: z.string(),
  destinationPort: z.string(),
  signalName: z.string().optional(),
  /** Whether this route was expected per the rider/config */
  expected: z.boolean().optional(),
  /** Whether this route was found in actual mixer state */
  actual: z.boolean().optional(),
  status: AudioRouteStatusSchema,
})
export type AudioRoute = z.infer<typeof AudioRouteSchema>

export const RoutingValidationReportSchema = z.object({
  sourceDeviceId: z.string(),
  targetDeviceId: z.string(),
  validatedAt: z.string().datetime(),
  routes: z.array(AudioRouteSchema),
  summary: z.object({
    ok: z.number().int(),
    missing: z.number().int(),
    unexpected: z.number().int(),
    unknown: z.number().int(),
  }),
  issues: z.array(z.string()),
})
export type RoutingValidationReport = z.infer<typeof RoutingValidationReportSchema>
