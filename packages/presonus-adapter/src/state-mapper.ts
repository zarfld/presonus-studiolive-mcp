/**
 * Maps raw PreSonus state keys to normalized MixerChannel[].
 *
 * @module state-mapper
 * @implements #17 REQ-F-003: Expose normalized channel list as MCP resource
 * @implements #19 REQ-F-005: Expose current scene/project as MCP resource
 * @implements #23 REQ-NF-003: State cache freshness ≤ 500 ms
 * @architecture #12 ARC-C-002: presonus-adapter package
 * @architecture #7 ADR-002: Three-layer architecture — raw state never leaked to MCP layer
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/17
 *
 * KEY MAPPING VERIFIED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24)
 *
 * CRITICAL DISCOVERY: The featherbear state._data is a NESTED TREE, not a flat dict.
 * Path structure: internal.children.<section>.children.<item>.children.<field>
 * The featherbear state.get("line.ch1.mute") traverses this tree using dot-notation.
 * We flatten it first with flattenFeatherbearState() before key-pattern processing.
 */
import type { MixerChannel, MixerIdentity, ChannelFatState, NormalizedEqBand } from '@presonus-mcp/domain'
import {
  decodeCompressorModel,
  decodeEqModel,
  normalizedToEqGainDb,
  normalizedToEqFreqHz,
  normalizedToEqQ,
  normalizedToEqBandType,
  normalizedToCompThresholdDb,
  normalizedToCompMakeupDb,
  normalizedToCompRatioX,
  normalizedToAttackMs,
  normalizedToReleaseMs,
  normalizedToGateThresholdDb,
  normalizedToGateRangeDb,
  normalizedToLimiterThresholdDb,
} from '@presonus-mcp/domain'
import type { RawStateTree } from './types.js'
import { KNOWN_CHANNEL_KEY_SUFFIXES, KNOWN_FAT_KEY_SUFFIXES, KNOWN_GLOBAL_KEYS } from './types.js'

export interface MixerSnapshot {
  identity: MixerIdentity
  channels: MixerChannel[]
  currentProject: string | undefined
  currentScene: string | undefined
  availableProjects: string[]
  capturedAt: string
  /** Raw state preserved for diagnostic/probe use (nested tree, pre-flattening) */
  rawState: RawStateTree
  /** Flattened state (dot-notation keys) used by all mapper functions */
  flatState: Record<string, unknown>
  /**
   * True when the connection to the mixer has been lost and state may be stale.
   * Resources include _stale:true in JSON responses when this is set.
   * Cleared to false on successful reconnect.
   */
  isStale: boolean
  /** ISO 8601 timestamp when the connection was lost (undefined when connected) */
  disconnectedAt: string | undefined
}

/**
 * Structural keys in the featherbear state tree that are NOT part of the
 * logical key path — they are traversal wrappers and should be skipped
 * when constructing dot-notation paths.
 *
 * OBSERVED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24)
 * Structure: _data.internal.children.<section>.children.<item>.children.<field>
 */
const STRUCTURAL_SKIP_KEYS = new Set(['internal', 'children', 'cache'])

/**
 * Flatten the featherbear nested state tree into a flat dot-notation dict.
 *
 * Input (nested): `{ internal: { children: { line: { children: { ch1: { children: { mute: false } } } } } } }`
 * Output (flat):  `{ "line.ch1.mute": false, "global.mixer_name": "StudioLive 32SC", ... }`
 *
 * Rules:
 * - Keys in STRUCTURAL_SKIP_KEYS ("internal", "children", "cache") are skipped from the path
 * - All other object nodes are traversed with their key appended to the path
 * - Leaf values are written to result[fullPath]
 */
export function flattenFeatherbearState(
  node: Record<string, unknown>,
  prefix: string = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(node)) {
    if (STRUCTURAL_SKIP_KEYS.has(key)) {
      // Structural wrapper — recurse WITHOUT adding key to path
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenFeatherbearState(value as Record<string, unknown>, prefix))
      }
      continue
    }

    const nextPrefix = prefix ? `${prefix}.${key}` : key

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Non-leaf node — recurse WITH key added to path
      Object.assign(result, flattenFeatherbearState(value as Record<string, unknown>, nextPrefix))
    } else {
      // Leaf value
      result[nextPrefix] = value
    }
  }

  return result
}

