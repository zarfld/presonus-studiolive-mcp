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
