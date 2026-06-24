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
