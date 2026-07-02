/**
 * Fat Channel compressor and EQ model schemas.
 *
 * @module fat-channel-schemas
 * @architecture #11 ARC-C-001: presonus-domain package — Zod schemas
 * @architecture #7 ADR-002: Three-layer architecture
 *
 * IMPORTANT: All `confidence` fields default to "unverified" until proven by
 * `presonus-probe probe-fat-channel` runs on physical 32SC and 32R hardware.
 * Do NOT hardcode raw model IDs until observed empirically. (ADR-004 #9)
 *
 * Sources:
 *   - Factory models: StudioLive Series III Fat Channel XT (3 compressor, 3 EQ)
 *   - Add-on models: Fat Channel Collection Vol. 1 plug-ins addendum
 *     (8 compressor additions + 5 EQ additions)
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Model reference tracker — used everywhere a raw model ID is stored
// ---------------------------------------------------------------------------

export const ConfidenceSchema = z.enum([
  'documented', // from PreSonus official documentation
  'observed',   // confirmed by probe-fat-channel on real hardware
  'guessed',    // inferred from protocol patterns
  'unverified', // named but raw value not confirmed yet
  'unknown',    // cannot map at all
])
export type Confidence = z.infer<typeof ConfidenceSchema>

export const FatModelRefSchema = z.object({
  normalized: z.string(),
  /** Raw value as emitted by mixer state (number, string, or null) */
  rawValue: z.union([z.number(), z.string(), z.boolean(), z.null()]),
  /** State key path where this value was observed (e.g. "line.ch1.fat.comp.model") */
  rawPath: z.string(),
  displayName: z.string().optional(),
  confidence: ConfidenceSchema,
})
export type FatModelRef = z.infer<typeof FatModelRefSchema>

// ---------------------------------------------------------------------------
// Compressor models
// ---------------------------------------------------------------------------

/** Factory compressor models (StudioLive Series III Fat Channel XT) */
export const FactoryCompressorModelSchema = z.enum([
  'STANDARD',
  'TUBE',
  'FET',
])

/** Add-on compressor models (Fat Channel Collection Vol. 1) */
export const AddonCompressorModelSchema = z.enum([
  'BRIT_COMP',
  'CLASSIC_COMPRESSOR',
  'COMP_160',
  'EVEREST_C100A',
  'FC_670',
  'RC_500_COMPRESSOR',
  'TUBE_CB',
  'VT_1_COMPRESSOR',
])

export const KnownCompressorModelSchema = z.union([
  FactoryCompressorModelSchema,
  AddonCompressorModelSchema,
])
export type KnownCompressorModel = z.infer<typeof KnownCompressorModelSchema>

// ---------------------------------------------------------------------------
// EQ models
// ---------------------------------------------------------------------------

/** Factory EQ models (StudioLive Series III Fat Channel XT) */
export const FactoryEqModelSchema = z.enum([
  'STANDARD',
  'PASSIVE',
  'VINTAGE',
])

/** Add-on EQ models (Fat Channel Collection Vol. 1) */
export const AddonEqModelSchema = z.enum([
  'ALPINE_EQ_550',
  'BAXANDALL_EQ',
  'RC_500_EQ',
  'SOLAR_69_EQ',
  'TUBE_EQ',
  'VINTAGE_3_BAND_EQ',
  'VT_1_EQ',
])

export const KnownEqModelSchema = z.union([
  FactoryEqModelSchema,
  AddonEqModelSchema,
])
export type KnownEqModel = z.infer<typeof KnownEqModelSchema>

// ---------------------------------------------------------------------------
// Compressor parameter schemas (per-model; add more after probe verification)
// ---------------------------------------------------------------------------

const baseCompressorFields = {
  enabled: z.boolean().optional(),
  thresholdDb: z.number().optional(),
  ratio: z.number().optional(),
  attackMs: z.number().optional(),
  releaseSec: z.number().optional(),
  makeupDb: z.number().optional(),
}

export const StandardCompParamsSchema = z.object({
  model: z.literal('STANDARD'),
  ...baseCompressorFields,
})

export const TubeCompParamsSchema = z.object({
  model: z.literal('TUBE'),
  ...baseCompressorFields,
})

export const FetCompParamsSchema = z.object({
  model: z.literal('FET'),
  ...baseCompressorFields,
})

