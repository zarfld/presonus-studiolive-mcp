/**
 * Channel diagnostics — diagnoseChannel() and analyzeLineCheckStep().
 *
 * These functions combine mixer snapshot state + meter summary data to
 * produce structured diagnosis results for the MCP tools layer.
 *
 * Design principle:
 *   - These functions OBSERVE and REPORT only. They do NOT write to the mixer.
 *   - They do NOT know about riders, show plans, or artistic decisions.
 *   - Physical source routing is NEVER diagnosed (not_verifiable_with_current_adapter).
 *
 * @module diagnostics
 * @implements #78 REQ-F-DIAG-001 — diagnose_channel tool
 * @implements #74 REQ-F-LINECHK-001 — analyze_line_check_step tool
 * @architecture ARC-C-002 (#12): presonus-adapter package
 */
import type { MeterSummary } from '@presonus-mcp/domain'
import type { DiagnoseChannelResult, ChannelCheck } from '@presonus-mcp/domain'
import type { LineCheckStepResult, LineCheckChannelEntry, LineCheckSuspicion } from '@presonus-mcp/domain'
import type { MixerSnapshot } from './state-mapper.js'

// ---------------------------------------------------------------------------
// diagnoseChannel
// ---------------------------------------------------------------------------

/** Fader threshold below which the channel is considered "fader down" */
const FADER_DOWN_THRESHOLD = 0.05

/**
 * Diagnose a single channel by inspecting mute, fader, solo, meter, and gate state.
 *
 * @param snapshot  Current mixer snapshot (from clientManager.getSnapshot)
 * @param channelNumber  1-based physical channel number
 * @param meterSummary  Optional meter summary for signal-level check (null if unavailable)
 * @param expectedSource  Optional human label for the expected source
 */
export function diagnoseChannel(
  snapshot: MixerSnapshot,
  channelNumber: number,
  meterSummary: MeterSummary | null,
  expectedSource: string | undefined,
): DiagnoseChannelResult {
  const channelId = `line.ch${channelNumber}`
  const channel = snapshot.channels.find((c) => c.id === channelId)

  if (!channel) {
    return {
      status: 'problem',
      channel: channelNumber,
      checks: [],
      mostLikelyCauses: [`Channel ${channelNumber} not found in current mixer state`],
      safeNextSteps: ['Run discover_mixers to refresh device list', 'Try refresh_mixer_state'],
    }
  }

  const checks: ChannelCheck[] = []
  const causes: string[] = []
  const steps: string[] = []

  // ── Mute check ────────────────────────────────────────────────────────────
  const isMuted = channel.mute === true
  checks.push({ check: 'mute', result: isMuted ? 'muted' : 'not_muted' })
  if (isMuted) {
    causes.push('Channel is muted')
    steps.push('Check channel mute button in UC Surface or on the mixer')
  }

  // ── Fader check ───────────────────────────────────────────────────────────
  const faderLinear = channel.fader?.linear ?? 0
  const isFaderDown = faderLinear < FADER_DOWN_THRESHOLD
  const isAtUnity = faderLinear >= 0.7 && faderLinear <= 1.0
  checks.push({
    check: 'fader',
    result: isFaderDown ? 'fader_down' : isAtUnity ? 'at_unity' : `level_${Math.round(faderLinear * 100)}pct`,
  })
  if (isFaderDown) {
    causes.push('Fader is at minimum')
    steps.push('Check fader level in UC Surface')
  }

  // ── Solo check ────────────────────────────────────────────────────────────
  const isSoloed = channel.solo === true
  checks.push({ check: 'solo', result: isSoloed ? 'soloed' : 'not_soloed' })
  if (isSoloed) {
    causes.push('Channel is in solo — other channels may be silenced in monitors')
    steps.push('Check solo state; clear all solos if unintentional')
  }

  // ── Meter check ───────────────────────────────────────────────────────────
  if (meterSummary) {
    const isClipping = meterSummary.clippingChannels.includes(channelId)
    const isActive = meterSummary.activeChannels.includes(channelId) || meterSummary.hotChannels.includes(channelId)
    const isSilent = meterSummary.silentChannels.includes(channelId)
    const meterResult = isClipping ? 'clipping' : isActive ? 'active' : isSilent ? 'silent' : 'unknown'
    checks.push({ check: 'meter', result: meterResult })

    if (meterResult === 'silent' && !isMuted && !isFaderDown) {
      causes.push('No input signal detected (meter silent)')
      steps.push(
        `Confirm ${expectedSource ?? 'microphone/instrument'} is connected and active`,
        'Check preamp/input routing at the stagebox or panel',
      )
    }
    if (isClipping) {
      causes.push('Input signal is clipping — gain too high')
      steps.push('Reduce input gain on this channel')
    }
  } else {
    checks.push({ check: 'meter', result: 'unknown (no meter data available)' })
  }

  // ── Gate check (Fat Channel) ───────────────────────────────────────────────
  const gateEnabled = (channel.fatChannel as Record<string, unknown> | undefined)?.['gateEnabled'] as boolean | undefined
  if (gateEnabled === true) {
    checks.push({ check: 'gate', result: 'gate_enabled' })
    causes.push('Gate is active — signal may be cut below threshold')
    steps.push('Check gate threshold and attack settings; disable gate for initial line check')
  }

  const status = causes.length === 0 ? 'ok' : (isMuted || isFaderDown) ? 'problem' : 'warning'

  if (causes.length === 0) {
    steps.push('Channel appears healthy — confirm signal at source if still no sound')
  }

  return { status, channel: channelNumber, checks, mostLikelyCauses: causes, safeNextSteps: steps }
}