/**
 * Extract the mixer name from a FLAT state dict.
 * Key: `global.mixer_name` — OBSERVED on 32SC fw 3.3.0.109659
 */
export function extractMixerName(flat: Record<string, unknown>): string | undefined {
  const val = flat[KNOWN_GLOBAL_KEYS.MIXER_NAME]
  return typeof val === 'string' ? val : undefined
}

/**
 * Extract the mixer serial from a FLAT state dict.
 * Key: `global.mixer_serial` — OBSERVED on 32SC fw 3.3.0.109659
 */
export function extractMixerSerial(flat: Record<string, unknown>): string | undefined {
  const val = flat[KNOWN_GLOBAL_KEYS.MIXER_SERIAL]
  return typeof val === 'string' ? val : undefined
}

/**
 * Extract the current project name from a FLAT state dict.
 *
 * Prefers `presets.loaded_project_title` (short display name, e.g. "32SCKellersessions").
 * Falls back to parsing `presets.loaded_project_name` path (e.g. "proj/01.32SCKellersessions.proj").
 *
 * OBSERVED: StudioLive 32SC firmware 3.3.0.109659 (2026-06-24).
 *
 * NOTE: This is a best-effort extraction from state keys. The authoritative source is
 * `client.currentProject` (featherbear property) which is set in client-manager.ts after connect.
 */
export function extractCurrentProject(flat: Record<string, unknown>): string | undefined {
  const title = flat[KNOWN_GLOBAL_KEYS.PRESETS_PROJECT_TITLE]
  if (typeof title === 'string' && title.trim().length > 0) return title.trim()

  const pathStr = flat[KNOWN_GLOBAL_KEYS.PRESETS_PROJECT_NAME]
  if (typeof pathStr === 'string') {
    // Parse title from path like "proj/01.32SCKellersessions.proj" → "32SCKellersessions"
    const match = /[^/\\]+\.(.+?)\.proj$/i.exec(pathStr)
    if (match?.[1]) return match[1]
    // Fallback: return the raw path string
    return pathStr
  }
  return undefined
}

/**
 * Extract normalized Fat Channel DSP state for one channel from a flat state dict.
 *
 * Returns undefined when no Fat Channel keys are present in the flat state
 * (e.g. during initial connect before full state is received).
 *
 * De-normalization formulas: see normalizedTo*() functions in @presonus-mcp/domain.
 * All values are CONFIDENCE: 'guessed' until probe-fat-channel calibration confirms.
 *
 * OBSERVED key structure on StudioLive 32SC fw 3.3.0.109659:
 *   line.ch1.eq.eqgain1 = 0.5412 (normalized float)
 *   line.ch1.comp.on    = 1      (integer 0 or 1)
 *   line.ch1.gate.expander = true (boolean)
 */