export const BritCompParamsSchema = z.object({
  model: z.literal('BRIT_COMP'),
  ...baseCompressorFields,
  keyFilterHz: z.number().optional(),
  keyEnabled: z.boolean().optional(),
  sidechain: z.string().optional(),
})

export const Comp160ParamsSchema = z.object({
  model: z.literal('COMP_160'),
  enabled: z.boolean().optional(),
  thresholdDb: z.number().optional(),
  compression: z.number().optional(),
  outputGainDb: z.number().optional(),
  keyListen: z.boolean().optional(),
  keyFilterHz: z.number().optional(),
  sidechain: z.string().optional(),
})

export const UnknownCompParamsSchema = z.object({
  model: z.literal('UNKNOWN'),
  rawModelId: z.union([z.string(), z.number()]),
  rawParams: z.record(z.string(), z.unknown()),
})

export const FatCompressorStateSchema = z.discriminatedUnion('model', [
  StandardCompParamsSchema,
  TubeCompParamsSchema,
  FetCompParamsSchema,
  BritCompParamsSchema,
  Comp160ParamsSchema,
  // Additional models added after empirical probe verification:
  // EverestC100aParamsSchema, Fc670ParamsSchema, TubeCbParamsSchema, ...
  UnknownCompParamsSchema,
])
export type FatCompressorState = z.infer<typeof FatCompressorStateSchema>

// ---------------------------------------------------------------------------
// EQ parameter schemas (per-model; add more after probe verification)
// ---------------------------------------------------------------------------

const eqBandSchema = z.object({
  frequencyHz: z.number().optional(),
  gainDb: z.number().optional(),
  qFactor: z.number().optional(),
  enabled: z.boolean().optional(),
})

export const StandardEqParamsSchema = z.object({
  model: z.literal('STANDARD'),
  enabled: z.boolean().optional(),
  highGainDb: z.number().optional(),
  highMidGainDb: z.number().optional(),
  lowMidGainDb: z.number().optional(),
  lowGainDb: z.number().optional(),
})

export const UnknownEqParamsSchema = z.object({
  model: z.literal('UNKNOWN'),
  rawModelId: z.union([z.string(), z.number()]),
  rawParams: z.record(z.string(), z.unknown()),
  bands: z.array(eqBandSchema).optional(),
})

export const FatEqStateSchema = z.discriminatedUnion('model', [
  StandardEqParamsSchema,
  // Additional models added after empirical probe verification:
  // PassiveEqParamsSchema, VintageEqParamsSchema, AlpineEq550Schema, ...
  UnknownEqParamsSchema,
])
export type FatEqState = z.infer<typeof FatEqStateSchema>

// ---------------------------------------------------------------------------
// Full Fat Channel state for one channel
// ---------------------------------------------------------------------------

export const FatChannelStateSchema = z.object({
  channelId: z.string(),
  compressor: FatCompressorStateSchema.optional(),
  eq: FatEqStateSchema.optional(),
  gate: z.object({
    enabled: z.boolean().optional(),
    thresholdDb: z.number().optional(),
    attackMs: z.number().optional(),
    releaseSec: z.number().optional(),
    rangeDb: z.number().optional(),
  }).optional(),
  limiter: z.object({
    enabled: z.boolean().optional(),
    thresholdDb: z.number().optional(),
    releaseSec: z.number().optional(),
  }).optional(),
})
export type FatChannelState = z.infer<typeof FatChannelStateSchema>

// ---------------------------------------------------------------------------
// Model index ↔ enum decoders
//
// OBSERVED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24)
// State keys:
//   Compressor model: line.chN.opt.compmodel  { strings: 6, value: 0.0–1.0 }
//   EQ model:         line.chN.opt.eqmodel    { strings: 5, value: 0.0–1.0 }
//
// Formula:
//   compressor index = Math.round(value × 10)  (11 total slots: 3 factory + 8 add-on)
//   EQ index         = Math.round(value × 9)   (10 total slots: 3 factory + 7 add-on)
//
// The 'strings' field counts only the authorized/installed models on a specific mixer.
// The underlying index space is fixed (11 for comp, 10 for EQ) across all devices.
// ---------------------------------------------------------------------------

export interface ModelDecodeResult {
  normalized: string
  index: number
  confidence: Confidence
}

