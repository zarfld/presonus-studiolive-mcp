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
 *
 * CONFIDENCE POLICY:
 *   'observed'  = confirmed by probe diff-state on real hardware
 *   'guessed'   = best-estimate (e.g. same log law as fader); needs calibration
 *   'not_verifiable_with_current_adapter' = physically unobservable (cable routing)
 *                  or requires AVB probe session not yet completed
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Per-channel send routing — OBSERVED on StudioLive 32SC fw 3.3.0.109659
// State keys confirmed from captures/2026-06-24/SD7E21010066/state-full.json
// ---------------------------------------------------------------------------

/**
 * AUX mix send for one channel.
 *
 * Send level: raw 0–1 linear value from `line.chN.auxM`.
 * De-normalization formula: UNVERIFIED — run probe diff-state while dragging
 * AUX faders in UC Surface. Expected: same log law as main fader.
 *
 * OBSERVED on 32SC: 32 AUX buses (aux1–aux32), assign_aux1–assign_aux32.
 */
export const AuxSendSchema = z.object({
  /** AUX bus number 1–32 */
  auxBus: z.number().int().min(1).max(32),
  /** Raw send level from mixer (0.0–1.0). dB conversion requires probe calibration. */
  sendLevelLinear: z.number().min(0).max(1),
  /** true = channel is assigned to this AUX bus */
  assigned: z.boolean(),
})
export type AuxSend = z.infer<typeof AuxSendSchema>

/**
 * FX bus send for one channel.
 *
 * OBSERVED on 32SC: FXA–FXH (8 FX buses), all at 0 in capture.
 */
export const FxSendSchema = z.object({
  fxBus: z.enum(['FXA', 'FXB', 'FXC', 'FXD', 'FXE', 'FXF', 'FXG', 'FXH']),
  /** Raw send level 0–1 */
  sendLevelLinear: z.number().min(0).max(1),
})
export type FxSend = z.infer<typeof FxSendSchema>

/**
 * Subgroup bus assignment for one channel.
 *
 * OBSERVED on 32SC: sub1–sub4 (4 subgroups), values 0 or 1 (integers, not booleans).
 */
export const SubgroupAssignSchema = z.object({
  /** Subgroup bus number 1–4 */
  subBus: z.number().int().min(1).max(4),
  assigned: z.boolean(),
})
export type SubgroupAssign = z.infer<typeof SubgroupAssignSchema>

/**
 * Complete per-channel send routing state.
 *
 * Exposed in `presonus://mixer/{id}/routing` and on each `MixerChannel.sendRouting`.
 * Absent when no routing state is available in snapshot (e.g. partial state after connect).
 */
export const ChannelSendRoutingSchema = z.object({
  /**
   * AUX/monitor sends.
   * Only includes buses with send data in state (may be sparse if not all keys received).
   */
  auxSends: z.array(AuxSendSchema),
  /** FX bus sends (FXA–FXH) */
  fxSends: z.array(FxSendSchema),
  /** Subgroup assignments (sub1–sub4) */
  subgroupAssigns: z.array(SubgroupAssignSchema),
  /**
   * Whether channel is assigned to main LR output.
   * Key: `line.chN.lr` — OBSERVED on 32SC fw 3.3.0.109659.
   */
  mainLrAssigned: z.boolean().optional(),
  /**
   * Confidence of send level values.
   * 'guessed' = raw 0–1 linear values exposed without dB calibration.
   * 'observed' = set after probe diff-state confirms the AUX send formula.
   */
  parameterConfidence: z.enum(['observed', 'guessed']),
})
export type ChannelSendRouting = z.infer<typeof ChannelSendRoutingSchema>

// ---------------------------------------------------------------------------
// Output patch router — OBSERVED key structure, formula partially confirmed
// ---------------------------------------------------------------------------

/** Confidence that a source mapping is correct */
export const RoutingConfidenceSchema = z.enum([
  'observed',   // confirmed by probe diff-state
  'guessed',    // estimated from default sequence (index N = line ch N+1)
  'not_verifiable_with_current_adapter',
])
export type RoutingConfidence = z.infer<typeof RoutingConfidenceSchema>