export function extractFatChannelState(
  flat: Record<string, unknown>,
  prefix: string,
): ChannelFatState | undefined {
  const f = (suffix: string): unknown => flat[`${prefix}${suffix}`]

  // Quick presence check — return undefined if no DSP state in snapshot
  const eqOnRaw   = f(KNOWN_FAT_KEY_SUFFIXES.EQ_ON)
  const compOnRaw = f(KNOWN_FAT_KEY_SUFFIXES.COMP_ON)
  const gateOnRaw = f(KNOWN_FAT_KEY_SUFFIXES.GATE_ON)
  const limitOnRaw = f(KNOWN_FAT_KEY_SUFFIXES.LIMIT_ON)
  if (eqOnRaw === undefined && compOnRaw === undefined && gateOnRaw === undefined && limitOnRaw === undefined) {
    return undefined
  }

  /** Coerce 0/1 integer or boolean to boolean */
  const toBool = (v: unknown): boolean | undefined => {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    return undefined
  }

  // Model names (decoded from opt.compmodel / opt.eqmodel)
  const compModelRaw = f(KNOWN_CHANNEL_KEY_SUFFIXES.OPT_COMPMODEL_VALUE)
  const eqModelRaw   = f(KNOWN_CHANNEL_KEY_SUFFIXES.OPT_EQMODEL_VALUE)
  const compModelResult = typeof compModelRaw === 'number' ? decodeCompressorModel(compModelRaw) : undefined
  const eqModelResult   = typeof eqModelRaw   === 'number' ? decodeEqModel(eqModelRaw)           : undefined

  // EQ bands
  const eqBands: NormalizedEqBand[] = []
  for (const band of [1, 2, 3, 4] as const) {
    const gainRaw    = f(`.eq.eqgain${band}`)
    const freqRaw    = f(`.eq.eqfreq${band}`)
    const qRaw       = f(`.eq.eqq${band}`)
    const typeRaw    = f(`.eq.eqtype${band}`)
    const enabledRaw = f(`.eq.eqbandon${band}`)

    if (gainRaw === undefined && freqRaw === undefined) continue  // band not in state

    eqBands.push({
      band,
      enabled: toBool(enabledRaw),
      gainDb:      typeof gainRaw === 'number' ? normalizedToEqGainDb(gainRaw)       : undefined,
      frequencyHz: typeof freqRaw === 'number' ? normalizedToEqFreqHz(freqRaw)       : undefined,
      q:           typeof qRaw    === 'number' ? normalizedToEqQ(qRaw)               : undefined,
      type:        typeof typeRaw === 'number' ? normalizedToEqBandType(typeRaw)      : undefined,
    })
  }

  // HPF (uses same log-frequency formula as EQ freq)
  const hpfRaw = f(KNOWN_FAT_KEY_SUFFIXES.FILTER_HPF)

  // Compressor
  const compInputRaw   = f(KNOWN_FAT_KEY_SUFFIXES.COMP_INPUT)
  const compOutputRaw  = f(KNOWN_FAT_KEY_SUFFIXES.COMP_OUTPUT)
  const compAttackRaw  = f(KNOWN_FAT_KEY_SUFFIXES.COMP_ATTACK)
  const compReleaseRaw = f(KNOWN_FAT_KEY_SUFFIXES.COMP_RELEASE)
  const compRatioRaw   = f(KNOWN_FAT_KEY_SUFFIXES.COMP_RATIO)

  // Gate
  const gateThreshRaw  = f(KNOWN_FAT_KEY_SUFFIXES.GATE_THRESHOLD)
  const gateAttackRaw  = f(KNOWN_FAT_KEY_SUFFIXES.GATE_ATTACK)
  const gateReleaseRaw = f(KNOWN_FAT_KEY_SUFFIXES.GATE_RELEASE)
  const gateRangeRaw   = f(KNOWN_FAT_KEY_SUFFIXES.GATE_RANGE)
  const gateExpanderRaw = f(KNOWN_FAT_KEY_SUFFIXES.GATE_EXPANDER)

  // Limiter
  const limitThreshRaw  = f(KNOWN_FAT_KEY_SUFFIXES.LIMIT_THRESHOLD)
  const limitReleaseRaw = f(KNOWN_FAT_KEY_SUFFIXES.LIMIT_RELEASE)

  return {
    eqModel:   eqModelResult?.normalized,
    compModel: compModelResult?.normalized,
    eqEnabled: toBool(eqOnRaw),
    eqBands:   eqBands.length > 0 ? eqBands : undefined,
    hpfFrequencyHz: typeof hpfRaw === 'number' ? normalizedToEqFreqHz(hpfRaw) : undefined,
    comp: compOnRaw !== undefined ? {
      enabled:     toBool(compOnRaw),
      thresholdDb: typeof compInputRaw   === 'number' ? normalizedToCompThresholdDb(compInputRaw)   : undefined,
      makeupDb:    typeof compOutputRaw  === 'number' ? normalizedToCompMakeupDb(compOutputRaw)      : undefined,
      ratioX:      typeof compRatioRaw   === 'number' ? normalizedToCompRatioX(compRatioRaw)         : undefined,
      attackMs:    typeof compAttackRaw  === 'number' ? normalizedToAttackMs(compAttackRaw)          : undefined,
      releaseMs:   typeof compReleaseRaw === 'number' ? normalizedToReleaseMs(compReleaseRaw)        : undefined,
    } : undefined,
    gate: gateOnRaw !== undefined ? {
      enabled:     toBool(gateOnRaw),
      thresholdDb: typeof gateThreshRaw  === 'number' ? normalizedToGateThresholdDb(gateThreshRaw)  : undefined,
      attackMs:    typeof gateAttackRaw  === 'number' ? normalizedToAttackMs(gateAttackRaw)         : undefined,
      releaseMs:   typeof gateReleaseRaw === 'number' ? normalizedToReleaseMs(gateReleaseRaw)       : undefined,
      rangeDb:     typeof gateRangeRaw   === 'number' ? normalizedToGateRangeDb(gateRangeRaw)       : undefined,
      expander:    toBool(gateExpanderRaw),
    } : undefined,
    limiter: limitOnRaw !== undefined ? {
      enabled:     toBool(limitOnRaw),
      thresholdDb: typeof limitThreshRaw  === 'number' ? normalizedToLimiterThresholdDb(limitThreshRaw)  : undefined,
      releaseMs:   typeof limitReleaseRaw === 'number' ? normalizedToReleaseMs(limitReleaseRaw)          : undefined,
    } : undefined,
    parameterConfidence: 'guessed',
  }
}