/**
 * Compressor model index → enum name mapping.
 * ALL indices confirmed on 32SC fw 3.3.0.109659 (2026-06-24).
 * Method: user set each channel to a distinct model in UC Surface while we captured
 * live state via probe CLI; raw value ↔ UC Surface model name cross-validated on 22 channels.
 *   ch1=FET(0.2)  ch2=COMP_160(0.5)  ch3=BRIT_COMP(0.3)  ch4=CLASSIC_COMPRESSOR(0.4)
 *   ch5=FC_670(0.7)  ch6=RC_500(0.8, slave of linked pair shows FC_670 — see note)
 *   ch7=RC_500(0.8)  ch8=TUBE_CB(0.9)  ch9=VT_1(1.0)  ch10=TUBE(0.1)
 *   ch17=EVEREST_C100A(0.6) confirmed as "Everest Tube Leveling Amplifier" in UC Surface
 * NOTE (linked-pair slave): when ch6+ch7 are stereo-linked, the slave (ch6) retains
 * its previous raw value in the state tree; UC Surface shows master's (ch7) model.
 */
export const COMPRESSOR_MODEL_BY_INDEX: Record<number, { name: string; confidence: Confidence }> = {
  0:  { name: 'STANDARD',          confidence: 'observed' },
  1:  { name: 'TUBE',              confidence: 'observed' },
  2:  { name: 'FET',               confidence: 'observed' },
  3:  { name: 'BRIT_COMP',         confidence: 'observed' },
  4:  { name: 'CLASSIC_COMPRESSOR',confidence: 'observed' },
  5:  { name: 'COMP_160',          confidence: 'observed' },
  6:  { name: 'EVEREST_C100A',     confidence: 'observed' },
  7:  { name: 'FC_670',            confidence: 'observed' },
  8:  { name: 'RC_500_COMPRESSOR', confidence: 'observed' },
  9:  { name: 'TUBE_CB',           confidence: 'observed' },
  10: { name: 'VT_1_COMPRESSOR',   confidence: 'observed' },
}

/**
 * EQ model index → enum name mapping.
 * ALL indices confirmed on 32SC fw 3.3.0.109659 (2026-06-24).
 * Method: user stepped through every available EQ model in UC Surface across
 * channels 2–11 and 13–21 while we captured live state via probe CLI.
 * EQ step size = 1/9 → value 0.0 (STANDARD) … 1.0 (VT_1_EQ).
 *   ch2=PASSIVE(0.111)  ch3=VINTAGE(0.222)  ch4=ALPINE_EQ_550(0.333)
 *   ch5=BAXANDALL_EQ(0.444)  ch7=RC_500_EQ(0.556)  ch8=SOLAR_69_EQ(0.667)
 *   ch9=TUBE_EQ(0.778)  ch10=VINTAGE_3_BAND_EQ(0.889)  ch11=VT_1_EQ(1.0)
 */
export const EQ_MODEL_BY_INDEX: Record<number, { name: string; confidence: Confidence }> = {
  0: { name: 'STANDARD',         confidence: 'observed' },
  1: { name: 'PASSIVE',          confidence: 'observed' },
  2: { name: 'VINTAGE',          confidence: 'observed' },
  3: { name: 'ALPINE_EQ_550',    confidence: 'observed' },
  4: { name: 'BAXANDALL_EQ',     confidence: 'observed' },
  5: { name: 'RC_500_EQ',        confidence: 'observed' },
  6: { name: 'SOLAR_69_EQ',      confidence: 'observed' },
  7: { name: 'TUBE_EQ',          confidence: 'observed' },
  8: { name: 'VINTAGE_3_BAND_EQ',confidence: 'observed' },
  9: { name: 'VT_1_EQ',          confidence: 'observed' },
}

/**
 * Compressor model GUID (`__classid` field in .scn scene files) → enum name.
 *
 * IMPORTANT: `__classid` does NOT appear in the live featherbear state tree.
 * The live state identifies models via `opt.compmodel.value` (use decodeCompressorModel).
 * This map is for future scene file (.scn) parsing only.
 *
 * Source: 04.New Scene 4.scn from user's 32SC session backup (2026-06-24).
 * These are cross-referenced against the live opt.compmodel index values we
 * verified empirically, but the GUIDs themselves come from the scene file —
 * NOT from the live protocol.
 * Confidence: 'documented' (from file format, not observed from live state)
 */
