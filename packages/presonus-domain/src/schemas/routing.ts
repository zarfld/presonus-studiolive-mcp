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
 *   'inferred'  = logically inferred from observed patterns (key confirmed, formula plausible);
 *                  needs probe-routing calibration to promote to 'observed'
 *   'not_verifiable_with_current_adapter' = physically unobservable (cable routing)
 *                  or requires AVB probe session not yet completed
 *
 * NOTE: fat-channel.ts retains its own ConfidenceSchema with 'guessed' (different domain).
 * ADR-008: Two-layer routing model — observable (Layer A) vs probe-required (Layer B).
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
  /**
   * Whether this FX send is assigned/enabled.
   * Key pattern: `line.chN.assign_FXA` (inferred — not yet probe-confirmed).
   * Absent when the key is not present in mixer state.
   */
  assigned: z.boolean().optional(),
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
   * 'inferred' = raw 0–1 linear values exposed; formula plausible but not probe-confirmed.
   * 'observed' = set after probe diff-state confirms the AUX send formula.
   */
  parameterConfidence: z.enum(['observed', 'inferred']),
})
export type ChannelSendRouting = z.infer<typeof ChannelSendRoutingSchema>

// ---------------------------------------------------------------------------
// Output patch router — OBSERVED key structure, formula partially confirmed
// ---------------------------------------------------------------------------

/**
 * Routing confidence classification.
 *
 * Values align with the routing-confidence-probe-promotion skill and ADR-008.
 *
 * | Value | Meaning |
 * |---|---|
 * | `observed` | Confirmed by probe diff-state on real hardware. |
 * | `inferred` | Derived from key patterns or live state; plausible but not probe-confirmed. |
 * | `not_verifiable_with_current_adapter` | Permanently unobservable via current adapter/protocol. |
 * | `stub` | Tool/resource deliberately returns limited result or probe instructions. |
 * | `planned` | Requirement exists; implementation not yet present. |
 * | `probe_required` | Could be verified with probe diff-state; must not be trusted until run. |
 *
 * Promotion path: planned → stub → probe_required → inferred → observed
 * HIL evidence is required to promote any value to `observed`.
 */
