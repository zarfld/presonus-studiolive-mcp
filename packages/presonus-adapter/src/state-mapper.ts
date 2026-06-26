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
import type { MixerChannel, MixerIdentity, ChannelFatState, NormalizedEqBand, ChannelSendRouting, AuxSend, FxSend, SubgroupAssign, OutputPatchRouter, MixerCapabilities, AuxMix } from '@presonus-mcp/domain'
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
import { KNOWN_CHANNEL_KEY_SUFFIXES, KNOWN_FAT_KEY_SUFFIXES, KNOWN_GLOBAL_KEYS, KNOWN_SEND_ROUTING_KEY_SUFFIXES, OUTPUT_PATCH_KEY_PATTERNS } from './types.js'

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
  /** Output patch router state (probe-gated: source names are not_verifiable until probe) */
  outputPatch: OutputPatchRouter | undefined
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
 * Extract per-channel send routing from a FLAT state dict.
 *
 * @implements #31 REQ-F-ROUT-001: Expose per-channel AUX/FX/SUB send routing
 * @implements #30 REQ-NF-ROUT-001: parameterConfidence field on all routing data
 * @architecture #29 ADR-007: Routing domain read-only-first
 *
 * Returns undefined when no AUX send keys present (e.g. partial state after connect).
 *
 * OBSERVED keys on StudioLive 32SC fw 3.3.0.109659:
 *   line.chN.aux1–aux32          (normalized float 0–1, send level)
 *   line.chN.assign_aux1–32      (boolean, channel assigned to AUX bus)
 *   line.chN.FXA–FXH             (normalized float 0–1, FX bus send)
 *   line.chN.sub1–sub4           (0 or 1, subgroup assignment)
 *   line.chN.lr                  (0 or 1, main LR assignment)
 *
 * Send level de-normalization: UNVERIFIED — run probe diff-state while adjusting
 * AUX fader in UC Surface. parameterConfidence = 'guessed' until confirmed.
 */
export function extractChannelSendRouting(
  flat: Record<string, unknown>,
  prefix: string,
): ChannelSendRouting | undefined {
  const f = (suffix: string): unknown => flat[`${prefix}${suffix}`]
  const { AUX_SEND_PREFIX, AUX_ASSIGN_PREFIX, AUX_BUS_COUNT, SUB_PREFIX, SUB_BUS_COUNT, MAIN_LR } = KNOWN_SEND_ROUTING_KEY_SUFFIXES

  // Quick presence check — return undefined if no routing data in snapshot
  if (f(`${AUX_SEND_PREFIX}1`) === undefined) return undefined

  // AUX sends (aux1–aux32)
  const auxSends: AuxSend[] = []
  for (let i = 1; i <= AUX_BUS_COUNT; i++) {
    const sendLevel = f(`${AUX_SEND_PREFIX}${i}`)
    const assigned  = f(`${AUX_ASSIGN_PREFIX}${i}`)
    if (sendLevel === undefined && assigned === undefined) continue
    auxSends.push({
      auxBus: i,
      sendLevelLinear: typeof sendLevel === 'number' ? Math.max(0, Math.min(1, sendLevel)) : 0,
      assigned: typeof assigned === 'boolean' ? assigned
               : typeof assigned === 'number'  ? assigned !== 0
               : false,
    })
  }

  // FX sends (FXA–FXH)
  const fxSends: FxSend[] = []
  for (const bus of ['FXA', 'FXB', 'FXC', 'FXD', 'FXE', 'FXF', 'FXG', 'FXH'] as const) {
    const sendLevel = f(`.${bus}`)
    if (sendLevel !== undefined) {
      // assign_FXA key pattern: inferred (matches uppercase FX key convention), not probe-confirmed
      const assignRaw = f(`.assign_${bus}`)
      const assigned = assignRaw !== undefined
        ? (typeof assignRaw === 'boolean' ? assignRaw : (assignRaw as number) !== 0)
        : undefined
      fxSends.push({
        fxBus: bus,
        sendLevelLinear: typeof sendLevel === 'number' ? Math.max(0, Math.min(1, sendLevel)) : 0,
        ...(assigned !== undefined ? { assigned } : {}),
      })
    }
  }

  // Subgroup assigns (sub1–sub4)
  const subgroupAssigns: SubgroupAssign[] = []
  for (let i = 1; i <= SUB_BUS_COUNT; i++) {
    const sub = f(`${SUB_PREFIX}${i}`)
    if (sub !== undefined) {
      subgroupAssigns.push({
        subBus: i,
        assigned: typeof sub === 'boolean' ? sub
                : typeof sub === 'number'  ? sub !== 0
                : false,
      })
    }
  }

  // Main LR assign
  const lrRaw = f(MAIN_LR)
  const mainLrAssigned = lrRaw !== undefined
    ? (typeof lrRaw === 'boolean' ? lrRaw : typeof lrRaw === 'number' ? lrRaw !== 0 : undefined)
    : undefined

  return { auxSends, fxSends, subgroupAssigns, mainLrAssigned, parameterConfidence: 'inferred' }
}