export const COMPRESSOR_MODEL_BY_CLASSID: Record<string, { name: string; index: number; confidence: Confidence }> = {
  // Full mapping confirmed by dedicated 06._classID_Map.scn (2026-06-24, 32SC fw 3.3.0.109659).
  // Channels 1-22 each set to a distinct model; cross-validated by having each GUID on two channels.
  // NOTE: {C3C32BBC} is TUBE_CB (index 9), NOT EVEREST_C100A. EVEREST is {23F9C088}.
  '{870D04F7-212E-4F9C-ADBB-39A97216433F}': { name: 'STANDARD',           index: 0,  confidence: 'observed' },
  '{7F8A4262-D377-48E3-9D48-15D82C400A71}': { name: 'TUBE',               index: 1,  confidence: 'observed' },
  '{1F831EC1-B8AC-4EE9-AD53-54227AF53D58}': { name: 'FET',                index: 2,  confidence: 'observed' },
  '{FEF33155-7A9E-4F4E-B209-CFE86DDAFC8E}': { name: 'BRIT_COMP',          index: 3,  confidence: 'observed' },
  '{C38F9E1A-0127-4BB8-9377-40C545A50328}': { name: 'CLASSIC_COMPRESSOR', index: 4,  confidence: 'observed' },
  '{F0BD22BB-5FE8-4279-8B05-D089B4D7B0BB}': { name: 'COMP_160',           index: 5,  confidence: 'observed' },
  '{23F9C088-08BE-4259-9DCE-38720AE5DE73}': { name: 'EVEREST_C100A',      index: 6,  confidence: 'observed' },
  '{85DD5632-A536-49FF-894A-9329FC1124E4}': { name: 'FC_670',             index: 7,  confidence: 'observed' },
  '{6A372968-AFA7-4A3F-805D-A09A4AE15777}': { name: 'RC_500_COMPRESSOR',  index: 8,  confidence: 'observed' },
  '{C3C32BBC-42E2-41A7-99B5-EA1D62F897B5}': { name: 'TUBE_CB',            index: 9,  confidence: 'observed' },
  '{AF35E448-40EC-4C5A-A05C-B40A5AC0A42F}': { name: 'VT_1_COMPRESSOR',    index: 10, confidence: 'observed' },
}

/**
 * EQ model GUID (`__classid` field in .scn scene files) → enum name.
 *
 * NOTE: `__classid` is scene-file only, NOT in live featherbear state.
 * Live state uses `opt.eqmodel.value` instead.
 *
 * Line channel EQ GUIDs confirmed by 32-channel cross-validation (2026-06-24, fw 3.3.0.109659).
 * Aux/bus channel EQ is a different model class with a different GUID.
 */
export const EQ_MODEL_BY_CLASSID: Record<string, { name: string; index: number; confidence: Confidence; channelTypes: string }> = {
  // Full mapping confirmed by dedicated 06._classID_Map.scn (2026-06-24, 32SC fw 3.3.0.109659).
  // Line channel EQ (4-band parametric family, index 0-9):
  '{A0A8A068-14F0-4B04-BB6F-AF8329D0E8EE}': { name: 'STANDARD',          index: 0, confidence: 'observed',   channelTypes: 'line,return,fxreturn' },
  '{C0730CBB-5135-4558-9222-C40BDBA036ED}': { name: 'PASSIVE',           index: 1, confidence: 'observed',   channelTypes: 'line,sub' },
  '{E1C5E024-C5CD-473C-B08A-6EC177812E01}': { name: 'VINTAGE',           index: 2, confidence: 'observed',   channelTypes: 'line' },
  '{CBDD0DD3-C5EF-495A-B4C7-92EC5E8FE146}': { name: 'ALPINE_EQ_550',     index: 3, confidence: 'observed',   channelTypes: 'line' },
  '{B4D3497E-4B1C-4CFA-B859-A918C17CDA03}': { name: 'BAXANDALL_EQ',      index: 4, confidence: 'observed',   channelTypes: 'line' },
  '{63ADDF9B-0EC7-430A-AEBE-62B4CB5FBBD6}': { name: 'RC_500_EQ',         index: 5, confidence: 'observed',   channelTypes: 'line' },
  '{03819C3F-DC16-4B7B-B521-14B4042192F2}': { name: 'SOLAR_69_EQ',       index: 6, confidence: 'observed',   channelTypes: 'line' },
  '{09B38119-3945-40D1-BA33-2FA19620DAB0}': { name: 'TUBE_EQ',           index: 7, confidence: 'observed',   channelTypes: 'line' },
  '{4635DE88-C3D2-4645-BC4D-8DFD116D6914}': { name: 'VINTAGE_3_BAND_EQ', index: 8, confidence: 'observed',   channelTypes: 'line' },
  '{A0FAF452-D664-4BA2-90FC-6BD4AC469B29}': { name: 'VT_1_EQ',           index: 9, confidence: 'observed',   channelTypes: 'line' },
  // Aux/sub/bus channel EQ — different plugin class, not part of the line EQ index space:
  '{4B92A91C-C6FB-4F0F-AE51-841378E4F9CF}': { name: 'BUS_EQ',            index: -1, confidence: 'documented', channelTypes: 'aux,sub,fxbus' },
}