export const RoutingConfidenceSchema = z.enum([
  'observed',   // confirmed by probe diff-state on real hardware
  'inferred',   // logically inferred from observed patterns; needs probe to promote to 'observed'
  'not_verifiable_with_current_adapter', // permanently unobservable (cable routing, AVB without 32R)
  'stub',        // tool exists but deliberately returns instructions/not_verifiable; Layer B stubs
  'planned',     // requirement exists, implementation not yet present
  'probe_required', // must not be trusted until probe diff-state is completed
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

// ---------------------------------------------------------------------------
// RoutingKind + MixerRoute — unified routing model (ADR-008)
// ---------------------------------------------------------------------------

/**
 * Classifies a route by its functional role in the signal chain.
 *
 * Layer A (observable now): channel-to-aux, channel-to-fx, fx-return-to-aux, talkback-to-aux
 * Layer B (probe-required): input-source, bus-to-output, avb-stream, stagebox
 *
 * @see ADR-008-two-layer-routing-model.md
 */
export const RoutingKindSchema = z.enum([
  'input-source',      // physical input → console channel  (Layer B: probe-required)
  'channel-to-aux',   // console channel → AUX bus          (Layer A: observable)
  'channel-to-fx',    // console channel → FX bus           (Layer A: observable)
  'fx-return-to-aux', // FX return channel → AUX bus        (Layer A: observable when data available)
  'talkback-to-aux',  // talkback channel → AUX bus         (Layer A: observable when data available)
  'bus-to-output',    // AUX/SUB/FX bus → analog output     (Layer B: source names probe-required)
  'avb-stream',       // AVB network stream mapping         (Layer B: probe-required)
  'stagebox',         // stagebox input channel mapping     (Layer B: requires 32R hardware)
])
export type RoutingKind = z.infer<typeof RoutingKindSchema>

/**
 * A single normalized route with full confidence annotation.
 *
 * Used by Layer A tools to expose confirmed send routing as a flat list,
 * and by Layer B stubs to document the gap with `not_verifiable_with_current_adapter`.
 *
 * Design: prefer this type over raw AuxSend/FxSend arrays when building cross-channel
 * routing views (e.g. presonus://mixer/{id}/monitor-routing).
 */
export const MixerRouteSchema = z.object({
  kind: RoutingKindSchema,
  /** Source identifier — e.g. 'line.ch1', 'talkback.ch1', 'fxbus.ch1' */
  source: z.string(),
  /** Destination identifier — e.g. 'aux.ch3', 'fxbus.chA', 'sub.ch1', 'main.ch1' */
  destination: z.string(),
  /** Send level 0.0–1.0 (absent for boolean-only assignments) */
  level: z.number().min(0).max(1).optional(),
  /** Whether the send is enabled/assigned (absent when key not in state) */
  assigned: z.boolean().optional(),
  /** Whether the source channel is muted (affects post-fader sends) */
  muted: z.boolean().optional(),
  /** Raw state key path where this route was read (e.g. 'line.ch1.aux3') */
  rawPath: z.string().optional(),
  /** Raw state value at rawPath */
  rawValue: z.unknown().optional(),
  /** Confidence that this route reflects hardware reality */
  confidence: RoutingConfidenceSchema,
})
export type MixerRoute = z.infer<typeof MixerRouteSchema>

/** A collection of mixer routes for one device — used by monitor-routing resource */
export const MixerRoutingGraphSchema = z.object({
  deviceId: z.string(),
  capturedAt: z.string().datetime(),
  routes: z.array(MixerRouteSchema),
  /** Summary counts by kind and confidence */
  summary: z.object({
    byKind: z.record(z.string(), z.number().int()),
    observed: z.number().int(),
    inferred: z.number().int(),
    not_verifiable: z.number().int(),
  }),
})
export type MixerRoutingGraph = z.infer<typeof MixerRoutingGraphSchema>

// ---------------------------------------------------------------------------
// Input source routing — HIL evidence 2026-07-01 (StudioLive 32SC fw 3.4.0.111374)
// Key confirmed: line.chN.inputsrc.value  probe: captures/probe-input-source/
// Index 0='Local' (observed), Index 1='Stage Box' (observed), 2-3=probe_required
// ---------------------------------------------------------------------------

/**
 * Input source selection for one channel strip.
 *
 * OBSERVED on StudioLive 32SC firmware 3.4.0.111374 (2026-07-01 HIL probe).
 * Index formula: Math.round(value × 3).
 *
 * @implements #45 REQ-F-ROUT-011 — input routing observable
 * Traces to: #4 StR-4
 */
export const InputChannelSourceSchema = z.object({
  channelNumber: z.number().int().min(1).max(32),
  rawValue: z.number().min(0).max(1),
  /** 0–3. Indices 0 and 1 confirmed; 2–3 are probe_required. */
  inputSourceIndex: z.number().int().min(0).max(3),
  /** null when the label for this index is not yet confirmed (probe_required). */
  inputSourceLabel: z.string().nullable(),
  confidence: RoutingConfidenceSchema,
})
export type InputChannelSource = z.infer<typeof InputChannelSourceSchema>

/**
 * Full per-device input routing report returned by get_input_routing.
 *
 * OBSERVED on StudioLive 32SC firmware 3.4.0.111374 (2026-07-01 HIL probe).
 */
export const InputRoutingReportSchema = z.object({
  confidence: RoutingConfidenceSchema,
  channels: z.array(InputChannelSourceSchema),
  mixerSerial: z.string(),
  firmware: z.string(),
  hilEvidence: z.string().optional(),
  notes: z.array(z.string()).optional(),
})
export type InputRoutingReport = z.infer<typeof InputRoutingReportSchema>

// ---------------------------------------------------------------------------
// AVB stream routing — HIL evidence 2026-07-01 (StudioLive 32SC + 32R fw 3.4.0.111374)
// Key confirmed: stageboxsetup.avb_src_{range}.value  probe: captures/probe-avb/
// Labels from stageboxsetup.avb_src_{range}.strings array (device-specific)
// ---------------------------------------------------------------------------

/**
 * One 8-channel AVB stream block assignment.
 *
 * OBSERVED on StudioLive 32SC + StudioLive 32R firmware 3.4.0.111374 (2026-07-01 HIL probe).
 * Index 0 = 'None', indices 1–8 = 'DeviceName:Send X-Y'.
 * Formula: Math.round(value × 8).
 *
 * @implements #45 REQ-F-ROUT-011 — AVB routing observable
 */
export const AvbStreamBlockSchema = z.object({
  /** FOH channel range serviced by this block, e.g. "1-8" */
  channelRange: z.string(),
  /** Key range suffix as used in state key, e.g. "1_8" */
  keyRange: z.string(),
  /** 0 = None; 1–8 = corresponding device send stream */
  streamIndex: z.number().int().min(0).max(8),
  /** Full label from strings array (e.g. "PreSonus StudioLive 32R:Send 1-8"); null when index=0 (None). */
  streamLabel: z.string().nullable(),
  confidence: RoutingConfidenceSchema,
})
export type AvbStreamBlock = z.infer<typeof AvbStreamBlockSchema>

/**
 * Full AVB stream routing report returned by validate_avb_routing.
 *
 * OBSERVED on StudioLive 32SC + StudioLive 32R firmware 3.4.0.111374 (2026-07-01 HIL probe).
 */
export const AvbStreamRoutingSchema = z.object({
  confidence: RoutingConfidenceSchema,
  /** From stageboxsetup.selected_name; null if not connected. */
  stageboxName: z.string().nullable(),
  /** true when stageboxsetup.connect_status is non-zero */
  connected: z.boolean(),
  streamBlocks: z.array(AvbStreamBlockSchema),
  mixerSerial: z.string(),
  firmware: z.string(),
  hilEvidence: z.string().optional(),
  /** Present when expectedStreams was supplied to validate_avb_routing. */
  validation: z.object({
    allMatch: z.boolean(),
    mismatches: z.array(z.object({
      channelRange: z.string(),
      expected: z.string(),
      actual: z.string().nullable(),
    })),
  }).optional(),
})
export type AvbStreamRouting = z.infer<typeof AvbStreamRoutingSchema>