/**
 * Extract all LINE channels from a FLAT state dict.
 *
 * Pattern: `line.ch<N>.<suffix>` where N = 1..32.
 * OBSERVED: 32 channels on StudioLive 32SC fw 3.3.0.109659 (2026-06-24).
 *
 * Pan range: 0.0 (full left) to 1.0 (full right), 0.5 = center.
 * Volume range: 0.0 to 1.0 (exact scale TBD — needs fader movement probe).
 */
export function extractLineChannels(flat: Record<string, unknown>): MixerChannel[] {
  const channels: MixerChannel[] = []

  // Discover channel numbers from keys that match the mute pattern
  const mutePattern = /^line\.ch(\d+)\.mute$/
  const channelNumbers = new Set<number>()

  for (const key of Object.keys(flat)) {
    const match = mutePattern.exec(key)
    if (match?.[1]) {
      channelNumbers.add(parseInt(match[1], 10))
    }
  }

  for (const n of [...channelNumbers].sort((a, b) => a - b)) {
    const prefix = `line.ch${n}`
    const rawExtra: Record<string, unknown> = {}

    // Collect all keys for this channel that we don't map explicitly
    // Exclude both KNOWN_CHANNEL_KEY_SUFFIXES and KNOWN_FAT_KEY_SUFFIXES (those are
    // now normalized into the `fatChannel` field instead of spilling into rawExtra).
    const knownSuffixValues = new Set<string>([
      ...Object.values(KNOWN_CHANNEL_KEY_SUFFIXES),
      ...Object.values(KNOWN_FAT_KEY_SUFFIXES),
    ])
    for (const [key, val] of Object.entries(flat)) {
      if (key.startsWith(prefix + '.')) {
        const suffix = key.slice(prefix.length)
        if (!knownSuffixValues.has(suffix)) {
          rawExtra[key] = val
        }
      }
    }

    const username = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.USERNAME}`]
    const defaultName = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.NAME}`]
    // Use username (engineer label) if set, otherwise fall back to default system name
    const resolvedName = (typeof username === 'string' && username.trim().length > 0)
      ? username
      : (typeof defaultName === 'string' ? defaultName : undefined)
    const mute = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.MUTE}`]
    const solo = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.SOLO}`]
    const volume = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.VOLUME}`]
    const pan = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.PAN}`]
    const linked = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.LINK}`]
    const color = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.COLOR}`]

    // Decode Fat Channel model names from opt.compmodel.value / opt.eqmodel.value
    const rawCompModelVal = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.OPT_COMPMODEL_VALUE}`]
    const rawEqModelVal = flat[`${prefix}${KNOWN_CHANNEL_KEY_SUFFIXES.OPT_EQMODEL_VALUE}`]
    const compModelResult = typeof rawCompModelVal === 'number'
      ? decodeCompressorModel(rawCompModelVal)
      : undefined
    const eqModelResult = typeof rawEqModelVal === 'number'
      ? decodeEqModel(rawEqModelVal)
      : undefined

    const channel: MixerChannel = {
      id: prefix,
      selector: { type: 'LINE', channel: n },
      name: resolvedName,
      mute: typeof mute === 'boolean' ? mute : undefined,
      solo: typeof solo === 'boolean' ? solo : undefined,
      fader: typeof volume === 'number'
        ? { linear: Math.max(0, Math.min(1, volume)), db: null, raw: volume }
        : undefined,
      // Pan: 0.0 = full left, 0.5 = center, 1.0 = full right — OBSERVED 32SC fw 3.3.0.109659
      pan: typeof pan === 'number' ? Math.max(0, Math.min(1, pan)) : undefined,
      linked: typeof linked === 'boolean' ? linked : undefined,
      color: typeof color === 'string' ? color : undefined,
      compModelName: compModelResult?.normalized,
      eqModelName: eqModelResult?.normalized,
      fatChannel: extractFatChannelState(flat, prefix),
      rawExtra: Object.keys(rawExtra).length > 0 ? rawExtra : undefined,
    }

    channels.push(channel)
  }

  return channels
}

/**
 * Build a snapshot from an already-flattened state dict.
 *
 * Used by the write flow: after applying a change, the flat state is updated
 * directly (avoiding re-flattening the full nested tree).
 */
export function buildSnapshotFromFlatState(
  identity: MixerIdentity,
  flat: Record<string, unknown>,
  raw: RawStateTree,
): MixerSnapshot {
  const channels = extractLineChannels(flat)
  const stateSerial = extractMixerSerial(flat)
  const resolvedIdentity: MixerIdentity = {
    ...identity,
    name: extractMixerName(flat) ?? identity.name,
    serial: identity.serial ?? stateSerial,
  }
  return {
    identity: resolvedIdentity,
    channels,
    currentProject: extractCurrentProject(flat),
    currentScene: undefined,  // set from client.currentScene in client-manager after connect
    availableProjects: [],
    capturedAt: new Date().toISOString(),
    rawState: raw,
    flatState: flat,
    isStale: false,
    disconnectedAt: undefined,
  }
}

/**
 * Map raw featherbear nested state tree to a full MixerSnapshot.
 *
 * Flattens the nested tree first, then extracts typed domain objects.
 * Gracefully handles unknown keys — they are preserved in rawState.
 */
export function mapRawStateToSnapshot(
  identity: MixerIdentity,
  raw: RawStateTree,
): MixerSnapshot {
  // Flatten the nested featherbear tree into dot-notation keys
  const flat = flattenFeatherbearState(raw as Record<string, unknown>)

  const channels = extractLineChannels(flat)
  // TODO: Add AUX, FX, SUB, MAIN channel extraction (Phase P1.4 diff workflow)

  // Resolve serial from state if not already in identity
  const stateSerial = extractMixerSerial(flat)
  const resolvedIdentity: MixerIdentity = {
    ...identity,
    name: extractMixerName(flat) ?? identity.name,
    serial: identity.serial ?? stateSerial,
  }

  return {
    identity: resolvedIdentity,
    channels,
    currentProject: extractCurrentProject(flat),
    currentScene: undefined,  // set from client.currentScene in client-manager after connect
    availableProjects: [],       // TODO: map after probe run (client.getProjects())
    capturedAt: new Date().toISOString(),
    rawState: raw,
    flatState: flat,
    isStale: false,
    disconnectedAt: undefined,
  }
}
