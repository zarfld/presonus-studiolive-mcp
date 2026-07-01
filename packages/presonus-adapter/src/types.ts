/**
 * Internal types for the featherbear presonus-studiolive-api adapter.
 *
 * These types represent the raw structures emitted by the featherbear library.
 * They are internal to this package and must NOT leak into @presonus-mcp/domain.
 *
 * Implements: ARC-C-002 (#12), ADR-004 (#9)
 * All raw values treated as confidence "unverified" until proven by probe-fat-channel.
 *
 * TODO: Update these types based on actual @featherbear/presonus-studiolive-api v1.8.0
 * type declarations after running `pnpm install`.
 */

/** Raw device info as returned by featherbear Discovery */
export interface RawDiscoveredDevice {
  name: string
  serial?: string
  ip: string
  port: number
  timestamp?: number
  /** Model string if exposed by the discovery packet */
  model?: string
}

/** Raw state tree as returned by client.dumpState() or client.state._data */
export type RawStateTree = Record<string, unknown>

/** Raw meter packet from a single meter event */
export interface RawMeterPacket {
  /** Channel level values indexed by channel position */
  channels: number[]
  timestamp: number
}

/** Well-known state key prefixes (empirically determined; unverified raw values) */
export const RAW_KEY_PREFIXES = {
  LINE_CHANNEL: 'line.ch',
  AUX_CHANNEL: 'aux.ch',
  FX_CHANNEL: 'fx.ch',
  SUB_CHANNEL: 'sub.ch',
  MAIN: 'main',
  GLOBAL: 'global',
  FAT: '.fat',
} as const

/** Known global state keys — OBSERVED on StudioLive 32SC firmware 3.3.0.109659 (2026-06-24) */
export const KNOWN_GLOBAL_KEYS = {
  MIXER_NAME: 'global.mixer_name',
  /** Firmware version string, e.g. "3.3.0.109659" */
  FIRMWARE: 'global.mixer_version',
  /** Serial number, e.g. "SD7E21010066" */
  MIXER_SERIAL: 'global.mixer_serial',
  /**
   * Stagebox slave mode (0 = standalone FOH, 1 = stagebox/slave to another mixer).
   * OBSERVED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24).
   * Used by validate_stagebox_routing (#34).
   */
  STAGEBOX_MODE: 'global.stagebox_mode',
  /**
   * Loaded project title (short name), e.g. "32SCKellersessions".
   * OBSERVED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24).
   * Prefer this over PRESETS_PROJECT_NAME for display.
   */
  PRESETS_PROJECT_TITLE: 'presets.loaded_project_title',
  /**
   * Loaded project path string, e.g. "proj/01.32SCKellersessions.proj".
   * Use as fallback when PRESETS_PROJECT_TITLE is absent.
   */
  PRESETS_PROJECT_NAME: 'presets.loaded_project_name',
} as const

/**
 * Known per-channel state key suffixes (relative to `line.chN` prefix).
 * OBSERVED on StudioLive 32SC firmware 3.3.0.109659 (2026-06-24).
 * All paths confirmed via probe dump-state; keys produced by flattenFeatherbearState().
 */
export const KNOWN_CHANNEL_KEY_SUFFIXES = {
  /**
   * Custom label set by engineer (what appears on scribble strip).
   * OBSERVED: "Kick In" — the UC Surface user label.
   * Falls back to NAME if empty.
   */
  USERNAME: '.username',
  /** Default system name, e.g. "Ch. 1" */
  NAME: '.name',
  MUTE: '.mute',
  SOLO: '.solo',
  VOLUME: '.volume',
  PAN: '.pan',
  LINK: '.link',
  COLOR: '.color',
  /** Phantom power (48V) — field name is "48v" on mixer */
  PHANTOM: '.48v',
  /**
   * Compressor model selector (normalized float).
   * Decode with decodeCompressorModel(value) from @presonus-mcp/domain.
   * State key full path: line.chN.opt.compmodel.value
   */
  OPT_COMPMODEL_VALUE: '.opt.compmodel.value',
  /**
   * EQ model selector (normalized float).
   * Decode with decodeEqModel(value) from @presonus-mcp/domain.
   * State key full path: line.chN.opt.eqmodel.value
   */
  OPT_EQMODEL_VALUE: '.opt.eqmodel.value',
  /** Whether EQ comes before compressor in signal chain (0=comp first, 1=eq first) */
  OPT_SWAPCOMPEQ: '.opt.swapcompeq',
} as const