/**
 * Extract output patch router state from a FLAT state dict.
 *
 * @implements #37 REQ-F-ROUT-007: Expose output patch as MCP resource
 * @implements #30 REQ-NF-ROUT-001: confidence field — not_verifiable until probe
 * @architecture #29 ADR-007
 *
 * Formula: sourceIndex = Math.round(value × range.max)
 * Source name mapping: NOT VERIFIED — probe diff-state required.
 *
 * OBSERVED on 32SC fw 3.3.0.109659:
 *   outputpatchrouter.mix1_src.value = 0 (default = line ch1)
 *   outputpatchrouter.mix1_src.range.max = 27 (28 sources: 0–27)
 */
export function extractOutputPatchRouter(
  flat: Record<string, unknown>,
  deviceId: string,
): OutputPatchRouter | undefined {
  const { ANALOG_PREFIX, AVB_PREFIX, ANALOG_COUNT, AVB_COUNT } = OUTPUT_PATCH_KEY_PATTERNS

  // Quick presence check
  if (flat[`${ANALOG_PREFIX}1_src.value`] === undefined) return undefined

  const analogOutputs: import('@presonus-mcp/domain').OutputPatchAssign[] = []
  for (let i = 1; i <= ANALOG_COUNT; i++) {
    const value   = flat[`${ANALOG_PREFIX}${i}_src.value`]
    const maxVal  = flat[`${ANALOG_PREFIX}${i}_src.range.max`]
    if (value === undefined) continue
    const max = typeof maxVal === 'number' ? maxVal : 27
    analogOutputs.push({
      outputIndex: i,
      sourceIndex: typeof value === 'number' ? Math.round(value * max) : 0,
      sourceName: null,
      confidence: 'not_verifiable_with_current_adapter',
    })
  }

  const avbOutputs: import('@presonus-mcp/domain').OutputPatchAssign[] = []
  for (let i = 1; i <= AVB_COUNT; i++) {
    const value  = flat[`${AVB_PREFIX}${i}_src.value`]
    const maxVal = flat[`${AVB_PREFIX}${i}_src.range.max`]
    if (value === undefined) continue
    const max = typeof maxVal === 'number' ? maxVal : 27
    avbOutputs.push({
      outputIndex: i,
      sourceIndex: typeof value === 'number' ? Math.round(value * max) : 0,
      sourceName: null,
      confidence: 'not_verifiable_with_current_adapter',
    })
  }

  if (analogOutputs.length === 0) return undefined

  return {
    deviceId,
    analogOutputs,
    avbOutputs: avbOutputs.length > 0 ? avbOutputs : undefined,
    capturedAt: new Date().toISOString(),
    globalConfidence: 'not_verifiable_with_current_adapter',
  }
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
    // Exclude KNOWN_CHANNEL_KEY_SUFFIXES, KNOWN_FAT_KEY_SUFFIXES, and send routing keys
    // (routing keys are normalized into channel.sendRouting instead).
    const sendRoutingExcluded = (() => {
      const s = new Set<string>()
      const { AUX_SEND_PREFIX, AUX_ASSIGN_PREFIX, AUX_BUS_COUNT, SUB_PREFIX, SUB_BUS_COUNT, MAIN_LR } = KNOWN_SEND_ROUTING_KEY_SUFFIXES
      for (let i = 1; i <= AUX_BUS_COUNT; i++) {
        s.add(`${AUX_SEND_PREFIX}${i}`)
        s.add(`${AUX_ASSIGN_PREFIX}${i}`)
      }
      for (let i = 1; i <= SUB_BUS_COUNT; i++) s.add(`${SUB_PREFIX}${i}`)
      for (const b of ['A','B','C','D','E','F','G','H']) s.add(`.FX${b}`)
      s.add(MAIN_LR)
      return s
    })()
    const knownSuffixValues = new Set<string>([
      ...Object.values(KNOWN_CHANNEL_KEY_SUFFIXES),
      ...Object.values(KNOWN_FAT_KEY_SUFFIXES),
      ...sendRoutingExcluded,
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
      sendRouting: extractChannelSendRouting(flat, prefix),
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
    outputPatch: extractOutputPatchRouter(flat, resolvedIdentity.deviceId),
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
    outputPatch: extractOutputPatchRouter(flat, resolvedIdentity.deviceId),
  }
}

// ---------------------------------------------------------------------------
// Known model capability table
// Source: PreSonus StudioLive Series III hardware specifications.
// Values verified against published product specs (2026-06-24).
// ---------------------------------------------------------------------------
interface ModelCapTable {
  lineInputs: number
  auxMixes: number
  subgroups: number
  fxBuses: number
  mainOutputs: boolean
  fatChannel: boolean
  avbStagebox: boolean
}

const MODEL_CAPABILITY_TABLE: Record<string, ModelCapTable> = {
  'StudioLive 32SC': { lineInputs: 32, auxMixes: 16, subgroups: 4, fxBuses: 4, mainOutputs: true, fatChannel: true, avbStagebox: true },
  'StudioLive 32':   { lineInputs: 32, auxMixes: 16, subgroups: 4, fxBuses: 4, mainOutputs: true, fatChannel: true, avbStagebox: true },
  'StudioLive 32R':  { lineInputs: 32, auxMixes: 16, subgroups: 4, fxBuses: 4, mainOutputs: true, fatChannel: true, avbStagebox: true },
  'StudioLive 24':   { lineInputs: 24, auxMixes: 13, subgroups: 2, fxBuses: 4, mainOutputs: true, fatChannel: true, avbStagebox: true },
  'StudioLive 16':   { lineInputs: 16, auxMixes: 10, subgroups: 2, fxBuses: 4, mainOutputs: true, fatChannel: true, avbStagebox: false },
  'StudioLive 16R':  { lineInputs: 16, auxMixes: 10, subgroups: 2, fxBuses: 4, mainOutputs: true, fatChannel: true, avbStagebox: false },
}

/**
 * Derive mixer capabilities from known model table + live flatState.
 *
 * Strategy (hybrid):
 *   1. Look up model in known table → use as floor
 *   2. Count live line.chN.mute keys in flatState → use if higher than table floor
 *   3. For unknown models → infer entirely from flatState key count (conservative defaults)
 *
 * @param model - Mixer model string from discovery (e.g. "StudioLive 32SC")
 * @param flatState - Flattened dot-notation state dict (may be empty {} if not yet connected)
 */
export function deriveCapabilities(
  model: string,
  flatState: Record<string, unknown>,
): ModelCapTable {
  // Count live line channels from flatState
  const liveLineChannels = new Set<number>()
  for (const key of Object.keys(flatState)) {
    const m = /^line\.ch(\d+)\.mute$/.exec(key)
    if (m?.[1]) liveLineChannels.add(parseInt(m[1], 10))
  }
  const liveCount = liveLineChannels.size

  const tableEntry = MODEL_CAPABILITY_TABLE[model]

  if (tableEntry) {
    return {
      ...tableEntry,
      // Use live count if it exceeds table floor (future firmware may unlock more)
      lineInputs: Math.max(tableEntry.lineInputs, liveCount),
    }
  }

  // Unknown model — infer conservatively from live state
  return {
    lineInputs: liveCount,
    auxMixes: 0,
    subgroups: 0,
    fxBuses: 0,
    mainOutputs: false,
    fatChannel: false,
    avbStagebox: false,
  }
}

// Alias for external consumers that import the typed return
export type { ModelCapTable as MixerCapTable }

// ---------------------------------------------------------------------------
// Aux mix extraction
// ---------------------------------------------------------------------------

/**
 * Extract all aux mix state from a flattened state dict.
 *
 * Key patterns (OBSERVED on 32SC fw 3.3.0.109659):
 *   line.chN.auxM     — aux send level from LINE channel N to AUX mix M (0.0–1.0 normalized)
 *   aux.chM.mute      — aux mix M master mute (boolean)
 *   aux.chM.volume    — aux mix M master level (0–100 RAW scale from mixer protocol)
 *                       IMPORTANT: this is NOT 0–1. Divide by 100 to get normalized 0–1.
 *                       Observed: 51.37 (ch1 below unity), 74.8 (ch4 ≈ unity), 0 (ch11 off)
 *   aux.chM.username  — aux mix M user name (string)
 *
 * Pre/Post fader state is NOT determinable from current state keys → always 'unknown'.
 *
 * @param flat  Flattened dot-notation state dict from flattenFeatherbearState()
 */
export function extractAuxMixes(flat: Record<string, unknown>): AuxMix[] {
  // ── Collect aux mix master state ─────────────────────────────────────────
  const auxMasterMap = new Map<number, { mute: boolean; volume: number; name: string }>()
  for (const [key, value] of Object.entries(flat)) {
    const masterMuteMatch = /^aux\.ch(\d+)\.mute$/.exec(key)
    if (masterMuteMatch) {
      const m = parseInt(masterMuteMatch[1]!, 10)
      const existing = auxMasterMap.get(m) ?? { mute: false, volume: 0.75, name: `Aux ${m}` }
      auxMasterMap.set(m, { ...existing, mute: Boolean(value) })
    }
    const masterVolMatch = /^aux\.ch(\d+)\.volume$/.exec(key)
    if (masterVolMatch) {
      const m = parseInt(masterVolMatch[1]!, 10)
      const existing = auxMasterMap.get(m) ?? { mute: false, volume: 0.75, name: `Aux ${m}` }
      // OBSERVED: aux.chM.volume is a 0–100 raw scale from the mixer protocol (NOT 0–1).
      // Divide by 100 to normalize to the 0–1 range expected by AuxMixSchema.masterLevel.
      // e.g. 51.37 → 0.514 (below unity), 74.8 → 0.748 (≈ unity / 0 dB), 0 → 0.0 (fader down)
      auxMasterMap.set(m, { ...existing, volume: typeof value === 'number' ? Math.max(0, Math.min(1, value / 100)) : 0.75 })
    }
    const masterNameMatch = /^aux\.ch(\d+)\.username$/.exec(key)
    if (masterNameMatch) {
      const m = parseInt(masterNameMatch[1]!, 10)
      const existing = auxMasterMap.get(m) ?? { mute: false, volume: 0.75, name: `Aux ${m}` }
      auxMasterMap.set(m, { ...existing, name: typeof value === 'string' ? value : `Aux ${m}` })
    }
  }

  // ── Collect aux sends ─────────────────────────────────────────────────────
  const sendsMap = new Map<number, AuxMix['sends']>()
  // OBSERVED: key pattern is `line.chN.auxM` (e.g. line.ch1.aux3), NOT line.ch1.aux.ch3
  // Extended to: return.chN.auxM, fxreturn.chN.auxM, talkback.chN.auxM (#40 REQ-F-ROUT-010)
  const SEND_KEY_RE = /^(line|return|fxreturn|talkback)\.ch(\d+)\.aux(\d+)$/
  for (const [key, value] of Object.entries(flat)) {
    const sendMatch = SEND_KEY_RE.exec(key)
    if (!sendMatch) continue
    const chanType = sendMatch[1]!
    const srcCh = parseInt(sendMatch[2]!, 10)
    const auxMixNum = parseInt(sendMatch[3]!, 10)
    const level = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : 0
    const levelDb = level > 0 ? 20 * Math.log10(level) : -Infinity

    const channelPrefix = `${chanType}.ch${srcCh}`

    // Resolve channel name from flatState
    const chName = (flat[`${channelPrefix}.username`] as string | undefined)?.trim()
      ?? (flat[`${channelPrefix}.name`] as string | undefined)
      ?? (chanType === 'fxreturn' ? `FX Ret ${srcCh}`
        : chanType === 'talkback' ? `Talkback`
        : chanType === 'return'   ? `Return ${srcCh}`
        : `Ch ${srcCh}`)

    // Muted = channel NOT assigned to this AUX bus (assign_auxN = 0/false)
    // OBSERVED: assign_auxN is boolean or integer 0/1 in state
    const assignRaw = flat[`${channelPrefix}.assign_aux${auxMixNum}`]
    const isAssigned = assignRaw === undefined
      ? true  // default: assume assigned if key absent (safer than assuming muted)
      : (typeof assignRaw === 'boolean' ? assignRaw : (assignRaw as number) !== 0)
    const sendMuted = !isAssigned

    const send: AuxMix['sends'][number] = {
      fromChannel: srcCh,
      fromChannelName: chName,
      auxMixNumber: auxMixNum,
      level,
      levelDb: isFinite(levelDb) ? levelDb : -Infinity,
      prePost: 'unknown',  // Not determinable from current state keys
      muted: sendMuted,
    }

    const existing = sendsMap.get(auxMixNum) ?? []
    sendsMap.set(auxMixNum, [...existing, send])
  }

  // ── Merge into AuxMix[] ───────────────────────────────────────────────────
  // Collect all aux mix numbers from both maps
  const allMixNumbers = new Set([...auxMasterMap.keys(), ...sendsMap.keys()])

  return Array.from(allMixNumbers)
    .sort((a, b) => a - b)
    .map((m) => {
      const master = auxMasterMap.get(m) ?? { mute: false, volume: 0.75, name: `Aux ${m}` }
      const sends = (sendsMap.get(m) ?? [] as AuxMix['sends']).sort((a, b) => a.fromChannel - b.fromChannel)
      return {
        auxMixNumber: m,
        name: master.name,
        masterLevel: master.volume,
        masterMuted: master.mute,
        sends,
      }
    })
}

// ---------------------------------------------------------------------------
// FlexMix bus topology (REQ-F-FLEXMIX-001 #84)
// ---------------------------------------------------------------------------

/**
 * Operational mode of a FlexMix bus.
 *
 * Decoded from aux.chN.busmode.value using formula:
 *   modeIndex = Math.round(busmodeRaw × (strings - 1))  where strings=8, max=7
 *
 * OBSERVED on StudioLive 32SC fw 3.3.0.109659 (2026-06-26 HIL capture):
 *   value=0.0 → index=0 → AUX      (chnum "Ax N")
 *   value=0.5 → index=4 → SUBGROUP (chnum "Sb N")
 *   value=1.0 → index=7 → MATRIX   (chnum "Mx N")
 */
export type FlexMixBusMode = 'AUX' | 'SUBGROUP' | 'MATRIX' | 'FXGROUP' | 'UNKNOWN'

/** Descriptor for a single FlexMix bus. */
export interface FlexMixBus {
  /** 1-based FlexMix bus number (matches aux.chN key index). */
  busIndex: number
  /** Operational mode derived from aux.chN.busmode.value. */
  mode: FlexMixBusMode
  /** User-assigned bus name (aux.chN.username). */
  username: string
  /** Mixer short label ("Ax N" / "Sb N" / "Mx N") from aux.chN.chnum. */
  chnum: string
  /** Raw busmode float as stored in protocol (0.0, 0.5, 1.0, etc.). */
  busmodeRaw: number
  /**
   * Source channels explicitly assigned to this bus.
   *
   * - **null** when mode is AUX: all channels are auto-assigned; assign_auxN=true is NOT user intent.
   * - **number[]** when mode is SUBGROUP or MATRIX: sparse list of channels where assign_auxN=true.
   */
  assignedChannels: number[] | null
  /** Whether this bus is stereo-linked (aux.chN.panlinkstate !== 0). */
  isStereoLinked: boolean
}

/** Result of FlexMix bus topology extraction. */
export interface FlexMixTopology {
  buses: FlexMixBus[]
  /** Always 'high' — fully Layer A observable, no probe session required. */
  confidence: 'high'
}

/** Number of busmode string options on StudioLive III (8 = indices 0–7). */
const BUSMODE_STRINGS = 8

function decodeBusMode(raw: number): FlexMixBusMode {
  // modeIndex = Math.round(raw × (strings - 1))
  // 0.0 × 7 = 0   → AUX
  // 0.5 × 7 = 3.5 → Math.round → 4 → SUBGROUP
  // 1.0 × 7 = 7   → MATRIX
  const index = Math.round(raw * (BUSMODE_STRINGS - 1))
  switch (index) {
    case 0: return 'AUX'
    case 4: return 'SUBGROUP'
    case 7: return 'MATRIX'
    default: return 'UNKNOWN'
  }
}

/**
 * Extract FlexMix bus topology from a flattened state dict.
 *
 * @implements #84 REQ-F-FLEXMIX-001: FlexMix bus mode classification and per-channel routing extraction
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/84
 *
 * Key semantic distinction:
 *   AUX mode     → assignedChannels = null  (auto-assigned; value is mixer default, not user routing)
 *   SUBGROUP/MATRIX → assignedChannels = number[]  (explicit user intent; sparse)
 *
 * OBSERVED on StudioLive 32SC fw 3.3.0.109659 (2026-06-26 HIL capture):
 *   aux.ch2 "Sub 2" (SUBGROUP) → assigned ch10, ch11, ch12, ch14, ch15
 *   aux.ch3 "Sub 3" (SUBGROUP) → assigned ch4, ch5, ch6, ch7
 *   aux.ch6 "Mtx 6" (MATRIX)   → no send-level assignment (matrix routing)
 *   aux.ch1,4,5,7,8 (AUX)      → null (auto)
 *
 * @param flat  Flattened dot-notation state from flattenFeatherbearState()
 */
export function extractFlexMixBusTopology(flat: Record<string, unknown>): FlexMixTopology {
  // ── Discover all FlexMix bus indices from busmode.value keys ──────────────
  const busIndices = new Set<number>()
  for (const key of Object.keys(flat)) {
    const m = /^aux\.ch(\d+)\.busmode\.value$/.exec(key)
    if (m) busIndices.add(parseInt(m[1]!, 10))
  }

  if (busIndices.size === 0) {
    return { buses: [], confidence: 'high' }
  }

  // ── Pre-collect explicit channel assignments for SUBGROUP/MATRIX buses ────
  // Maps auxBusIndex → Set of source channel numbers where assign_auxN = true
  const assignedByBus = new Map<number, Set<number>>()
  const SOURCE_ASSIGN_RE = /^(?:line|return|fxreturn|talkback)\.ch(\d+)\.assign_aux(\d+)$/
  for (const [key, value] of Object.entries(flat)) {
    const m = SOURCE_ASSIGN_RE.exec(key)
    if (!m) continue
    const srcCh = parseInt(m[1]!, 10)
    const auxN  = parseInt(m[2]!, 10)
    const isAssigned = typeof value === 'boolean' ? value : (value as number) !== 0
    if (isAssigned) {
      const set = assignedByBus.get(auxN) ?? new Set<number>()
      set.add(srcCh)
      assignedByBus.set(auxN, set)
    }
  }

  // ── Build FlexMixBus descriptors ──────────────────────────────────────────
  const buses: FlexMixBus[] = Array.from(busIndices)
    .sort((a, b) => a - b)
    .map((n) => {
      const rawMode = flat[`aux.ch${n}.busmode.value`]
      const busmodeRaw = typeof rawMode === 'number' ? rawMode : 0
      const mode       = decodeBusMode(busmodeRaw)
      const username   = (flat[`aux.ch${n}.username`] as string | undefined) ?? `Aux ${n}`
      const chnum      = (flat[`aux.ch${n}.chnum`]    as string | undefined) ?? `Ax ${n}`
      const panRaw     = flat[`aux.ch${n}.panlinkstate`]
      const isStereoLinked = panRaw !== undefined
        ? (typeof panRaw === 'boolean' ? panRaw : (panRaw as number) !== 0)
        : false

      // AUX mode: return null — auto-assignment is NOT user routing intent
      // SUBGROUP/MATRIX: return sorted array of explicitly assigned channels
      const assignedChannels: number[] | null = mode === 'AUX'
        ? null
        : Array.from(assignedByBus.get(n) ?? []).sort((a, b) => a - b)

      return { busIndex: n, mode, username, chnum, busmodeRaw, assignedChannels, isStereoLinked }
    })

  return { buses, confidence: 'high' }
}

// ---------------------------------------------------------------------------
// Fixed hardware subgroup buses (REQ-F-FIXEDSUB-001 #85)
// ---------------------------------------------------------------------------

/** Descriptor for a single fixed hardware subgroup bus (Sub A/B/C/D). */
export interface FixedSubGroup {
  /** 1-based bus number: 1=Sub A, 2=Sub B, 3=Sub C, 4=Sub D (matches sub.chN index). */
  busIndex: number
  /** User-assigned name (sub.chN.username). */
  username: string
  /** Mixer short label ("Sb A", "Sb B", etc.) from sub.chN.chnum. */
  chnum: string
  /** Master fader level, normalized 0–1 from 0–100 raw scale. */
  volume: number
  /** Master mute state. */
  muted: boolean
  /** Whether this bus is stereolinked (sub.chN.link !== 0). */
  stereoLinked: boolean
  /**
   * Stereolink role:
   *   true  = this is the stereolink MASTER (sub.chN.linkmaster = 1)
   *   false = slave or not linked
   */
  isLinkMaster: boolean
  /** busIndex of the stereolink partner, or null when not stereolinked. */
  stereoPartnerIndex: number | null
  /**
   * Source channels explicitly assigned to this bus (line.chM.subN = 1).
   *
   * For stereolinked pairs, both master and slave have the same assignedChannels
   * (the protocol sets both subN flags when a channel is assigned to the pair).
   */
  assignedChannels: number[]
}

/** Result of fixed subgroup topology extraction. */
export interface FixedSubGroupTopology {
  buses: FixedSubGroup[]
  /** Stereolinked bus pairs. masterIndex/slaveIndex are busIndex values. */
  stereoPairs: Array<{ masterIndex: number; slaveIndex: number }>
  /** Always 'high' — fully Layer A observable, no probe session required. */
  confidence: 'high'
}

/** StudioLive III always has exactly 4 fixed hardware sub buses. */
const FIXED_SUB_BUS_COUNT = 4

/**
 * Extract fixed hardware subgroup bus topology from a flattened state dict.
 *
 * @implements #85 REQ-F-FIXEDSUB-001: Fixed subgroup bus routing extraction with stereolink detection
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/85
 *
 * Fixed sub buses differ from FlexMix buses:
 *   - Always SubGroup mode (no busmode enum; the "sub" prefix IS the type)
 *   - line.chM.subN = 1 is always explicit user intent (no AUX auto-assignment)
 *   - Stereolinked pairs (e.g., Sub C+D) are detected via sub.chN.link + sub.chN.linkmaster
 *
 * OBSERVED on StudioLive 32SC fw 3.3.0.109659 (2026-06-26 HIL capture):
 *   sub.ch1 "Sub A" — mono; assigned ch3, ch4
 *   sub.ch2 "Sub B" — mono; assigned ch11, ch16
 *   sub.ch3 "Sub C" — stereo MASTER (link=1, linkmaster=1); assigned ch5, ch6, ch7, ch8
 *   sub.ch4 "Sub D" — stereo SLAVE  (link=1, linkmaster=0); assigned ch5, ch6, ch7, ch8
 *
 * @param flat  Flattened dot-notation state from flattenFeatherbearState()
 */
export function extractFixedSubGroups(flat: Record<string, unknown>): FixedSubGroupTopology {
  const SUB_LABELS = ['A', 'B', 'C', 'D'] as const

  // ── Pre-collect source channel assignments for each sub bus ───────────────
  // channelSets[n-1] = Set of line channel numbers with subN = 1
  const channelSets: Array<Set<number>> = Array.from({ length: FIXED_SUB_BUS_COUNT }, () => new Set<number>())
  const SUB_ASSIGN_RE = /^(?:line|return|fxreturn|talkback)\.ch(\d+)\.sub([1-4])$/
  for (const [key, value] of Object.entries(flat)) {
    const m = SUB_ASSIGN_RE.exec(key)
    if (!m) continue
    const srcCh = parseInt(m[1]!, 10)
    const subN  = parseInt(m[2]!, 10)  // 1-based
    const isAssigned = typeof value === 'boolean' ? value
      : typeof value === 'number' ? value !== 0
      : false
    if (isAssigned) channelSets[subN - 1]!.add(srcCh)
  }

  // ── Build FixedSubGroup descriptors ───────────────────────────────────────
  const buses: FixedSubGroup[] = []
  for (let n = 1; n <= FIXED_SUB_BUS_COUNT; n++) {
    const prefix = `sub.ch${n}`
    const label  = SUB_LABELS[n - 1]!

    // Skip if no state keys (e.g., mixer model with fewer sub buses)
    if (flat[`${prefix}.username`] === undefined && flat[`${prefix}.chnum`] === undefined) continue

    const username = (flat[`${prefix}.username`] as string | undefined) ?? `Sub ${label}`
    const chnum    = (flat[`${prefix}.chnum`]    as string | undefined) ?? `Sb ${label}`

    const rawVol = flat[`${prefix}.volume`]
    const volume = typeof rawVol === 'number'
      ? Math.max(0, Math.min(1, rawVol / 100))  // 0–100 raw → 0–1 normalized (same scale as aux)
      : 0.75

    const mutedRaw = flat[`${prefix}.mute`]
    const muted = typeof mutedRaw === 'boolean' ? mutedRaw
      : typeof mutedRaw === 'number' ? mutedRaw !== 0
      : false

    const linkRaw   = flat[`${prefix}.link`]
    const masterRaw = flat[`${prefix}.linkmaster`]
    const stereoLinked = typeof linkRaw === 'number' ? linkRaw !== 0
      : typeof linkRaw === 'boolean' ? linkRaw : false
    const isLinkMaster = stereoLinked && (
      typeof masterRaw === 'number' ? masterRaw !== 0
      : typeof masterRaw === 'boolean' ? masterRaw : false
    )

    buses.push({
      busIndex: n,
      username,
      chnum,
      volume,
      muted,
      stereoLinked,
      isLinkMaster,
      stereoPartnerIndex: null,  // set below after all buses are built
      assignedChannels: Array.from(channelSets[n - 1]!).sort((a, b) => a - b),
    })
  }

  // ── Detect stereolink pairs and set stereoPartnerIndex ────────────────────
  const stereoPairs: FixedSubGroupTopology['stereoPairs'] = []
  for (const master of buses) {
    if (!master.stereoLinked || !master.isLinkMaster) continue
    // Find the adjacent slave bus (must differ by exactly 1 index)
    const slave = buses.find(
      (b) => b.stereoLinked && !b.isLinkMaster && Math.abs(b.busIndex - master.busIndex) === 1,
    )
    if (slave) {
      master.stereoPartnerIndex = slave.busIndex
      slave.stereoPartnerIndex  = master.busIndex
      stereoPairs.push({ masterIndex: master.busIndex, slaveIndex: slave.busIndex })
    }
  }

  return { buses, stereoPairs, confidence: 'high' }
}