/** Decode compressor model from `line.chN.opt.compmodel.value` */
export function decodeCompressorModel(value: number): ModelDecodeResult {
  const index = Math.round(value * 10)
  const entry = COMPRESSOR_MODEL_BY_INDEX[index]
  if (entry) return { normalized: entry.name, index, confidence: entry.confidence }
  return { normalized: 'UNKNOWN', index, confidence: 'unknown' }
}

/** Decode EQ model from `line.chN.opt.eqmodel.value` */
export function decodeEqModel(value: number): ModelDecodeResult {
  const index = Math.round(value * 9)
  const entry = EQ_MODEL_BY_INDEX[index]
  if (entry) return { normalized: entry.name, index, confidence: entry.confidence }
  return { normalized: 'UNKNOWN', index, confidence: 'unknown' }
}

/**
 * Decode compressor model from a `__classid` GUID (scene file format).
 * Returns the same ModelDecodeResult as decodeCompressorModel for consistency.
 */
export function decodeCompressorModelFromClassid(classid: string): ModelDecodeResult {
  const normalized = classid.toUpperCase()
  const entry = COMPRESSOR_MODEL_BY_CLASSID[normalized] ?? COMPRESSOR_MODEL_BY_CLASSID[classid]
  if (entry) return { normalized: entry.name, index: entry.index, confidence: entry.confidence }
  return { normalized: 'UNKNOWN', index: -1, confidence: 'unknown' }
}

/**
 * Decode EQ model from a `__classid` GUID (scene file format).
 */
export function decodeEqModelFromClassid(classid: string): ModelDecodeResult {
  const normalized = classid.toUpperCase()
  const entry = EQ_MODEL_BY_CLASSID[normalized] ?? EQ_MODEL_BY_CLASSID[classid]
  if (entry) return { normalized: entry.name, index: entry.index, confidence: entry.confidence }
  return { normalized: 'UNKNOWN', index: -1, confidence: 'unknown' }
}

// ---------------------------------------------------------------------------
// Agent-facing normalized Fat Channel state (channels MCP resource)
// ---------------------------------------------------------------------------

/**
 * EQ band filter shape types.
 *
 * CONFIDENCE: guessed — requires probe-fat-channel calibration to confirm
 * the exact enum mapping from raw eqtype float to filter shape.
 *
 * Mapping (best-estimate): index = Math.round(raw * 4)
 *   0 → BELL, 1 → LOW_SHELF, 2 → HIGH_SHELF, 3 → HIGH_PASS, 4 → LOW_PASS
 *
 * Observed values on 32SC fw 3.3.0.109659:
 *   band 1 eqtype = 0.333 → LOW_SHELF (index 1, reasonable for low-band)
 *   band 2,3,4 eqtype = 1.0 → LOW_PASS by index (but all mid/high bands
 *   appeared as Bell in UC Surface — mapping is unverified; needs calibration).
 */
export const EqBandTypeSchema = z.enum([
  'BELL',
  'LOW_SHELF',
  'HIGH_SHELF',
  'HIGH_PASS',
  'LOW_PASS',
  'UNKNOWN',
])
export type EqBandType = z.infer<typeof EqBandTypeSchema>

/**
 * Normalized EQ band — values in real units with best-effort de-normalization.
 *
 * De-normalization formulas (CONFIDENCE: guessed — verify with probe-fat-channel):
 *   gainDb      = (raw - 0.5) × 36                   (linear ±18 dB)
 *   frequencyHz = 20 × 1000^raw                       (log scale 20 Hz – 20 kHz)
 *   q           = 0.1 × 160^raw                       (log scale 0.1 – 16.0)
 *   type        = EqBandTypeSchema[Math.round(raw×4)] (5 types, unverified mapping)
 *
 * TODO: confirm with `pnpm probe probe-fat-channel -d <ip> -c LINE:1` after
 * setting known values in UC Surface.
 */