/**
 * A single analog or AVB output patch assignment.
 *
 * OBSERVED key pattern: `outputpatchrouter.mix{N}_src.value` (0–1 normalized)
 * Formula: `sourceIndex = Math.round(value × range.max)` where range.max = 27 (= 28 sources 0–27).
 * Source name mapping (0–27): UNVERIFIED — run probe diff-state while reassigning outputs.
 */
export const OutputPatchAssignSchema = z.object({
  /** Output index (e.g., 1–16 for analog, 1–8 for AVB) */
  outputIndex: z.number().int().min(1),
  /** Human-readable output label if known */
  outputLabel: z.string().optional(),
  /** Raw integer source index (0–27 for analog outs on 32SC) */
  sourceIndex: z.number().int(),
  /** Human-readable source name (null until probe confirms index→source mapping) */
  sourceName: z.string().nullable(),
  confidence: RoutingConfidenceSchema,
})
export type OutputPatchAssign = z.infer<typeof OutputPatchAssignSchema>

/** Full output patch router state for one mixer */
export const OutputPatchRouterSchema = z.object({
  deviceId: z.string(),
  /** Analog output assignments (mix1–mix16 on 32SC) */
  analogOutputs: z.array(OutputPatchAssignSchema),
  /** AVB stream output assignments (avb1–avb8 on 32SC); absent if not available */
  avbOutputs: z.array(OutputPatchAssignSchema).optional(),
  capturedAt: z.string().datetime(),
  /**
   * Overall confidence of this routing data.
   * 'not_verifiable_with_current_adapter' when source names are unknown.
   */
  globalConfidence: RoutingConfidenceSchema,
})
export type OutputPatchRouter = z.infer<typeof OutputPatchRouterSchema>

// ---------------------------------------------------------------------------
// Routing validation and diagnosis
// ---------------------------------------------------------------------------

export const AudioRouteStatusSchema = z.enum([
  'ok',          // route is present and matches expected
  'missing',     // expected route is absent
  'unexpected',  // route exists but was not expected
  'ambiguous',   // multiple possible interpretations
  'unknown',     // cannot determine status from available data
  'not_verifiable_with_current_adapter',  // routing depth exceeds current probe data
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
  confidence: RoutingConfidenceSchema.optional(),
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
    not_verifiable: z.number().int(),
  }),
  issues: z.array(z.string()),
  globalConfidence: RoutingConfidenceSchema,
})
export type RoutingValidationReport = z.infer<typeof RoutingValidationReportSchema>

// ---------------------------------------------------------------------------
// No-signal diagnosis
// ---------------------------------------------------------------------------

export const DiagnosisCheckResultSchema = z.object({
  check: z.enum(['meter', 'mute', 'fader', 'gate', 'stagebox', 'channel_name', 'send_routing']),
  result: z.string(),
  detail: z.string().optional(),
})
export type DiagnosisCheckResult = z.infer<typeof DiagnosisCheckResultSchema>

export const NoSignalDiagnosisSchema = z.object({
  deviceId: z.string(),
  channelId: z.string(),
  expectedSource: z.string().optional(),
  status: z.enum(['ok', 'problem', 'partial', 'inconclusive']),
  checks: z.array(DiagnosisCheckResultSchema),
  likelyCauses: z.array(z.string()),
  safeNextSteps: z.array(z.string()),
})
export type NoSignalDiagnosis = z.infer<typeof NoSignalDiagnosisSchema>

// ---------------------------------------------------------------------------
// Patch swap detection
// ---------------------------------------------------------------------------

export const PossibleSwapSchema = z.object({
  channelA: z.string(),
  channelB: z.string(),
  channelALabel: z.string().optional(),
  channelBLabel: z.string().optional(),
  evidence: z.string(),
  confidence: RoutingConfidenceSchema,
})
export type PossibleSwap = z.infer<typeof PossibleSwapSchema>

export const PatchSwapDetectionSchema = z.object({
  deviceId: z.string(),
  analyzedAt: z.string().datetime(),
  possibleSwaps: z.array(PossibleSwapSchema),
  silentChannelsNotInExpectedList: z.array(z.string()),
  unexpectedActiveChannels: z.array(z.string()),
})
export type PatchSwapDetection = z.infer<typeof PatchSwapDetectionSchema>