/**
 * Known Fat Channel (DSP) state key suffixes (relative to `line.chN` prefix).
 * OBSERVED on StudioLive 32SC firmware 3.3.0.109659 (2026-06-24).
 *
 * All values are normalized floats (0.0–1.0) or booleans unless noted.
 * De-normalization formulas: see extractFatChannelState() in state-mapper.ts.
 */
export const KNOWN_FAT_KEY_SUFFIXES = {
  // ── EQ section (4-band parametric) ─────────────────────────────────────
  /** Master EQ on/off (0=off, 1=on) */
  EQ_ON: '.eq.eqallon',
  EQ_TYPE1: '.eq.eqtype1',   EQ_GAIN1: '.eq.eqgain1',   EQ_Q1: '.eq.eqq1',   EQ_FREQ1: '.eq.eqfreq1',   EQ_BAND_ON1: '.eq.eqbandon1',
  EQ_TYPE2: '.eq.eqtype2',   EQ_GAIN2: '.eq.eqgain2',   EQ_Q2: '.eq.eqq2',   EQ_FREQ2: '.eq.eqfreq2',   EQ_BAND_ON2: '.eq.eqbandon2',
  EQ_TYPE3: '.eq.eqtype3',   EQ_GAIN3: '.eq.eqgain3',   EQ_Q3: '.eq.eqq3',   EQ_FREQ3: '.eq.eqfreq3',   EQ_BAND_ON3: '.eq.eqbandon3',
  EQ_TYPE4: '.eq.eqtype4',   EQ_GAIN4: '.eq.eqgain4',   EQ_Q4: '.eq.eqq4',   EQ_FREQ4: '.eq.eqfreq4',   EQ_BAND_ON4: '.eq.eqbandon4',
  // ── Compressor section ──────────────────────────────────────────────────
  COMP_ON: '.comp.on',
  /** Input level / threshold (normalized 0–1) */
  COMP_INPUT: '.comp.input',
  /** Output makeup gain (normalized 0–1) */
  COMP_OUTPUT: '.comp.output',
  COMP_ATTACK: '.comp.attack',
  COMP_RELEASE: '.comp.release',
  COMP_RATIO: '.comp.ratio',
  // ── Gate/expander section ───────────────────────────────────────────────
  GATE_ON: '.gate.on',
  GATE_THRESHOLD: '.gate.threshold',
  GATE_ATTACK: '.gate.attack',
  GATE_RELEASE: '.gate.release',
  GATE_RANGE: '.gate.range',
  /** true = expander mode, false = gate mode */
  GATE_EXPANDER: '.gate.expander',
  // ── Limiter section ─────────────────────────────────────────────────────
  LIMIT_ON: '.limit.limiteron',
  LIMIT_THRESHOLD: '.limit.threshold',
  LIMIT_RELEASE: '.limit.release',
  // ── High-pass filter ────────────────────────────────────────────────────
  FILTER_HPF: '.filter.hpf',
} as const

/**
 * Known per-channel send routing key suffixes (relative to `line.chN` prefix).
 * OBSERVED on StudioLive 32SC firmware 3.3.0.109659 (2026-06-24).
 *
 * All send levels are normalized floats (0.0–1.0).
 * assign_auxN and subN are booleans / integers (0 or 1).
 * lr is integer (0 = not assigned to main LR, 1 = assigned).
 */