export const NormalizedEqBandSchema = z.object({
  band: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  enabled: z.boolean().optional(),
  gainDb: z.number().optional(),
  frequencyHz: z.number().optional(),
  q: z.number().optional(),
  type: EqBandTypeSchema.optional(),
})
export type NormalizedEqBand = z.infer<typeof NormalizedEqBandSchema>

/**
 * Normalized Fat Channel state exposed in the channels MCP resource.
 *
 * Combines EQ, compressor, gate, and limiter in real units.
 * All continuous parameter values use best-estimate de-normalization formulas.
 * `parameterConfidence: 'guessed'` until probe-fat-channel calibration confirms.
 *
 * @see packages/presonus-inspector/src/cli/commands/probe-fat-channel.ts
 */
export const ChannelFatStateSchema = z.object({
  /** Active EQ model name — confidence: observed (same decoder as channels resource) */
  eqModel: z.string().optional(),
  /** Active compressor model name — confidence: observed */
  compModel: z.string().optional(),
  /** Master EQ on/off switch */
  eqEnabled: z.boolean().optional(),
  /**
   * EQ band parameters (up to 4 bands for STANDARD model).
   * Absent if no EQ data in state.
   */
  eqBands: z.array(NormalizedEqBandSchema).optional(),
  /** High-pass filter cutoff frequency in Hz (guessed: same log formula as EQ freq) */
  hpfFrequencyHz: z.number().optional(),
  /** Compressor/dynamics state */
  comp: z.object({
    enabled: z.boolean().optional(),
    /** Threshold in dBFS. Guessed: (raw_input - 1) × 60, giving -60 to 0 dBFS. */
    thresholdDb: z.number().optional(),
    /** Makeup gain in dB. Guessed: raw_output × 24, giving 0 to +24 dB. */
    makeupDb: z.number().optional(),
    /** Ratio (linear). Guessed: 1 + raw_ratio × 15, giving 1.0× to 16.0×. */
    ratioX: z.number().optional(),
    /** Attack in ms. Guessed: raw × 150 ms. */
    attackMs: z.number().optional(),
    /** Release in ms. Guessed: raw × 2000 ms. */
    releaseMs: z.number().optional(),
  }).optional(),
  /** Gate/expander state */
  gate: z.object({
    enabled: z.boolean().optional(),
    /** Threshold in dBFS. Guessed: (raw - 1) × 80, giving -80 to 0 dBFS. */
    thresholdDb: z.number().optional(),
    /** Attack in ms. Guessed: raw × 150 ms. */
    attackMs: z.number().optional(),
    /** Release in ms. Guessed: raw × 2000 ms. */
    releaseMs: z.number().optional(),
    /** Range in dB. Guessed: raw × -80 dB. */
    rangeDb: z.number().optional(),
    /** true = expander mode, false = gate mode */
    expander: z.boolean().optional(),
  }).optional(),
  /** Limiter state */
  limiter: z.object({
    enabled: z.boolean().optional(),
    /** Threshold in dBFS. Guessed: (raw - 1) × 20, giving -20 to 0 dBFS. */
    thresholdDb: z.number().optional(),
    /** Release in ms. Guessed: raw × 2000 ms. */
    releaseMs: z.number().optional(),
  }).optional(),
  /**
   * Calibration confidence of all continuous parameter values.
   * 'guessed'  = best-estimate formulas; verify with probe-fat-channel.
   * 'observed' = confirmed via probe-fat-channel on physical 32SC hardware.
   */
  parameterConfidence: z.enum(['observed', 'inferred', 'guessed']),
})
export type ChannelFatState = z.infer<typeof ChannelFatStateSchema>

// ---------------------------------------------------------------------------
// De-normalization helpers (raw 0–1 → real units)
//
// Confidence per function (updated from HIL probe 2026-07-01, 32SC fw 3.4.0.111374):
//   observed          = multiple HIL anchor points, exact match
//   calibrated_inferred = fitted from HIL data, documented tolerance
//   probe_required    = no calibration — formula still guessed, use with caution
//
// Evidence: test/fixtures/32sc/fat-channel/fat-channel-calibration.json
// ---------------------------------------------------------------------------

