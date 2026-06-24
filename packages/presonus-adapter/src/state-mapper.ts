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
import type { MixerChannel, MixerIdentity } from '@presonus-mcp/domain'
import { decodeCompressorModel, decodeEqModel } from '@presonus-mcp/domain'
import type { RawStateTree } from './types.js'
import { KNOWN_CHANNEL_KEY_SUFFIXES, KNOWN_GLOBAL_KEYS } from './types.js'

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
    for (const [key, val] of Object.entries(flat)) {
      if (key.startsWith(prefix + '.')) {
        const suffix = key.slice(prefix.length)
        const isKnownSuffix = Object.values(KNOWN_CHANNEL_KEY_SUFFIXES).includes(
          suffix as (typeof KNOWN_CHANNEL_KEY_SUFFIXES)[keyof typeof KNOWN_CHANNEL_KEY_SUFFIXES],
        )
        if (!isKnownSuffix) {
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
      rawExtra: Object.keys(rawExtra).length > 0 ? rawExtra : undefined,
    }

    channels.push(channel)
  }

  return channels
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
    currentProject: undefined,  // TODO: map after scene/project probe
    currentScene: undefined,     // TODO: map after scene/project probe
    availableProjects: [],       // TODO: map after probe run (client.getProjects())
    capturedAt: new Date().toISOString(),
    rawState: raw,
    flatState: flat,
  }
}