export const KNOWN_SEND_ROUTING_KEY_SUFFIXES = {
  // ── AUX sends (1–32) ────────────────────────────────────────────────────
  // aux1–aux32: send level (normalized float 0–1)
  // assign_aux1–assign_aux32: boolean, channel assigned to this AUX bus
  AUX_SEND_PREFIX: '.aux',          // e.g. ".aux1" → ".aux32"
  AUX_ASSIGN_PREFIX: '.assign_aux', // e.g. ".assign_aux1" → ".assign_aux32"
  AUX_BUS_COUNT: 32,
  // ── FX sends (FXA–FXH) ──────────────────────────────────────────────────
  FX_SEND_A: '.FXA', FX_SEND_B: '.FXB', FX_SEND_C: '.FXC', FX_SEND_D: '.FXD',
  FX_SEND_E: '.FXE', FX_SEND_F: '.FXF', FX_SEND_G: '.FXG', FX_SEND_H: '.FXH',
  // ── Subgroup assigns (sub1–sub4) ─────────────────────────────────────────
  SUB_PREFIX: '.sub',  // e.g. ".sub1" → ".sub4"
  SUB_BUS_COUNT: 4,
  // ── Main LR assign ───────────────────────────────────────────────────────
  /** line.chN.lr: 0 = not assigned to main LR, 1 = assigned */
  MAIN_LR: '.lr',
} as const

/**
 * Output patch router state key patterns.
 * OBSERVED on StudioLive 32SC firmware 3.3.0.109659 (2026-06-24).
 *
 * mix1_src through mix16_src: analog output assignments.
 * avb1_src through avb8_src: AVB stream output assignments.
 * Each key has .value (normalized 0–1), .range.max (max index), .range.units.
 *
 * sourceIndex = Math.round(value * range.max)
 * For 32SC analog outs: range.max = 27 (= 28 sources 0–27). Source name mapping: UNVERIFIED.
 */
export const OUTPUT_PATCH_KEY_PATTERNS = {
  ANALOG_PREFIX: 'outputpatchrouter.mix',   // e.g. 'outputpatchrouter.mix1_src.value'
  AVB_PREFIX: 'outputpatchrouter.avb',      // e.g. 'outputpatchrouter.avb1_src.value'
  ANALOG_COUNT: 16,
  AVB_COUNT: 8,
} as const

// ---------------------------------------------------------------------------
// Preamp gain key — HIL probe 2026-07-01 (StudioLive 32SC fw 3.4.0.111374)
// ---------------------------------------------------------------------------

/**
 * Preamp gain key suffixes (relative to `line.chN` prefix).
 * OBSERVED: StudioLive 32SC firmware 3.4.0.111374 (2026-07-01 HIL probe).
 * range.curve = linear; formula: dB = value × PREAMP_GAIN_RANGE_MAX.
 */
export const KNOWN_PREAMP_KEY_SUFFIXES = {
  /** Normalized 0–1. Formula: dB = value × 60. Curve: linear. */
  PREAMPGAIN_VALUE: '.preampgain.value',
} as const

/**
 * Preamp gain range max (60 dB). From preampgain.range.max in state.
 * OBSERVED on StudioLive 32SC fw 3.4.0.111374 (2026-07-01).
 */
export const PREAMP_GAIN_RANGE_MAX = 60

// ---------------------------------------------------------------------------
// Fader (volume) calibration constants — HIL probe 2026-07-01 (32SC fw 3.4.0.111374)
// ---------------------------------------------------------------------------

/**
 * Fader calibration constants for line.chN.volume (0–100 raw scale).
 *
 * IMPORTANT: line.chN.volume is SCENE-STORED, not the live fader position.
 * Values reflect the fader position when the scene was last saved.
 *
 * Formula (piecewise):
 *   v <= 0:        FADER_MIN_DB (-84 dB)
 *   v >= 100:      FADER_MAX_DB (+10 dB)
 *   v in [unity, 100]: linear, (v - unity) / (100 - unity) * 10
 *   v in (0, unity):   log10, max(-84, LOG_COEFF * log10(v / unity))
 *
 * Calibrated from 5 anchor points (StudioLive 32SC fw 3.4.0.111374, 2026-07-01):
 *   0 → -84 dB, 23.77 → -28.4 dB, 59.28 → -5.36 dB, 73.36 → 0 dB, 100 → +10 dB
 * Confidence: inferred (taper shape confirmed from 2 intermediate anchor points, max error 0.025 dB).
 */
export const FADER_UNITY_RAW   = 73.3591  // raw value at 0 dB (observed Ch3, scene-saved)
export const FADER_MAX_DB      = 10        // dB at raw = 100
export const FADER_MIN_DB      = -84       // dB at raw = 0 (minimum stop)
export const FADER_LOG_COEFF   = 57.98     // log10 taper coefficient (fitted from anchor points)