/**
 * EQ gain: linear ±15 dB.  raw=0→-15 dB, raw=0.5→0 dB, raw=1→+15 dB
 *
 * OBSERVED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 5 anchor points, max error 0.005 dB. Formula: (raw-0.5)*30
 */
export function normalizedToEqGainDb(raw: number): number {
  return (raw - 0.5) * 30
}

/**
 * EQ frequency: log scale ~36 Hz – ~18 kHz.  raw=0→36 Hz, raw=0.5→850 Hz, raw=1→18 kHz
 *
 * CALIBRATED_INFERRED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 5 anchor points (band 1 data), max error 0.013%. Formula: 36*502^raw
 * Note: calibrated from band-1 low-frequency data; apply to all bands.
 */
export function normalizedToEqFreqHz(raw: number): number {
  return 36 * Math.pow(502, raw)
}

/**
 * HPF frequency: log scale ~24 Hz – ~1000 Hz.  raw=0→24 Hz, raw=1→~1000 Hz
 *
 * CALIBRATED_INFERRED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 6 anchor points, max error 0.46%. Formula: 24*42^raw
 * This is DIFFERENT from the EQ freq formula — HPF has a narrower frequency range.
 */
export function normalizedToHpfFreqHz(raw: number): number {
  return 24 * Math.pow(42, raw)
}

/**
 * EQ Q factor: log scale ~0.03 – ~13.  raw=0→0.03, raw=0.5→0.60, raw=1→13
 *
 * CALIBRATED_INFERRED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 5 anchor points, max error 0.16 Q units. Formula: 0.028*466^raw
 */
export function normalizedToEqQ(raw: number): number {
  return 0.028 * Math.pow(466, raw)
}

/**
 * EQ filter type from raw float.
 *
 * PARTIALLY OBSERVED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 *   raw=0.333 → LOW_SHELF  (confirmed — Ch1 band-1 UC Surface display)
 *   raw=1.000 → BELL       (confirmed — Ch1 bands 2-4 UC Surface display)
 *   raw=0.000, 0.667: probe_required (not observed, formula index assumed)
 */
export function normalizedToEqBandType(raw: number): EqBandType {
  // 4 types (indices 0–3), step = 1/3:
  // 0 = LOW_PASS (raw≈0, not yet observed)
  // 1 = LOW_SHELF (raw≈0.333, confirmed)
  // 2 = HIGH_SHELF (raw≈0.667, not yet observed)
  // 3 = BELL (raw≈1.0, confirmed)
  const types: EqBandType[] = ['LOW_PASS', 'LOW_SHELF', 'HIGH_SHELF', 'BELL']
  return types[Math.round(raw * 3)] ?? 'UNKNOWN'
}

/**
 * Comp threshold: linear -56 to 0 dBFS
 *
 * CALIBRATED_INFERRED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 2 anchor points, exact match. Formula: (raw-1)*56
 * IMPORTANT: For STANDARD compressor model, the state key is `comp.threshold`
 * (NOT `comp.input` which is used by the FET model).
 */
export function normalizedToCompThresholdDb(raw: number): number {
  return (raw - 1) * 56
}

/**
 * Comp makeup gain: linear 0 to +27.6 dB
 *
 * CALIBRATED_INFERRED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 2 anchor points, max error 0.08 dB. Formula: raw*27.6
 * IMPORTANT: For STANDARD compressor model, the state key is `comp.gain`
 * (NOT `comp.output` which is used by the FET model).
 */
export function normalizedToCompMakeupDb(raw: number): number {
  return raw * 27.6
}

/**
 * Comp ratio: probe_required — formula still guessed
 * 2 HIL data points observed (4.7:1 and 10.2:1) but range not confirmed.
 * Do not use until full calibration is complete.
 */
export function normalizedToCompRatioX(raw: number): number {
  // PROBE_REQUIRED: 2 data points only (raw=0.826→4.7:1, raw=0.950→10.2:1)
  // Formula below is provisional and should not be trusted outside raw=0.8–1.0
  return 1 + raw * 15
}

/**
 * Comp/gate attack time in ms.
 *
 * CALIBRATED_INFERRED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 2 anchor points, max error 5%. Formula: 0.2*exp(10.3*raw)
 * Validated only for raw 0.15–0.40; extrapolation outside this range is uncertain.
 */
export function normalizedToAttackMs(raw: number): number {
  return 0.2 * Math.exp(10.3 * raw)
}