// ---------------------------------------------------------------------------
// analyzeLineCheckStep
// ---------------------------------------------------------------------------

/**
 * Analyze meter activity during a line check step.
 *
 * The agent says: "We are checking Kick on channel 1 now."
 * This function observes the meter summary and reports:
 *   - expectedActive channels that are silent (problem)
 *   - channels that are active but not expected or allowed (unexpected)
 *   - suspected patch swaps (expected silent + nearby unexpected active)
 *
 * @param snapshot  Current mixer snapshot
 * @param expectedActiveChannels  Agent-provided expected-active channel list (1-based)
 * @param allowedOtherChannels  Channels that may be active without being flagged
 * @param meterSummary  Time-windowed meter summary from PresonusMeterSummarizer
 */
export function analyzeLineCheckStep(
  snapshot: MixerSnapshot,
  expectedActiveChannels: { channel: number; name: string }[],
  allowedOtherChannels: { channel: number; name: string }[],
  meterSummary: MeterSummary,
): LineCheckStepResult {
  const activeSet = new Set([
    ...meterSummary.activeChannels,
    ...meterSummary.hotChannels,
    ...meterSummary.clippingChannels,
  ])
  const silentSet = new Set(meterSummary.silentChannels)

  const expectedIds = new Set(expectedActiveChannels.map((c) => `line.ch${c.channel}`))
  const allowedIds = new Set(allowedOtherChannels.map((c) => `line.ch${c.channel}`))

  // ── Classify expected channels ─────────────────────────────────────────────
  const expectedActive: LineCheckChannelEntry[] = expectedActiveChannels.map((c) => {
    const channelId = `line.ch${c.channel}`
    const isActive = activeSet.has(channelId)
    const isClipping = meterSummary.clippingChannels.includes(channelId)
    const signal: LineCheckChannelEntry['signal'] = isClipping ? 'clipping' : isActive ? 'active' : silentSet.has(channelId) ? 'silent' : 'unknown'
    return { channel: c.channel, name: c.name, signal }
  })

  // ── Find unexpected active channels ───────────────────────────────────────
  const unexpectedActive: LineCheckChannelEntry[] = []
  for (const channelId of activeSet) {
    if (expectedIds.has(channelId) || allowedIds.has(channelId)) continue
    const m = /^line\.ch(\d+)$/.exec(channelId)
    if (!m?.[1]) continue
    const ch = parseInt(m[1], 10)
    const chState = snapshot.channels.find((c) => c.id === channelId)
    const name = chState?.name ?? `Ch ${ch}`
    const signal: LineCheckChannelEntry['signal'] = meterSummary.clippingChannels.includes(channelId) ? 'clipping' : 'active'
    unexpectedActive.push({ channel: ch, name, signal })
  }

  // ── Detect swap suspicions ─────────────────────────────────────────────────
  const suspicions: LineCheckSuspicion[] = []
  for (const expected of expectedActive) {
    if (expected.signal !== 'silent') continue
    // Look for unexpected active channel near the expected (±2 channels) as swap evidence
    const nearby = unexpectedActive.filter(
      (u) => Math.abs(u.channel - expected.channel) <= 2,
    )
    for (const near of nearby) {
      suspicions.push({
        type: 'possible_patch_swap',
        expected: `${expected.name} on channel ${expected.channel}`,
        observed: `signal on channel ${near.channel} (${near.name})`,
        confidence: 'medium',
      })
    }
  }

  const hasProblem = expectedActive.some((c) => c.signal === 'silent' || c.signal === 'unknown')
  const hasWarning = unexpectedActive.length > 0
  const status = hasProblem ? 'problem' : hasWarning ? 'warning' : 'ok'

  return { status, expectedActive, unexpectedActive, suspicions }
}