/**
 * Per-channel input source selection key suffixes (relative to `line.chN` prefix).
 * OBSERVED: StudioLive 32SC firmware 3.4.0.111374 (2026-07-01 HIL probe).
 * Evidence: captures/probe-input-source/ (before/after diff with Ch1 Local→Stage Box).
 */
export const KNOWN_INPUT_SRC_KEY_SUFFIXES = {
  /** Normalized 0–1 float. Index = Math.round(value × INPUT_SRC_RANGE_MAX). */
  INPUTSRC_VALUE: '.inputsrc.value',
} as const

/**
 * Effective max index for line.chN.inputsrc.value on StudioLive 32SC.
 * Gives 4 options: indices 0–3.
 * OBSERVED: strings=3 in flat state (confirmed by probe: 4 distinct values seen).
 */
export const INPUT_SRC_RANGE_MAX = 3

/**
 * Input source labels by index on StudioLive 32SC.
 * ALL FOUR LABELS OBSERVED on firmware 3.4.0.111374 (2026-07-01 HIL probe).
 *
 * Evidence:
 *   Index 0: default state (Local) — baseline capture 2026-06-24
 *   Index 1: Ch1 changed Local→Stage Box — probe diff 2026-07-01
 *   Index 2: Ch25-28/31-32 confirmed USB via UC Surface display + Ch17 diff (1.0→0.667)
 *   Index 3: Ch17-22/24/29-30 confirmed SD Card via UC Surface display
 *   All confirmed: captures/probe-idx23/baseline.json + after-ch17-usb.json
 */
export const INPUT_SRC_LABELS: ReadonlyArray<string | null> = [
  'Local',     // index 0 — observed
  'Stage Box', // index 1 — observed
  'USB',       // index 2 — observed 2026-07-01 (was probe_required)
  'SD Card',   // index 3 — observed 2026-07-01 (was probe_required)
] as const

// ---------------------------------------------------------------------------
// AVB / stagebox stream routing keys — HIL probe 2026-07-01 (32SC + 32R)
// ---------------------------------------------------------------------------

/**
 * Stagebox setup and AVB stream routing key patterns.
 * OBSERVED: StudioLive 32SC + PreSonus StudioLive 32R (2026-07-01 HIL probe, fw 3.4.0.111374).
 * Evidence: captures/probe-avb/ (stream swap confirmed in diff).
 */
export const KNOWN_STAGEBOX_KEY_PATTERNS = {
  /**
   * Prefix for per-block AVB source keys.
   * Full key: `${AVB_SRC_PREFIX}${range}${AVB_SRC_VALUE_SUFFIX}`
   * e.g. stageboxsetup.avb_src_1_8.value
   */
  AVB_SRC_PREFIX: 'stageboxsetup.avb_src_',
  AVB_SRC_VALUE_SUFFIX: '.value',
  AVB_SRC_STRINGS_SUFFIX: '.strings',
  /** 1 = stagebox connected, 0 = not connected */
  CONNECT_STATUS: 'stageboxsetup.connect_status',
  /** Display name of connected stagebox (e.g. "PreSonus StudioLive 32R") */
  SELECTED_NAME: 'stageboxsetup.selected_name',
  /**
   * Max stream index for avb_src_*.value on 32SC.
   * 9 options: 0="None", 1–8="DeviceName:Send X-Y".
   * Formula: Math.round(value × AVB_RANGE_MAX).
   */
  AVB_RANGE_MAX: 8,
} as const

/**
 * The 8 channel-block range suffixes for AVB src keys on StudioLive 32SC.
 * OBSERVED on firmware 3.4.0.111374 (2026-07-01 HIL probe).
 * Used as: `stageboxsetup.avb_src_${range}.value`
 */
export const AVB_SRC_BLOCK_RANGES = [
  '1_8', '9_16', '17_24', '25_32', '33_40', '41_48', '49_56', '57_64',
] as const
export type AvbSrcBlockRange = typeof AVB_SRC_BLOCK_RANGES[number]