/**
 * Comp/gate/limiter release time in ms.
 * PROBE_REQUIRED: only one HIL data point (raw=0.5 → 150 ms).
 * Do not use until full calibration is complete.
 */
export function normalizedToReleaseMs(raw: number): number {
  // PROBE_REQUIRED: 1 data point only (raw=0.5 → 150 ms)
  // Provisional linear estimate; actual taper is unknown
  return raw * 2000
}

/**
 * Gate threshold in dBFS.
 *
 * CALIBRATED_INFERRED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01):
 * 2 anchor points, max error 0.007 dB. Formula: (raw-1)*84
 */
export function normalizedToGateThresholdDb(raw: number): number {
  return (raw - 1) * 84
}

/**
 * Gate range/depth in dB.
 * PROBE_REQUIRED: no calibration data.
 */
export function normalizedToGateRangeDb(raw: number): number {
  return raw * -80
}

/**
 * Limiter threshold in dBFS.
 * PROBE_REQUIRED: no calibration data.
 */
export function normalizedToLimiterThresholdDb(raw: number): number {
  return (raw - 1) * 20
}

// ---------------------------------------------------------------------------
// Inverse de-normalization helpers (real units → raw 0–1 for write tools)
// Confidence matches the forward function unless noted otherwise.
// ---------------------------------------------------------------------------

/** EQ gain dB → raw 0–1. Clamps to ±15 dB range. OBSERVED. */
export function eqGainDbToNormalized(db: number): number {
  return Math.max(0, Math.min(1, db / 30 + 0.5))
}

/** EQ frequency Hz → raw 0–1. Clamps to 36–18000 Hz range. CALIBRATED_INFERRED. */
export function eqFreqHzToNormalized(hz: number): number {
  const clamped = Math.max(36, Math.min(18000, hz))
  return Math.log(clamped / 36) / Math.log(502)
}

/** HPF frequency Hz → raw 0–1. Clamps to 24–1000 Hz range. CALIBRATED_INFERRED. */
export function hpfFreqHzToNormalized(hz: number): number {
  const clamped = Math.max(24, Math.min(1000, hz))
  return Math.log(clamped / 24) / Math.log(42)
}

/** EQ Q factor → raw 0–1. Clamps to 0.028–13 range. CALIBRATED_INFERRED. */
export function eqQToNormalized(q: number): number {
  const clamped = Math.max(0.028, Math.min(13, q))
  return Math.log(clamped / 0.028) / Math.log(466)
}

/** Comp threshold dBFS → raw 0–1. Clamps to -56–0 dBFS. CALIBRATED_INFERRED (STANDARD comp). */
export function compThresholdDbToNormalized(db: number): number {
  return Math.max(0, Math.min(1, db / 56 + 1))
}

/** Comp makeup dB → raw 0–1. Clamps to 0–27.6 dB. CALIBRATED_INFERRED (STANDARD comp). */
export function compMakeupDbToNormalized(db: number): number {
  return Math.max(0, Math.min(1, db / 27.6))
}

/** Comp ratio X → raw 0–1. PROBE_REQUIRED — provisional. */
export function compRatioXToNormalized(ratioX: number): number {
  return Math.max(0, Math.min(1, (ratioX - 1) / 15))
}

/** Attack ms → raw 0–1. CALIBRATED_INFERRED (validated for 1–10 ms range only). */
export function attackMsToNormalized(ms: number): number {
  const clamped = Math.max(0.2, ms)
  return Math.log(clamped / 0.2) / 10.3
}

/** Release ms → raw 0–1. PROBE_REQUIRED — provisional. */
export function releaseMsToNormalized(ms: number): number {
  return Math.max(0, Math.min(1, ms / 2000))
}

/** Gate threshold dBFS → raw 0–1. Clamps to -84–0 dBFS. CALIBRATED_INFERRED. */
export function gateThresholdDbToNormalized(db: number): number {
  return Math.max(0, Math.min(1, db / 84 + 1))
}

/** Gate range dB → raw 0–1. PROBE_REQUIRED — provisional. */
export function gateRangeDbToNormalized(rangeDb: number): number {
  return Math.max(0, Math.min(1, rangeDb / -80))
}

/** Limiter threshold dBFS → raw 0–1. PROBE_REQUIRED — provisional. */
export function limiterThresholdDbToNormalized(db: number): number {
  return Math.max(0, Math.min(1, db / 20 + 1))
}
