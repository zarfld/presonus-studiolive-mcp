/**
 * MCP tool registrations — read-only analysis tools only in default config.
 *
 * @module tools
 * @implements #22 REQ-NF-002: Zero write tools in default configuration
 * @implements #15 REQ-F-001: Auto-discover mixers (discover_mixers tool)
 * @architecture #14 ARC-C-004: presonus-mcp-server package
 * @architecture #10 ADR-005: Read-only-first policy — write tools NOT registered in MVP
 * @architecture ADR-006: Semi-automated write tools (propose_eq_change + apply_change_set)
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/22
 */
import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { discoverMixers, diagnoseChannel, analyzeLineCheckStep, extractAuxMixes, extractFixedSubGroups, extractInputRouting, extractAvbStreamRouting, type PresonusClientManager } from '@presonus-mcp/adapter'
import {
  eqGainDbToNormalized,
  eqFreqHzToNormalized,
  eqQToNormalized,
  normalizedToEqGainDb,
  normalizedToEqFreqHz,
  normalizedToEqQ,
  compThresholdDbToNormalized,
  compMakeupDbToNormalized,
  compRatioXToNormalized,
  attackMsToNormalized,
  releaseMsToNormalized,
  gateThresholdDbToNormalized,
  gateRangeDbToNormalized,
  limiterThresholdDbToNormalized,
  normalizedToCompThresholdDb,
  normalizedToCompMakeupDb,
  normalizedToCompRatioX,
  normalizedToAttackMs,
  normalizedToReleaseMs,
  normalizedToGateThresholdDb,
  normalizedToGateRangeDb,
  normalizedToLimiterThresholdDb,
  type ProposedChangeSet,
  type NoSignalDiagnosis,
  type PatchSwapDetection,
  type RoutingValidationReport,
  type AuxMixAuditIssue,
  type AuxMixAuditResult,
  HOT_SEND_THRESHOLD_DB,
  type InputListEntry,
  type PatchSheetRow,
  type ChannelFatState,
} from '@presonus-mcp/domain'

export interface ToolsConfig {
  /** When false (default): only read-only tools registered. Write tools: not registered. */
  writeEnabled: boolean
}

// ---------------------------------------------------------------------------
// In-memory probe session registry (Phase 7 — ADR-008 Layer B promotion)
// Keys: probeId (UUID), Values: { deviceId, kind, baselineFlat, capturedAt, expiresAt }
// ---------------------------------------------------------------------------
const PROBE_TTL_MS = 5 * 60_000  // 5 minutes (probe sessions need time for operator interaction)

interface ProbeSession {
  deviceId: string
  kind: string
  baselineFlat: Record<string, unknown>
  capturedAt: string
  expiresAt: number
}

const probeSessions = new Map<string, ProbeSession>()

function pruneExpiredProbeSessions(): void {
  const now = Date.now()
  for (const [id, session] of probeSessions) {
    if (session.expiresAt <= now) probeSessions.delete(id)
  }
}

// ---------------------------------------------------------------------------
// In-memory changeSet registry (ADR-006)
// Keys: changeSetId, Values: { set, expiresAt (unix ms) }
// ---------------------------------------------------------------------------
const CHANGESET_TTL_MS = 60_000
const changeSets = new Map<string, { set: ProposedChangeSet; expiresAt: number }>()

function pruneExpiredChangeSets(): void {
  const now = Date.now()
  for (const [id, entry] of changeSets) {
    if (entry.expiresAt <= now) changeSets.delete(id)
  }
}

export function registerTools(
  server: McpServer,
  clientManager: PresonusClientManager,
  config: ToolsConfig,
): void {
  // ─── discover_mixers ──────────────────────────────────────────────────────
  server.tool(
    'discover_mixers',
    'Trigger discovery of StudioLive III mixers on the local network and return their identities.',
    { timeoutMs: z.number().int().positive().optional() },
    async ({ timeoutMs }) => {
      const result = await discoverMixers({ timeoutMs: timeoutMs ?? 5000 })
      // Connect to newly found devices
      for (const device of result.devices) {
        if (!clientManager.getConnectedDeviceIds().includes(device.deviceId)) {
          clientManager.connect(device).catch(() => undefined)
        }
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result.devices, null, 2),
        }],
      }
    },
  )

  // ─── refresh_mixer_state ──────────────────────────────────────────────────
  server.tool(
    'refresh_mixer_state',
    'Reconnect to a mixer and refresh its state cache.',
    { deviceId: z.string() },
    async ({ deviceId }) => {
      const identity = clientManager.getIdentity(deviceId)
      if (!identity) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, reason: 'Device not found' }) }],
          isError: true,
        }
      }
      await clientManager.disconnect(deviceId)
      await clientManager.connect(identity)
      const snapshot = clientManager.getSnapshot(deviceId)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            channelCount: snapshot?.channels.length ?? 0,
            capturedAt: snapshot?.capturedAt,
          }),
        }],
      }
    },
  )

  // ─── validate_mixer_identity ──────────────────────────────────────────────
  server.tool(
    'validate_mixer_identity',
    'Verify that a connected mixer matches expected serial number and role.',
    {
      deviceId: z.string(),
      expectedSerial: z.string().optional(),
      expectedRole: z.enum(['FOH', 'STAGEBOX', 'MONITOR', 'UNKNOWN']).optional(),
    },
    async ({ deviceId, expectedSerial, expectedRole }) => {
      const identity = clientManager.getIdentity(deviceId)
      const reasons: string[] = []

      if (!identity) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ valid: false, reasons: ['Device not connected'] }),
          }],
        }
      }

      if (expectedSerial && identity.serial !== expectedSerial) {
        reasons.push(`Serial mismatch: expected ${expectedSerial}, got ${identity.serial ?? '(unknown)'}`)
      }
      if (expectedRole && identity.role !== expectedRole) {
        reasons.push(`Role mismatch: expected ${expectedRole}, got ${identity.role}`)
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ valid: reasons.length === 0, reasons }),
        }],
      }
    },
  )

  // ─── get_routing_graph ───────────────────────────────────────────────────
  // @implements #32 REQ-F-ROUT-002
  server.tool(
    'get_routing_graph',
    'Return the consolidated routing state for a mixer: per-channel AUX/FX/SUB sends and output patch routing. Includes confidence fields (not_verifiable_with_current_adapter for unprobed items). Read-only — no mixer changes.',
    { deviceId: z.string() },
    async ({ deviceId }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      // REQ-F-READ-005e (#86): include fxreturn, sub, fxbus channels in addition to line channels
      const fxReturnChannels = Object.entries(snapshot.flatState)
        .filter(([k]) => /^fxreturn\.ch\d+\.username$/.test(k))
        .map(([k, v]) => {
          const chId = k.replace('.username', '')
          return {
            channelId: chId,
            channelType: 'fxreturn',
            channelName: String(v ?? ''),
            sendRouting: {},
          }
        })
      const subChannels = Object.entries(snapshot.flatState)
        .filter(([k]) => /^sub\.ch\d+\.username$/.test(k))
        .map(([k, v]) => {
          const chId = k.replace('.username', '')
          return {
            channelId: chId,
            channelType: 'sub',
            channelName: String(v ?? ''),
            sendRouting: {},
          }
        })
      const routing = {
        deviceId,
        capturedAt: snapshot.capturedAt,
        isStale: snapshot.isStale,
        channelCount: snapshot.channels.length,
        channels: [
          ...snapshot.channels.map((ch) => ({
            channelId: ch.id,
            channelType: 'line',
            channelName: ch.name,
            sendRouting: ch.sendRouting,
          })),
          ...fxReturnChannels,
          ...subChannels,
        ],
        outputPatch: snapshot.outputPatch ?? null,
        globalConfidence: snapshot.outputPatch?.globalConfidence ?? 'not_verifiable_with_current_adapter',
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(routing, null, 2) }] }
    },
  )

  // ─── validate_input_routing ───────────────────────────────────────────────
  // @implements #33 REQ-F-ROUT-003
  server.tool(
    'validate_input_routing',
    'Validate expected input routes against actual mixer state. Checks meter signal, mute, and channel name per expected route. Physical source routing is always not_verifiable_with_current_adapter (software cannot see cable connections).',
    {
      deviceId: z.string(),
      expectedRoutes: z.array(z.object({
        channelId: z.string().describe('Channel ID, e.g. "line.ch7"'),
        signalName: z.string().describe('Expected signal on this channel, e.g. "Lead Vox"'),
      })).describe('List of expected channel→signal assignments'),
    },
    async ({ deviceId, expectedRoutes }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      const summarizer = clientManager.getSummarizer(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected' }) }], isError: true }
      }
      const meterSummary = summarizer?.getSummary(10 as const)
      const silentSet  = new Set(meterSummary?.silentChannels ?? [])
      const activeSet  = new Set(meterSummary?.activeChannels ?? [])
      const clippingSet = new Set(meterSummary?.clippingChannels ?? [])

      const routes: RoutingValidationReport['routes'] = expectedRoutes.map(({ channelId, signalName }) => {
        const ch = snapshot.channels.find((c) => c.id === channelId)
        const meterResult = !meterSummary ? 'unknown'
          : clippingSet.has(channelId) ? 'clipping'
          : activeSet.has(channelId) ? 'active'
          : silentSet.has(channelId) ? 'silent'
          : 'unknown'

        let status: RoutingValidationReport['routes'][0]['status']
        if (meterResult === 'silent') status = 'missing'
        else if (meterResult === 'active' || meterResult === 'clipping') {
          // Check if muted
          if (ch?.mute) status = 'ambiguous'
          else status = 'ok'
        } else status = 'unknown'

        const nameMatch = ch?.name === signalName || ch?.name?.toLowerCase().includes(signalName.toLowerCase())

        return {
          sourceDeviceId: 'not_verifiable_with_current_adapter',
          sourcePort: 'not_verifiable_with_current_adapter',
          destinationDeviceId: deviceId,
          destinationPort: channelId,
          signalName,
          expected: true,
          actual: meterResult !== 'silent',
          status,
          confidence: 'not_verifiable_with_current_adapter' as const,
          detail: [
            `meter: ${meterResult}`,
            ch?.mute ? 'channel is MUTED' : undefined,
            nameMatch === false ? `channel labeled "${ch?.name ?? '(unknown)'}" — expected "${signalName}"` : undefined,
          ].filter(Boolean).join('; ') || undefined,
        }
      })

      const ok = routes.filter((r) => r.status === 'ok').length
      const missing = routes.filter((r) => r.status === 'missing').length
      const unknown = routes.filter((r) => r.status === 'unknown').length

      const report: RoutingValidationReport = {
        sourceDeviceId: 'not_verifiable_with_current_adapter',
        targetDeviceId: deviceId,
        validatedAt: new Date().toISOString(),
        routes,
        summary: { ok, missing, unexpected: 0, unknown, not_verifiable: routes.length },
        issues: routes.filter((r) => r.status !== 'ok').map((r) => `${r.destinationPort} (${r.signalName ?? '?'}): ${r.status}`),
        globalConfidence: 'not_verifiable_with_current_adapter',
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] }
    },
  )

  // ─── validate_stagebox_routing ────────────────────────────────────────────
  // @implements #34 REQ-F-ROUT-004
  server.tool(
    'validate_stagebox_routing',
    'Check whether a stagebox (32R) is detected and configured as slave to this mixer. Reads global.stagebox_mode state key and connected device roles. AVB routing is not_verifiable_with_current_adapter (requires 32R probe session).',
    {
      deviceId: z.string(),
      expectedStageboxSerial: z.string().optional().describe('Expected serial of the stagebox device, if known'),
    },
    async ({ deviceId, expectedStageboxSerial }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected' }) }], isError: true }
      }
      const stageboxMode = snapshot.flatState['global.stagebox_mode']
      const stageboxModeValue = typeof stageboxMode === 'number' ? stageboxMode : null

      // Check if any connected device has STAGEBOX role
      const connectedIds = clientManager.getConnectedDeviceIds()
      const stageboxDevice = connectedIds
        .map((id) => clientManager.getIdentity(id))
        .find((identity) => identity?.role === 'STAGEBOX')

      const result = {
        deviceId,
        stageboxMode: stageboxModeValue,
        stageboxPresent: stageboxModeValue === 1 || stageboxDevice !== undefined,
        stageboxDevice: stageboxDevice ? {
          deviceId: stageboxDevice.deviceId,
          serial: stageboxDevice.serial,
          name: stageboxDevice.name,
        } : null,
        serialMatch: expectedStageboxSerial
          ? stageboxDevice?.serial === expectedStageboxSerial
          : null,
        avbStreamRouting: 'not_verifiable_with_current_adapter',
        confidence: stageboxModeValue !== null ? 'guessed' : 'not_verifiable_with_current_adapter',
        note: 'AVB routing details require a probe session with 32R hardware connected.',
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── diagnose_no_signal_routing ───────────────────────────────────────────
  // @implements #35 REQ-F-ROUT-005
  server.tool(
    'diagnose_no_signal_routing',
    'Structured diagnosis for a channel that should have signal but appears silent. Checks meter, mute, fader, gate, and stagebox presence. Returns likelyCauses[] and safeNextSteps[]. Physical routing is not_verifiable — the tool does NOT guess about cable connections.',
    {
      deviceId: z.string(),
      channelId: z.string().describe('Channel ID to diagnose, e.g. "line.ch7"'),
      expectedSource: z.string().optional().describe('Human label for expected source, e.g. "Lead Vox"'),
    },
    async ({ deviceId, channelId, expectedSource }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      const summarizer = clientManager.getSummarizer(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected' }) }], isError: true }
      }

      const ch = snapshot.channels.find((c) => c.id === channelId)
      const meterSummary = summarizer?.getSummary(10 as const)
      const isSilent   = meterSummary?.silentChannels.includes(channelId) ?? null
      const isActive   = meterSummary?.activeChannels.includes(channelId) ?? null
      const isClipping = meterSummary?.clippingChannels.includes(channelId) ?? null

      const checks: NoSignalDiagnosis['checks'] = []
      const likelyCauses: string[] = []
      const safeNextSteps: string[] = []

      // Check 1: Meter
      const meterResult = !meterSummary ? 'no_data'
        : isClipping ? 'clipping'
        : isActive ? 'active'
        : isSilent ? 'silent'
        : 'no_data'
      checks.push({ check: 'meter', result: meterResult, detail: meterSummary ? `Window: ${meterSummary.windowSec}s` : 'No meter data yet' })

      // Check 2: Mute
      const muteResult = ch === undefined ? 'unknown' : ch.mute ? 'muted' : 'unmuted'
      checks.push({ check: 'mute', result: muteResult })
      if (muteResult === 'muted') {
        likelyCauses.push('Channel is muted')
        safeNextSteps.push(`Unmute channel ${channelId}`)
      }

      // Check 3: Fader
      const faderLevel = ch?.fader?.linear ?? null
      const faderResult = faderLevel === null ? 'unknown'
        : faderLevel < 0.01 ? 'zero'
        : faderLevel < 0.2  ? 'low'
        : 'active'
      checks.push({ check: 'fader', result: faderResult, detail: faderLevel !== null ? `linear=${faderLevel.toFixed(3)}` : undefined })
      if (faderResult === 'zero') {
        likelyCauses.push('Channel fader is at minimum (zero)')
        safeNextSteps.push(`Raise the channel fader on ${channelId}`)
      } else if (faderResult === 'low') {
        likelyCauses.push('Channel fader is very low')
        safeNextSteps.push(`Check channel fader level on ${channelId}`)
      }

      // Check 4: Gate/expander
      const gateEnabled = ch?.fatChannel?.gate?.enabled ?? null
      const gateResult = gateEnabled === null ? 'unknown'
        : gateEnabled ? 'enabled_check_threshold' : 'disabled'
      checks.push({ check: 'gate', result: gateResult, detail: ch?.fatChannel?.gate ? `threshold=${ch.fatChannel.gate.thresholdDb?.toFixed(1) ?? '?'} dBFS` : undefined })
      if (gateResult === 'enabled_check_threshold') {
        likelyCauses.push('Noise gate may be choking signal (threshold may be too high)')
        safeNextSteps.push('Check gate threshold — lower it or disable the gate temporarily to isolate the issue')
      }

      // Check 5: Stagebox
      const stageboxMode = snapshot.flatState['global.stagebox_mode']
      const stageboxResult = stageboxMode === 1 ? 'present' : stageboxMode === 0 ? 'absent' : 'unknown'
      checks.push({ check: 'stagebox', result: stageboxResult })
      if (stageboxResult === 'absent') {
        likelyCauses.push('Stagebox not connected (no external signal source via AVB)')
      }

      // Inconclusive adds — physical routing always not_verifiable
      if (meterResult === 'silent' || meterResult === 'no_data') {
        likelyCauses.push('Wrong input routing (software-unverifiable — not_verifiable_with_current_adapter)')
        likelyCauses.push('Wrong physical XLR patch (software-unverifiable — not_verifiable_with_current_adapter)')
        safeNextSteps.push(`Ask ${expectedSource ?? 'performer'} to send signal again`)
        safeNextSteps.push('Check physical XLR cable and connector at stagebox/console')
      }

      // diagnosedIssues counts only the actionable cause checks (mute, fader, gate, stagebox).
      // The meter check is the symptom we are diagnosing, not a finding in itself — so it is
      // excluded from this count. 'unknown' results are also not diagnostic findings.
      // Result: if ALL cause checks are clean → status 'inconclusive'; any flagged cause → 'partial'.
      const CLEAR_RESULTS = new Set(['unmuted', 'active', 'clipping', 'disabled', 'present', 'unknown'])
      const diagnosedIssues = checks
        .filter((c) => c.check !== 'meter')
        .filter((c) => !CLEAR_RESULTS.has(c.result))
        .length
      const status: NoSignalDiagnosis['status'] = meterResult === 'active' || meterResult === 'clipping' ? 'ok'
        : muteResult === 'muted' || faderResult === 'zero' ? 'problem'
        : diagnosedIssues > 0 ? 'partial'
        : 'inconclusive'

      const diagnosis: NoSignalDiagnosis = {
        deviceId, channelId, expectedSource, status,
        checks, likelyCauses, safeNextSteps,
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(diagnosis, null, 2) }] }
    },
  )

  // ─── detect_possible_patch_swap ───────────────────────────────────────────
  // @implements #36 REQ-F-ROUT-006
  server.tool(
    'detect_possible_patch_swap',
    'Cross-correlate expected channel signal assignments with actual meter activity and channel labels to identify possible physical cable swap errors. Returns possibleSwaps[] with evidence.',
    {
      deviceId: z.string(),
      expectedChannels: z.array(z.object({
        channelId: z.string(),
        signalName: z.string(),
      })).describe('Expected channel-to-signal assignments from rider/patch plan'),
    },
    async ({ deviceId, expectedChannels }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      const summarizer = clientManager.getSummarizer(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected' }) }], isError: true }
      }
      const meterSummary = summarizer?.getSummary(10 as const)
      const activeSet  = new Set(meterSummary?.activeChannels ?? [])
      const silentSet  = new Set(meterSummary?.silentChannels ?? [])

      const expectedIds = new Set(expectedChannels.map((e) => e.channelId))
      const silentExpected = expectedChannels.filter((e) => silentSet.has(e.channelId))
      const activeUnexpected = (meterSummary?.activeChannels ?? []).filter((id) => !expectedIds.has(id))

      // Build channel name lookup from snapshot
      const nameById = new Map(snapshot.channels.map((ch) => [ch.id, ch.name ?? '']))

      // Detect label swaps: channel A labeled with signal B, channel B labeled with signal A
      const possibleSwaps: PatchSwapDetection['possibleSwaps'] = []
      for (const silent of silentExpected) {
        for (const { channelId, signalName } of expectedChannels) {
          if (channelId === silent.channelId) continue
          // Check if the name of the silent channel appears where the active channel's name should be
          const silentChName  = nameById.get(silent.channelId) ?? ''
          const activeChName  = nameById.get(channelId) ?? ''
          const silentMatches = silentChName.toLowerCase().includes(signalName.toLowerCase())
          const activeMatches = activeChName.toLowerCase().includes(silent.signalName.toLowerCase())
          if ((silentMatches || activeMatches) && activeSet.has(channelId)) {
            possibleSwaps.push({
              channelA: silent.channelId,
              channelB: channelId,
              channelALabel: silentChName || undefined,
              channelBLabel: activeChName || undefined,
              evidence: `${silent.channelId} silent (expected "${silent.signalName}", labeled "${silentChName}"); ${channelId} active (expected "${signalName}", labeled "${activeChName}")`,
              confidence: 'inferred',
            })
          }
        }
      }

      const result: PatchSwapDetection = {
        deviceId,
        analyzedAt: new Date().toISOString(),
        possibleSwaps,
        silentChannelsNotInExpectedList: silentExpected.map((e) => e.channelId),
        unexpectedActiveChannels: activeUnexpected,
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── get_mixer_capabilities ──────────────────────────────────────────────
  server.tool(
    'get_mixer_capabilities',
    'Return the hardware capabilities of a mixer (input count, aux mix count, FX buses, subgroups, Fat Channel availability, AVB stagebox support). Used by the sound engineer agent to validate capacity before planning channel/aux/FX assignments. Derived from known model table with live-state override.',
    { deviceId: z.string() },
    async ({ deviceId }) => {
      const identity = clientManager.getIdentity(deviceId)
      if (!identity) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }],
          isError: true,
        }
      }
      const caps = clientManager.getCapabilities(deviceId)
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            deviceId,
            model: identity.model,
            role: identity.role,
            capabilities: caps,
          }, null, 2),
        }],
      }
    },
  )

  // ─── analyze_line_check_step ─────────────────────────────────────────────
  server.tool(
    'analyze_line_check_step',
    'Observe mixer meter activity during a line check step. The agent provides expected-active channels (e.g. "Kick on channel 1"). The MCP server checks meter readings and reports: silent expected channels, unexpected active channels, and suspected patch swaps. Does NOT write to the mixer.',
    {
      deviceId: z.string(),
      expectedActiveChannels: z.array(z.object({
        channel: z.number().int().positive().describe('1-based physical channel number'),
        name: z.string().describe('Signal name, e.g. "Kick"'),
      })).describe('Channels the agent expects to be active right now'),
      allowedOtherChannels: z.array(z.object({
        channel: z.number().int().positive(),
        name: z.string(),
      })).optional().describe('Channels that may also be active without being flagged (e.g. ambient mics)'),
      windowSec: z.number().int().positive().optional().describe('Meter observation window in seconds (default 10)'),
    },
    async ({ deviceId, expectedActiveChannels, allowedOtherChannels, windowSec }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      const summarizer = clientManager.getSummarizer(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const win = (windowSec ?? 10) as 1 | 10 | 60
      const meterSummary = summarizer?.getSummary(win)
      if (!meterSummary) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No meter data available yet. Wait a few seconds after connecting.' }) }], isError: true }
      }
      const result = analyzeLineCheckStep(
        snapshot,
        expectedActiveChannels,
        allowedOtherChannels ?? [],
        meterSummary,
      )
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── diagnose_channel ─────────────────────────────────────────────────────
  server.tool(
    'diagnose_channel',
    'Diagnose a single channel that is expected to have signal. Checks mute, fader, solo, meter, and gate state. Returns structured likelyCauses[] and safeNextSteps[]. Physical routing is NOT diagnosed (not verifiable from software). Does NOT write to the mixer.',
    {
      deviceId: z.string(),
      channel: z.number().int().positive().describe('1-based physical channel number (as labeled on mixer front panel)'),
      expectedSource: z.string().optional().describe('Human label for expected source, e.g. "Lead Vox"'),
    },
    async ({ deviceId, channel, expectedSource }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      const summarizer = clientManager.getSummarizer(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const meterSummary = summarizer?.getSummary(10 as const) ?? null
      const result = diagnoseChannel(snapshot, channel, meterSummary, expectedSource)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── get_aux_mix ──────────────────────────────────────────────────────────
  server.tool(
    'get_aux_mix',
    'Get the state of a specific aux mix bus: master level, master mute, and all per-channel send levels. Monitor mix workflows: agent provides aux mix number, MCP returns current state. prePost is always "unknown" until hardware probed.',
    {
      deviceId: z.string(),
      auxMixNumber: z.number().int().positive().describe('1-based aux mix number'),
    },
    async ({ deviceId, auxMixNumber }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const allMixes = extractAuxMixes(snapshot.flatState)
      const mix = allMixes.find((m) => m.auxMixNumber === auxMixNumber)
      if (!mix) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Aux mix ${auxMixNumber} not found in current state.` }) }],
          isError: true,
        }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(mix, null, 2) }] }
    },
  )

  // ─── validate_monitor_requirements ───────────────────────────────────────
  server.tool(
    'validate_monitor_requirements',
    'Validate rider-derived monitor send requirements against the actual aux mix state. The agent provides expected sends (from rider); the MCP server checks the mixer and flags missing, muted, or very-low sends. Does NOT write to the mixer.',
    {
      deviceId: z.string(),
      auxMix: z.number().int().positive().describe('1-based aux mix number'),
      expectedSends: z.array(z.object({
        channel: z.number().int().positive().describe('1-based physical channel number'),
        name: z.string().describe('Signal name, e.g. "Lead Vox"'),
        minimumPresence: z.enum(['strong', 'medium', 'any']).describe('Required presence level in the monitor'),
      })).describe('Agent-provided expected sends for this monitor mix (from rider)'),
    },
    async ({ deviceId, auxMix, expectedSends }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
      }
      const allMixes = extractAuxMixes(snapshot.flatState)
      const mix = allMixes.find((m) => m.auxMixNumber === auxMix)

      const issues: { type: string; auxMix: number; channel: number; name: string; severity: string }[] = []

      for (const expected of expectedSends) {
        const send = mix?.sends.find((s) => s.fromChannel === expected.channel)
        if (!send) {
          issues.push({ type: 'missing_monitor_send', auxMix, channel: expected.channel, name: expected.name, severity: 'high' })
          continue
        }
        if (send.muted) {
          issues.push({ type: 'muted_send', auxMix, channel: expected.channel, name: expected.name, severity: 'high' })
          continue
        }
        const veryLowThreshold = expected.minimumPresence === 'strong' ? 0.3 : expected.minimumPresence === 'medium' ? 0.15 : 0.05
        if (send.level < veryLowThreshold) {
          issues.push({ type: 'very_low_send', auxMix, channel: expected.channel, name: expected.name, severity: expected.minimumPresence === 'strong' ? 'high' : 'medium' })
        }
      }

      const status = issues.some((i) => i.severity === 'high') ? 'problem'
        : issues.length > 0 ? 'warning'
        : 'ok'

      return { content: [{ type: 'text' as const, text: JSON.stringify({ status, issues }, null, 2) }] }
    },
  )

  // ─── validate_channel_setup ────────────────────────────────────────────────
  server.tool(
    'validate_channel_setup',
    'Validate expected channel names, mute state, and phantom power against actual mixer state. The agent provides rider-derived expected channel list; the MCP server checks the actual mixer channels. Returns issues[] with severity. Does NOT write to the mixer.',
    {
      deviceId: z.string(),
      expectedChannels: z.array(z.object({
        channel: z.number().int().positive().describe('1-based physical channel number'),
        name: z.string().describe('Expected channel name (scribble strip)'),
        phantomRequired: z.boolean().optional().describe('Whether phantom power is expected'),
      })).describe('Agent-provided expected channel list from rider'),
    },
    async ({ deviceId, expectedChannels }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
      }

      const issues: { channel: number; issue: string; current: string; expected: string; severity: string }[] = []

      for (const expected of expectedChannels) {
        const channelId = `line.ch${expected.channel}`
        const ch = snapshot.channels.find((c) => c.id === channelId)

        if (!ch) {
          issues.push({ channel: expected.channel, issue: 'channel_not_found', current: 'not_present', expected: expected.name, severity: 'high' })
          continue
        }

        if (ch.name && ch.name !== expected.name) {
          issues.push({ channel: expected.channel, issue: 'expected_name_mismatch', current: ch.name, expected: expected.name, severity: 'low' })
        }

        if (ch.mute === true) {
          issues.push({ channel: expected.channel, issue: 'muted_expected_channel', current: 'muted', expected: 'active', severity: 'high' })
        }

        if (expected.phantomRequired !== undefined) {
          const phantomKey = `line.ch${expected.channel}.48v`
          const actualPhantom = Boolean(snapshot.flatState[phantomKey] ?? false)
          if (actualPhantom !== expected.phantomRequired) {
            issues.push({
              channel: expected.channel,
              issue: 'phantom_mismatch',
              current: actualPhantom ? 'phantom_on' : 'phantom_off',
              expected: expected.phantomRequired ? 'phantom_on' : 'phantom_off',
              severity: 'medium',
            })
          }
        }
      }

      const status = issues.some((i) => i.severity === 'high') ? 'problem'
        : issues.length > 0 ? 'warning'
        : 'ok'

      return { content: [{ type: 'text' as const, text: JSON.stringify({ status, issues }, null, 2) }] }
    },
  )

  // ─── check_required_setup ────────────────────────────────────────────────
  server.tool(
    'check_required_setup',
    'Check whether the mixer can satisfy rider-derived capacity requirements (input count, monitor mixes, FX buses, stagebox). The agent provides requirements; the MCP server checks against mixer capabilities. Returns pass/fail per requirement.',
    {
      deviceId: z.string(),
      requirements: z.object({
        inputChannels: z.number().int().positive().optional().describe('Minimum input channels required'),
        monitorMixes: z.number().int().positive().optional().describe('Minimum monitor mixes required'),
        fxBuses: z.number().int().positive().optional().describe('Minimum FX buses required'),
        stageboxRequired: z.boolean().optional().describe('Whether an AVB stagebox is required'),
      }).describe('Rider-derived capacity requirements'),
    },
    async ({ deviceId, requirements }) => {
      const identity = clientManager.getIdentity(deviceId)
      if (!identity) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
      }
      const caps = clientManager.getCapabilities(deviceId)

      const checks: { requirement: string; required?: number; available?: number; status: string }[] = []

      if (requirements.inputChannels !== undefined) {
        checks.push({
          requirement: 'inputChannels',
          required: requirements.inputChannels,
          available: caps.lineInputs,
          status: caps.lineInputs >= requirements.inputChannels ? 'ok' : 'insufficient',
        })
      }
      if (requirements.monitorMixes !== undefined) {
        checks.push({
          requirement: 'monitorMixes',
          required: requirements.monitorMixes,
          available: caps.auxMixes,
          status: caps.auxMixes >= requirements.monitorMixes ? 'ok' : 'insufficient',
        })
      }
      if (requirements.fxBuses !== undefined) {
        checks.push({
          requirement: 'fxBuses',
          required: requirements.fxBuses,
          available: caps.fxBuses,
          status: caps.fxBuses >= requirements.fxBuses ? 'ok' : 'insufficient',
        })
      }
      if (requirements.stageboxRequired !== undefined) {
        checks.push({
          requirement: 'stageboxRequired',
          available: caps.avbStagebox ? 1 : 0,
          status: !requirements.stageboxRequired || caps.avbStagebox ? 'ok' : 'unavailable',
        })
      }

      const status = checks.some((c) => c.status === 'insufficient' || c.status === 'unavailable') ? 'problem'
        : checks.length > 0 ? 'ok'
        : 'ok'

      return { content: [{ type: 'text' as const, text: JSON.stringify({ status, checks }, null, 2) }] }
    },
  )

  // ─── find_missing_monitor_sends ───────────────────────────────────────────
  // @implements #41 REQ-F-AUX-002
  // @architecture #47 ADR-008: Layer A tool — zero-expectation unassigned/silent send detection
  server.tool(
    'find_missing_monitor_sends',
    'Find channels that are not assigned to an aux mix or have a near-zero send level (< 0.05). Zero-expectation audit — does not require agent-provided rider expectations. Layer A: uses confirmed state keys.',
    {
      deviceId: z.string(),
      auxMixNumber: z.number().int().positive().describe('1-based aux mix number'),
    },
    async ({ deviceId, auxMixNumber }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const allMixes = extractAuxMixes(snapshot.flatState)
      const mix = allMixes.find((m) => m.auxMixNumber === auxMixNumber)
      if (!mix) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ auxMixNumber, status: 'ok', missingSends: [] }) }] }
      }

      const missingSends: { channel: number; channelName: string; reason: string; level: number }[] = []
      for (const send of mix.sends) {
        if (send.muted) {
          missingSends.push({ channel: send.fromChannel, channelName: send.fromChannelName, reason: 'not_assigned', level: send.level })
        } else if (send.level < 0.05) {
          missingSends.push({ channel: send.fromChannel, channelName: send.fromChannelName, reason: 'very_low_send', level: send.level })
        }
      }

      const status = mix.masterMuted ? 'problem' : missingSends.length > 0 ? 'warning' : 'ok'
      return { content: [{ type: 'text' as const, text: JSON.stringify({ auxMixNumber, status, missingSends }, null, 2) }] }
    },
  )

  // ─── find_muted_monitor_sends ─────────────────────────────────────────────
  // @implements #42 REQ-F-AUX-003
  server.tool(
    'find_muted_monitor_sends',
    'Find channels whose send to an aux mix is muted (not assigned). Returns the level at time of query even though the send is inactive. Layer A: uses confirmed state keys.',
    {
      deviceId: z.string(),
      auxMixNumber: z.number().int().positive().describe('1-based aux mix number'),
    },
    async ({ deviceId, auxMixNumber }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const allMixes = extractAuxMixes(snapshot.flatState)
      const mix = allMixes.find((m) => m.auxMixNumber === auxMixNumber)
      if (!mix) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ auxMixNumber, status: 'ok', mutedSends: [] }) }] }
      }

      const mutedSends = mix.sends
        .filter((s) => s.muted)
        .map((s) => ({ channel: s.fromChannel, channelName: s.fromChannelName, level: s.level }))

      const status = mutedSends.length > 0 ? 'problem' : 'ok'
      return { content: [{ type: 'text' as const, text: JSON.stringify({ auxMixNumber, status, mutedSends }, null, 2) }] }
    },
  )

  // ─── find_hot_monitor_sends ───────────────────────────────────────────────
  // @implements #43 REQ-F-AUX-004
  server.tool(
    'find_hot_monitor_sends',
    'Find channels sending to an aux mix above a configurable threshold (default −6 dBFS). Only considers assigned and unmuted sends. Layer A: uses confirmed state keys.',
    {
      deviceId: z.string(),
      auxMixNumber: z.number().int().positive().describe('1-based aux mix number'),
      thresholdDb: z.number().optional().describe('Threshold in dBFS (default −6).'),
    },
    async ({ deviceId, auxMixNumber, thresholdDb }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const threshold = thresholdDb ?? HOT_SEND_THRESHOLD_DB
      const allMixes = extractAuxMixes(snapshot.flatState)
      const mix = allMixes.find((m) => m.auxMixNumber === auxMixNumber)
      if (!mix) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ auxMixNumber, thresholdDb: threshold, status: 'ok', hotSends: [] }) }] }
      }

      const hotSends = mix.sends
        .filter((s) => !s.muted && s.level > 0)
        .map((s) => ({ ...s, levelDb: 20 * Math.log10(s.level) }))
        .filter((s) => s.levelDb > threshold)
        .map((s) => ({ channel: s.fromChannel, channelName: s.fromChannelName, level: s.level, levelDb: s.levelDb }))

      const status = hotSends.length > 0 ? 'warning' : 'ok'
      return { content: [{ type: 'text' as const, text: JSON.stringify({ auxMixNumber, thresholdDb: threshold, status, hotSends }, null, 2) }] }
    },
  )

  // ─── validate_aux_mix ─────────────────────────────────────────────────────
  // @implements #44 REQ-F-AUX-005
  server.tool(
    'validate_aux_mix',
    'Zero-expectation audit of an aux mix: combines missing, muted, and hot send detection into a single AuxMixAuditResult. Does not require rider-provided expected sends. Layer A: uses confirmed state keys.',
    {
      deviceId: z.string(),
      auxMixNumber: z.number().int().positive().describe('1-based aux mix number'),
      hotThresholdDb: z.number().optional().describe('Hot send threshold in dBFS (default −6)'),
    },
    async ({ deviceId, auxMixNumber, hotThresholdDb }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const threshold = hotThresholdDb ?? HOT_SEND_THRESHOLD_DB
      const allMixes = extractAuxMixes(snapshot.flatState)
      const mix = allMixes.find((m) => m.auxMixNumber === auxMixNumber)

      if (!mix) {
        const result: AuxMixAuditResult = { auxMixNumber, name: `Aux ${auxMixNumber}`, masterLevel: 0, masterMuted: false, sendCount: 0, status: 'ok', issues: [], hotThresholdDb: threshold }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      }

      const issues: AuxMixAuditIssue[] = []

      if (mix.masterMuted) {
        issues.push({ issueType: 'master_muted', auxMixNumber, channel: 0, channelName: mix.name, severity: 'high', detail: `Aux ${auxMixNumber} master output is muted` })
      }

      for (const send of mix.sends) {
        if (send.muted) {
          issues.push({ issueType: 'unassigned_send', auxMixNumber, channel: send.fromChannel, channelName: send.fromChannelName, severity: 'high', detail: `Channel not assigned to Aux ${auxMixNumber}`, level: send.level, levelDb: null })
        } else if (send.level < 0.05) {
          issues.push({ issueType: 'very_low_send', auxMixNumber, channel: send.fromChannel, channelName: send.fromChannelName, severity: 'low', detail: 'Send level very low (< 0.05 linear)', level: send.level, levelDb: send.level > 0 ? 20 * Math.log10(send.level) : null })
        } else if (send.level > 0) {
          const levelDb = 20 * Math.log10(send.level)
          if (levelDb > threshold) {
            issues.push({ issueType: 'hot_send', auxMixNumber, channel: send.fromChannel, channelName: send.fromChannelName, severity: 'medium', detail: `Send level ${levelDb.toFixed(1)} dBFS exceeds threshold ${threshold} dBFS`, level: send.level, levelDb })
          }
        }
      }

      const hasHigh = issues.some((i) => i.severity === 'high')
      const status = hasHigh ? 'problem' : issues.some((i) => i.severity === 'medium' || i.severity === 'low') ? 'warning' : 'ok'

      const result: AuxMixAuditResult = { auxMixNumber, name: mix.name, masterLevel: mix.masterLevel, masterMuted: mix.masterMuted, sendCount: mix.sends.length, status, issues, hotThresholdDb: threshold }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── get_input_routing (Layer A — HIL probe 2026-07-01) ──────────────────
  // @implements #45 REQ-F-ROUT-011
  server.tool(
    'get_input_routing',
    'Returns per-channel input source routing (Local/Stage Box). Confidence: inferred. Falls back to probe instructions when flatState is not populated.',
    { deviceId: z.string() },
    async ({ deviceId }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flatState = (snapshot as any)?.flatState as Record<string, unknown> | undefined ?? {}
      const inputRouting = extractInputRouting(flatState)

      if (inputRouting) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          status: 'inferred',
          confidence: 'inferred',
          channels: inputRouting.channels,
          mixerSerial: inputRouting.mixerSerial,
          firmware: inputRouting.firmware,
          hilEvidence: inputRouting.hilEvidence,
          notes: inputRouting.notes,
        }, null, 2) }] }
      }

      // Fallback: no inputsrc data in snapshot yet
      const probeSteps = [
        `pnpm probe:dev probe-routing dump --device ${deviceId} --out before-input-source.json`,
        '<In UC Surface: change one channel input source (e.g., Local → Stagebox on Ch1)>',
        `pnpm probe:dev probe-routing dump --device ${deviceId} --out after-input-source.json`,
        `pnpm probe:dev probe-routing diff --before before-input-source.json --after after-input-source.json --kind input-source`,
      ]
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'not_verifiable_with_current_adapter', reason: 'Physical input source routing requires probe diff-state. No confirmed state key found yet. Run the probe steps below to discover the key.', probeSteps, probeMarkdown: `## How to discover input routing\n\n${probeSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` }, null, 2) }] }
    },
  )

  // ─── validate_avb_routing (Layer A implementation backed by HIL probe 2026-07-01) ───
  // @implements #45 REQ-F-ROUT-011
  server.tool(
    'validate_avb_routing',
    'Returns AVB stream routing (block assignments from 32R stagebox). Confidence: observed. HIL evidence: 2026-07-01 StudioLive 32SC + 32R fw 3.4.0.111374. Falls back to probe instructions when no state is available.',
    { deviceId: z.string(), expectedStreams: z.array(z.string()).optional() },
    async ({ deviceId, expectedStreams }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flatState = (snapshot as any)?.flatState as Record<string, unknown> | undefined ?? {}
      const avbRouting = extractAvbStreamRouting(flatState)

      if (avbRouting) {
        // Optional validation against expectedStreams
        let validation: { allMatch: boolean; mismatches: Array<{ channelRange: string; expected: string; actual: string | null }> } | undefined
        if (expectedStreams && expectedStreams.length > 0) {
          const mismatches = avbRouting.streamBlocks
            .filter((b) => {
              const expected = expectedStreams.find((e) => e.includes(b.channelRange))
              return expected !== undefined && b.streamLabel !== expected
            })
            .map((b) => ({
              channelRange: b.channelRange,
              expected: expectedStreams.find((e) => e.includes(b.channelRange)) ?? '',
              actual: b.streamLabel,
            }))
          validation = { allMatch: mismatches.length === 0, mismatches }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          status: 'observed',
          confidence: 'observed',
          stageboxName: avbRouting.stageboxName,
          connected: avbRouting.connected,
          streamBlocks: avbRouting.streamBlocks,
          mixerSerial: avbRouting.mixerSerial,
          firmware: avbRouting.firmware,
          hilEvidence: avbRouting.hilEvidence,
          ...(validation ? { validation } : {}),
        }, null, 2) }] }
      }

      // Fallback: no AVB routing data in snapshot yet — return probe instructions
      const probeSteps = [
        'Connect StudioLive 32R stagebox via AVB to the FOH mixer',
        `pnpm probe:dev probe-routing dump --device ${deviceId} --out before-avb.json`,
        '<In UC Surface: change one AVB stream source assignment>',
        `pnpm probe:dev probe-routing dump --device ${deviceId} --out after-avb.json`,
        `pnpm probe:dev probe-routing diff --before before-avb.json --after after-avb.json --kind avb-stream`,
      ]
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'not_verifiable_with_current_adapter', reason: 'AVB stream mapping requires 32R hardware and a separate probe session. Run the probe steps below to discover the key.', probeSteps, probeMarkdown: `## How to discover AVB routing\n\n${probeSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` }, null, 2) }] }
    },
  )

  // ─── validate_output_routing (Layer B partial) ────────────────────────────
  // @implements #45 REQ-F-ROUT-011
  server.tool(
    'validate_output_routing',
    'Layer B partial: output patch source index is known, but source name → index mapping is not probe-confirmed. Returns partial data with probe instructions for source names.',
    { deviceId: z.string(), expectedOutputs: z.array(z.string()).optional() },
    async ({ deviceId, expectedOutputs: _expectedOutputs }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      const probeSteps = [
        'pnpm probe-routing dump --device <IP> --out before-patch.json',
        '<In UC Surface: change one analog output source>',
        'pnpm probe-routing dump --device <IP> --out after-patch.json',
        'pnpm probe-routing diff --before before-patch.json --after after-patch.json --kind bus-to-output',
      ]
      const unverified = { reason: 'Output patch source names not yet probe-confirmed. Source indices are known.', probeSteps, probeMarkdown: `## How to confirm output patch source names\n\n${probeSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'partial', outputPatchIndex: snapshot?.outputPatch ?? null, unverified }, null, 2) }] }
    },
  )

  // ─── start_routing_probe ──────────────────────────────────────────────────
  // @implements #90 REQ-F-PROBE-001: Layer B promotion — capture baseline state
  // @architecture ADR-008: Layer B probe workflow
  server.tool(
    'start_routing_probe',
    'Capture the current mixer state as a baseline for a routing probe session. The operator must then make the routing change in UC Surface (e.g. change one input source, AVB stream, or output patch), then call complete_routing_probe with the returned probeId to identify which state keys changed.',
    {
      deviceId: z.string(),
      kind: z.enum(['input-source', 'avb-stream', 'output-patch', 'stagebox'])
        .describe('Type of routing to probe: input-source, avb-stream, output-patch, or stagebox'),
    },
    async ({ deviceId, kind }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      pruneExpiredProbeSessions()
      const probeId = randomUUID()
      const capturedAt = new Date().toISOString()
      probeSessions.set(probeId, {
        deviceId, kind,
        baselineFlat: { ...snapshot.flatState },
        capturedAt,
        expiresAt: Date.now() + PROBE_TTL_MS,
      })
      const kindLabel: Record<string, string> = {
        'input-source': 'input source (e.g. change a channel input from Line to Digital)',
        'avb-stream':   'AVB stream assignment (requires StudioLive 32R stagebox connected)',
        'output-patch': 'analog output source (change one output in the Output Patch screen)',
        'stagebox':     'stagebox connection or routing',
      }
      const instruction = `Baseline captured. Now in UC Surface, change one ${kindLabel[kind] ?? kind}. Then call complete_routing_probe with probeId "${probeId}" to see which state keys changed.`
      return { content: [{ type: 'text' as const, text: JSON.stringify({ probeId, kind, capturedAt, instruction }, null, 2) }] }
    },
  )

  // ─── complete_routing_probe ───────────────────────────────────────────────
  // @implements #46 REQ-F-PROBE-002: Layer B promotion — diff and return changed keys
  server.tool(
    'complete_routing_probe',
    'Diff the current mixer state against a baseline captured by start_routing_probe. Returns all state keys that changed, with before/after values. Run after making a routing change in UC Surface. The changed keys identify which state key controls the routing you adjusted.',
    {
      deviceId: z.string(),
      probeId: z.string().uuid().describe('UUID returned by start_routing_probe'),
    },
    async ({ deviceId, probeId }) => {
      pruneExpiredProbeSessions()
      const session = probeSessions.get(probeId)
      if (!session) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Probe session '${probeId}' not found or expired (TTL: 5 min). Re-run start_routing_probe.` }) }], isError: true }
      }
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
      }
      const beforeFlat = session.baselineFlat
      const afterFlat = snapshot.flatState
      const allKeys = new Set([...Object.keys(beforeFlat), ...Object.keys(afterFlat)])
      const changedKeys: Array<{ key: string; before: unknown; after: unknown }> = []
      for (const key of allKeys) {
        const before = beforeFlat[key]
        const after = afterFlat[key]
        if (before !== after) {
          changedKeys.push({ key, before: before ?? null, after: after ?? null })
        }
      }
      probeSessions.delete(probeId)  // consume the session (one-shot)
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        probeId, kind: session.kind,
        capturedAt: session.capturedAt,
        completedAt: new Date().toISOString(),
        changedKeys,
        summary: `Found ${changedKeys.length} changed key(s) between baseline and current state.`,
        note: changedKeys.length === 0
          ? 'No changes detected. Make sure you changed a routing setting in UC Surface between start and complete calls.'
          : `Review changedKeys to identify the state key controlling ${session.kind} routing.`,
      }, null, 2) }] }
    },
  )

  // ─── validate_input_list_against_mixer ──────────────────────────────────
  // @implements #89 REQ-F-INP-001
  server.tool(
    'validate_input_list_against_mixer',
    'Validate an agent-provided input list against actual mixer channel state. Checks channel name, phantom state, and mute. Returns issues[] and printable patch rows grounded in live mixer state. The agent provides the input list (from rider); the MCP validates it.',
    {
      deviceId: z.string(),
      inputList: z.array(z.object({
        inputNo: z.number().int().positive().describe('1-based physical channel number'),
        sourceName: z.string().describe('Expected source name from rider (e.g. "Kick In")'),
        phantomRequired: z.boolean().describe('Whether 48V phantom power is required'),
        micPreference: z.string().optional().describe('Mic or DI preference for patch sheet printing'),
        notes: z.string().optional().describe('Free-text notes for the patch document'),
      })).describe('Agent-provided input list from rider analysis'),
    },
    async ({ deviceId, inputList }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const caps = clientManager.getCapabilities(deviceId)

      // Detect duplicate inputNos
      const seenNos = new Set<number>()
      const duplicates = new Set<number>()
      for (const e of inputList) {
        if (seenNos.has(e.inputNo)) duplicates.add(e.inputNo)
        seenNos.add(e.inputNo)
      }

      const issues: Array<{ inputNo: number; issue: string; current?: string; expected?: string; severity: string }> = []
      const printablePatchRows: PatchSheetRow[] = []

      for (const entry of inputList) {
        const warnings: string[] = []

        // Duplicate check
        if (duplicates.has(entry.inputNo)) {
          issues.push({ inputNo: entry.inputNo, issue: 'duplicate_input_number', expected: String(entry.inputNo), severity: 'high' })
        }

        // Range check
        if (entry.inputNo > caps.lineInputs) {
          issues.push({ inputNo: entry.inputNo, issue: 'input_out_of_range', current: String(caps.lineInputs), expected: String(entry.inputNo), severity: 'high' })
          printablePatchRows.push({
            inputNo: entry.inputNo, sourceName: entry.sourceName, micPreference: entry.micPreference,
            phantomRequired: entry.phantomRequired, notes: entry.notes,
            manualPatchInstruction: `Input ${entry.inputNo} exceeds mixer capacity (${caps.lineInputs} inputs)`,
            currentMixerLabel: null, currentPhantomState: null, currentMuteState: 'unknown', warnings: ['Input out of range'],
          })
          continue
        }

        const channelId = `line.ch${entry.inputNo}`
        const ch = snapshot.channels.find((c) => c.id === channelId)

        // Name mismatch
        if (ch?.name && ch.name !== entry.sourceName) {
          issues.push({ inputNo: entry.inputNo, issue: 'channel_name_mismatch', current: ch.name, expected: entry.sourceName, severity: 'low' })
          warnings.push(`Mixer label "${ch.name}" differs from expected "${entry.sourceName}"`)
        }

        // Mute check
        if (ch?.mute === true) {
          issues.push({ inputNo: entry.inputNo, issue: 'channel_muted', current: 'muted', expected: 'active', severity: 'high' })
          warnings.push('Channel is muted — signal will not pass during line check')
        }

        // Phantom check
        const phantomKey = `${channelId}.48v`
        const actualPhantom = Boolean(snapshot.flatState[phantomKey] ?? false)
        const phantomState: 'on' | 'off' = actualPhantom ? 'on' : 'off'
        if (actualPhantom !== entry.phantomRequired) {
          issues.push({
            inputNo: entry.inputNo, issue: 'phantom_mismatch',
            current: phantomState, expected: entry.phantomRequired ? 'on' : 'off', severity: 'medium',
          })
          warnings.push(`Phantom is ${phantomState} but ${entry.phantomRequired ? 'required' : 'not required'}`)
        }

        const muteState = ch?.mute === true ? 'muted' as const : ch?.mute === false ? 'active' as const : 'unknown' as const
        printablePatchRows.push({
          inputNo: entry.inputNo, sourceName: entry.sourceName, micPreference: entry.micPreference,
          phantomRequired: entry.phantomRequired, notes: entry.notes,
          manualPatchInstruction: `Patch ${entry.sourceName} to FOH/stagebox input ${entry.inputNo}`,
          currentMixerLabel: ch?.name ?? null, currentPhantomState: ch ? phantomState : null,
          currentMuteState: muteState, warnings,
        })
      }

      const hasHigh = issues.some((i) => i.severity === 'high')
      const status = hasHigh ? 'error' : issues.length > 0 ? 'warning' : 'ok'
      return { content: [{ type: 'text' as const, text: JSON.stringify({ status, issues, printablePatchRows }, null, 2) }] }
    },
  )

  // ─── validate_patch_sheet ─────────────────────────────────────────────────
  // @implements #88 REQ-F-INP-002
  server.tool(
    'validate_patch_sheet',
    'Offline-only validation of a patch sheet: checks for duplicate channel numbers, inputs outside mixer capacity, and phantom conflicts. Does NOT require a live mixer connection — purely validates the agent-provided list for internal consistency.',
    {
      inputs: z.array(z.object({
        inputNo: z.number().int().positive().describe('1-based channel number'),
        sourceName: z.string().describe('Source name'),
        phantomRequired: z.boolean().describe('Whether 48V phantom is required'),
        micPreference: z.string().optional(),
        notes: z.string().optional(),
      })).describe('Agent-provided input list to validate offline'),
      maxInputs: z.number().int().positive().optional().describe('Maximum channel count to validate against (default 32)'),
    },
    async ({ inputs, maxInputs }) => {
      const limit = maxInputs ?? 32
      const issues: Array<{ inputNo: number; issue: string; detail: string }> = []
      const seenNos = new Map<number, string>()

      for (const entry of inputs) {
        // Range check
        if (entry.inputNo > limit) {
          issues.push({ inputNo: entry.inputNo, issue: 'input_out_of_range', detail: `Input ${entry.inputNo} exceeds maximum ${limit}` })
        }
        // Duplicate check
        if (seenNos.has(entry.inputNo)) {
          issues.push({ inputNo: entry.inputNo, issue: 'duplicate_input_number', detail: `Input ${entry.inputNo} already assigned to "${seenNos.get(entry.inputNo)}"` })
        } else {
          seenNos.set(entry.inputNo, entry.sourceName)
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ valid: issues.length === 0, issues }, null, 2) }] }
    },
  )

  // ─── render_patch_sheet_data ──────────────────────────────────────────────
  // @implements #91 REQ-F-INP-003
  server.tool(
    'render_patch_sheet_data',
    'Return structured patch sheet rows grounded in mixer state, suitable for agent-side rendering as a printable human patch document. Each row includes the manual patch instruction, current mixer label, phantom state, mute state, and any warnings. The agent formats the final human-readable document.',
    {
      deviceId: z.string(),
      inputs: z.array(z.object({
        inputNo: z.number().int().positive(),
        sourceName: z.string(),
        phantomRequired: z.boolean(),
        micPreference: z.string().optional(),
        standRequired: z.boolean().optional(),
        notes: z.string().optional(),
      })).describe('Agent-provided input list'),
    },
    async ({ deviceId, inputs }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }

      const rows: PatchSheetRow[] = inputs.map((entry) => {
        const channelId = `line.ch${entry.inputNo}`
        const ch = snapshot.channels.find((c) => c.id === channelId)
        const phantomKey = `${channelId}.48v`
        const actualPhantom = Boolean(snapshot.flatState[phantomKey] ?? false)
        const phantomState: 'on' | 'off' = actualPhantom ? 'on' : 'off'
        const muteState = ch?.mute === true ? 'muted' as const : ch?.mute === false ? 'active' as const : 'unknown' as const
        const warnings: string[] = []
        if (ch?.name && ch.name !== entry.sourceName) warnings.push(`Mixer label "${ch.name}" differs from expected "${entry.sourceName}"`)
        if (ch?.mute === true) warnings.push('Channel is muted')
        if (ch && actualPhantom !== entry.phantomRequired) warnings.push(`Phantom is ${phantomState} but ${entry.phantomRequired ? 'required' : 'not required'}`)
        return {
          inputNo: entry.inputNo, sourceName: entry.sourceName, micPreference: entry.micPreference,
          phantomRequired: entry.phantomRequired, standRequired: entry.standRequired, notes: entry.notes,
          manualPatchInstruction: `Patch ${entry.sourceName} to FOH/stagebox input ${entry.inputNo}`,
          currentMixerLabel: ch?.name ?? null, currentPhantomState: ch ? phantomState : null,
          currentMuteState: muteState, warnings,
        }
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify({ rows }, null, 2) }] }
    },
  )

  // ─── get_monitor_mix_layout ───────────────────────────────────────────────
  // @implements #93 REQ-F-MON-001
  server.tool(
    'get_monitor_mix_layout',
    'Return the monitor mix layout: all aux buses with name, type (mono/stereo-left/stereo-right/iem-stereo), and inferred stereo pairs. Stereo pair inference uses ≥80% send-channel overlap as heuristic — confidence is always "inferred" until operator-confirmed.',
    { deviceId: z.string() },
    async ({ deviceId }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const caps = clientManager.getCapabilities(deviceId)
      const allMixes = extractAuxMixes(snapshot.flatState)
      const auxBuses = Array.from({ length: caps.auxMixes }, (_, i) => {
        const mix = allMixes.find((m) => m.auxMixNumber === i + 1)
        return { auxBus: i + 1, name: mix?.name, type: 'mono' as const, inferenceConfidence: 'observed' as const }
      })
      const inferredPairs: Array<{ leftBus: number; rightBus: number; confidence: string }> = []
      for (let i = 0; i < auxBuses.length - 1; i++) {
        const left = allMixes.find((m) => m.auxMixNumber === i + 1)
        const right = allMixes.find((m) => m.auxMixNumber === i + 2)
        if (!left || !right) continue
        const leftChs = new Set(left.sends.map((s) => s.fromChannel))
        const rightChs = new Set(right.sends.map((s) => s.fromChannel))
        const overlap = [...leftChs].filter((c) => rightChs.has(c))
        if (leftChs.size > 0 && overlap.length / Math.max(leftChs.size, rightChs.size) >= 0.8) {
          inferredPairs.push({ leftBus: i + 1, rightBus: i + 2, confidence: 'inferred' })
        }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deviceId, capturedAt: snapshot.capturedAt, auxBuses, inferredPairs }, null, 2) }] }
    },
  )

  // ─── validate_stereo_monitor_pair ─────────────────────────────────────────
  // @implements #92 REQ-F-MON-002
  server.tool(
    'validate_stereo_monitor_pair',
    'Validate that two aux buses form a consistent stereo pair (e.g. IEM L/R). Checks matching send channel assignments and reports channels present on one side but not the other.',
    {
      deviceId: z.string(),
      auxBusLeft: z.number().int().positive().describe('Left aux bus number (1-based)'),
      auxBusRight: z.number().int().positive().describe('Right aux bus number (1-based)'),
      pairName: z.string().optional().describe('Optional label for this stereo pair (e.g. "IEM 1")'),
    },
    async ({ deviceId, auxBusLeft, auxBusRight, pairName }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
      }
      const allMixes = extractAuxMixes(snapshot.flatState)
      const left = allMixes.find((m) => m.auxMixNumber === auxBusLeft)
      const right = allMixes.find((m) => m.auxMixNumber === auxBusRight)
      const issues: string[] = []
      if (!left) issues.push(`Aux bus ${auxBusLeft} not found in mixer state`)
      if (!right) issues.push(`Aux bus ${auxBusRight} not found in mixer state`)

      if (!left || !right) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ auxBusLeft, auxBusRight, pairName, valid: false, issues, leftSendCount: 0, rightSendCount: 0, asymmetricChannels: [] }) }] }
      }

      const leftChs = new Set(left.sends.map((s) => s.fromChannel))
      const rightChs = new Set(right.sends.map((s) => s.fromChannel))
      const asymmetricChannels = [
        ...[...leftChs].filter((c) => !rightChs.has(c)),
        ...[...rightChs].filter((c) => !leftChs.has(c)),
      ].sort((a, b) => a - b)
      if (asymmetricChannels.length > 0) {
        issues.push(`${asymmetricChannels.length} channel(s) present on one side only: ${asymmetricChannels.join(', ')}`)
      }
      if (left.masterMuted) issues.push(`Left bus Aux ${auxBusLeft} master is muted`)
      if (right.masterMuted) issues.push(`Right bus Aux ${auxBusRight} master is muted`)

      return { content: [{ type: 'text' as const, text: JSON.stringify({
        auxBusLeft, auxBusRight, pairName, valid: issues.length === 0,
        issues, leftSendCount: left.sends.length, rightSendCount: right.sends.length, asymmetricChannels,
      }, null, 2) }] }
    },
  )

  // ─── validate_monitor_mix_names ───────────────────────────────────────────
  // @implements #94 REQ-F-MON-003
  server.tool(
    'validate_monitor_mix_names',
    'Audit aux bus names against agent-provided expected names. Returns mismatches and unnamed buses. Useful for verifying that the monitor layout matches the rider/show plan.',
    {
      deviceId: z.string(),
      expectedNames: z.array(z.object({
        auxBus: z.number().int().positive().describe('1-based aux bus number'),
        name: z.string().describe('Expected name (e.g. "Wedge 1", "IEM 1 L")'),
      })).describe('Agent-provided expected aux bus names from rider/show plan'),
    },
    async ({ deviceId, expectedNames }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
      }
      const allMixes = extractAuxMixes(snapshot.flatState)
      const mismatches: Array<{ auxBus: number; expected: string; current: string; issue: string }> = []
      for (const { auxBus, name } of expectedNames) {
        const mix = allMixes.find((m) => m.auxMixNumber === auxBus)
        if (!mix) {
          mismatches.push({ auxBus, expected: name, current: '(not found)', issue: 'bus_not_found' })
        } else if (mix.name !== name) {
          mismatches.push({ auxBus, expected: name, current: mix.name, issue: 'name_mismatch' })
        }
      }
      const unnamed = allMixes.filter((m) => !m.name || m.name.match(/^aux\s*\d+$/i)).map((m) => m.auxMixNumber)
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        status: mismatches.length > 0 ? 'warning' : 'ok', mismatches, unnamedBuses: unnamed,
      }, null, 2) }] }
    },
  )

  // ─── validate_output_patch_labels ─────────────────────────────────────────
  // @implements #40 REQ-F-ROUT-010
  server.tool(
    'validate_output_patch_labels',
    'Compare expected output patch labels against actual mixer output patch state. Source indices are known; source names are not_verifiable_with_current_adapter until probe-routing diff --kind bus-to-output is run. Returns partial validation with confidence annotation.',
    {
      deviceId: z.string(),
      expectedLabels: z.array(z.object({
        outputIndex: z.number().int().positive().describe('1-based analog output index'),
        expectedSourceName: z.string().describe('Expected source name (e.g. "Main L", "Aux 1")'),
      })).describe('Agent-provided expected output patch labels'),
    },
    async ({ deviceId, expectedLabels }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
      }
      const outputPatch = snapshot.outputPatch
      const results = expectedLabels.map(({ outputIndex, expectedSourceName }) => {
        const patch = outputPatch?.analogOutputs?.find((p) => p.outputIndex === outputIndex)
        return {
          outputIndex,
          expectedSourceName,
          actualSourceIndex: patch?.sourceIndex ?? null,
          actualSourceName: patch?.sourceName ?? null,
          confidence: 'not_verifiable_with_current_adapter',
          note: 'Source name mapping not probe-confirmed. Run: pnpm probe-routing diff --kind bus-to-output',
        }
      })
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        status: 'partial', globalConfidence: 'not_verifiable_with_current_adapter',
        results, probeInstruction: 'pnpm probe-routing diff --before before.json --after after.json --kind bus-to-output',
      }, null, 2) }] }
    },
  )

  // ─── get_fat_channel ──────────────────────────────────────────────────────
  // @implements #95 REQ-F-FAT-001
  server.tool(
    'get_fat_channel',
    'Return the Fat Channel DSP state (EQ model, compressor, gate, limiter, HPF frequency) for a single channel. Faster than reading the full channel list when only Fat Channel data is needed for one channel. Parameter confidence is "guessed" until probe-fat-channel calibration is run.',
    {
      deviceId: z.string(),
      channelId: z.string().describe('Channel ID, e.g. "line.ch1", "line.ch8"'),
    },
    async ({ deviceId, channelId }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const ch = snapshot.channels.find((c) => c.id === channelId)
      if (!ch) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found. Check channelId format (e.g. "line.ch1").` }) }], isError: true }
      }
      const fatState: ChannelFatState | null = ch.fatChannel ?? null
      return { content: [{ type: 'text' as const, text: JSON.stringify({ channelId, channelName: ch.name, fatState }, null, 2) }] }
    },
  )

  // ─── validate_fat_channel_for_source ──────────────────────────────────────
  // @implements #96 REQ-F-FAT-002
  server.tool(
    'validate_fat_channel_for_source',
    'Check Fat Channel settings against source-type expectations (HPF engaged, gate enabled, compressor enabled, limiter enabled). Returns per-check pass/fail results with parameter confidence annotation. The agent provides the source type; the MCP checks the actual Fat Channel state.',
    {
      deviceId: z.string(),
      channelId: z.string().describe('Channel ID, e.g. "line.ch1"'),
      sourceType: z.enum(['vocal', 'kick', 'snare', 'bass', 'guitar', 'keys', 'drum_room', 'overhead', 'brass', 'strings', 'generic'])
        .describe('Source type from rider — determines which Fat Channel checks are applied'),
      expectedCompEnabled: z.boolean().optional().describe('Override: expect compressor to be enabled'),
      expectedGateEnabled: z.boolean().optional().describe('Override: expect gate to be enabled'),
      expectedHpfHz: z.number().optional().describe('Override: expect HPF at or above this frequency (Hz)'),
    },
    async ({ deviceId, channelId, sourceType, expectedCompEnabled, expectedGateEnabled, expectedHpfHz }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const ch = snapshot.channels.find((c) => c.id === channelId)
      if (!ch) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found.` }) }], isError: true }
      }
      const fat = ch.fatChannel
      if (!fat) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ channelId, sourceType, status: 'no_fat_channel_state', note: 'Fat Channel state not present — try refresh_mixer_state first.' }) }] }
      }

      // Per-source-type default expectations (guidance, not hard rules)
      type SourceRule = { hpfMinHz?: number; compExpected?: boolean; gateExpected?: boolean; limiterExpected?: boolean }
      const SOURCE_RULES: Record<string, SourceRule> = {
        vocal:      { hpfMinHz: 80,  compExpected: true,  gateExpected: false, limiterExpected: false },
        kick:       { hpfMinHz: 0,   compExpected: true,  gateExpected: true,  limiterExpected: false },
        snare:      { hpfMinHz: 80,  compExpected: true,  gateExpected: true,  limiterExpected: false },
        bass:       { hpfMinHz: 0,   compExpected: true,  gateExpected: false, limiterExpected: false },
        guitar:     { hpfMinHz: 80,  compExpected: false, gateExpected: false, limiterExpected: false },
        keys:       { hpfMinHz: 40,  compExpected: false, gateExpected: false, limiterExpected: false },
        drum_room:  { hpfMinHz: 60,  compExpected: true,  gateExpected: false, limiterExpected: false },
        overhead:   { hpfMinHz: 80,  compExpected: false, gateExpected: false, limiterExpected: false },
        brass:      { hpfMinHz: 80,  compExpected: false, gateExpected: false, limiterExpected: false },
        strings:    { hpfMinHz: 60,  compExpected: false, gateExpected: false, limiterExpected: false },
        generic:    {},
      }
      const rule = SOURCE_RULES[sourceType] ?? {}

      const checks: Array<{ check: string; passed: boolean | null; detail: string }> = []
      const warnings: string[] = []

      // HPF check
      const hpfMin = expectedHpfHz ?? rule.hpfMinHz
      if (hpfMin !== undefined && hpfMin > 0) {
        const hpfHz = fat.hpfFrequencyHz
        if (hpfHz === undefined) {
          checks.push({ check: 'hpf_engaged', passed: null, detail: 'HPF frequency not in state — run refresh_mixer_state' })
        } else if (hpfHz < hpfMin) {
          checks.push({ check: 'hpf_engaged', passed: false, detail: `HPF at ${Math.round(hpfHz)} Hz (expected ≥ ${hpfMin} Hz for ${sourceType})` })
          warnings.push(`HPF too low for ${sourceType}: ${Math.round(hpfHz)} Hz`)
        } else {
          checks.push({ check: 'hpf_engaged', passed: true, detail: `HPF at ${Math.round(hpfHz)} Hz ≥ ${hpfMin} Hz` })
        }
      }

      // Compressor check
      const compExp = expectedCompEnabled ?? rule.compExpected
      if (compExp !== undefined) {
        const compOn = fat.comp?.enabled
        if (compOn === undefined) {
          checks.push({ check: 'compressor_enabled', passed: null, detail: 'Compressor state not in snapshot' })
        } else if (compOn !== compExp) {
          checks.push({ check: 'compressor_enabled', passed: false, detail: `Compressor is ${compOn ? 'on' : 'off'} (expected ${compExp ? 'on' : 'off'} for ${sourceType})` })
          if (compExp) warnings.push(`Compressor off — recommended for ${sourceType}`)
        } else {
          checks.push({ check: 'compressor_enabled', passed: true, detail: `Compressor ${compOn ? 'on' : 'off'} as expected` })
        }
      }

      // Gate check
      const gateExp = expectedGateEnabled ?? rule.gateExpected
      if (gateExp !== undefined && gateExp) {
        const gateOn = fat.gate?.enabled
        if (gateOn === undefined) {
          checks.push({ check: 'gate_enabled', passed: null, detail: 'Gate state not in snapshot' })
        } else if (!gateOn) {
          checks.push({ check: 'gate_enabled', passed: false, detail: `Gate is off (recommended for ${sourceType})` })
          warnings.push(`Gate off — recommended for ${sourceType}`)
        } else {
          checks.push({ check: 'gate_enabled', passed: true, detail: 'Gate enabled as expected' })
        }
      }

      const passedAll = checks.every((c) => c.passed !== false)
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        channelId, channelName: ch.name, sourceType, status: passedAll ? 'ok' : 'warning',
        checks, warnings, parameterConfidence: fat.parameterConfidence ?? 'guessed',
      }, null, 2) }] }
    },
  )

  // ─── list_sub_groups (read-only, always registered) ─────────────────────
  // @implements REQ-F-WRITE-005b (#86)
  server.tool(
    'list_sub_groups',
    'Return all fixed hardware sub group buses (Sub A–D) with their names, stereolink state, and full member channel list (includes fxreturn channels). Read-only — no mixer changes.',
    { deviceId: z.string() },
    async ({ deviceId }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }) }], isError: true }
      }
      const topology = extractFixedSubGroups(snapshot.flatState)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ deviceId, capturedAt: snapshot.capturedAt, ...topology }, null, 2) }] }
    },
  )

  // ─── Write tools (registered only when writeEnabled=true — ADR-005 #10, ADR-006) ───
  if (config.writeEnabled) {
    // Inform future maintainers: write tools are intentionally limited.
    // Add new write tools here ONLY after:
    //   1. Updating or creating an ADR for the change
    //   2. Implementing ProposedChangeSet flow (no direct write without proposal)
    //   3. Full audit log + expiry on changeSetId
    //   4. Tests covering the unhappy path (expired set, invalid value, write-disabled)

    // ─── propose_eq_change ─────────────────────────────────────────────────────
    server.tool(
      'propose_eq_change',
      'Propose an EQ parameter change for a channel. Returns a changeSetId that must be passed to apply_change_set to execute. No mixer change occurs from this call alone.',
      {
        deviceId: z.string().describe('Device ID from discover_mixers'),
        channelId: z.string().describe('Channel ID, e.g. "line.ch1"'),
        band: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
          .describe('EQ band number (1–4)'),
        parameter: z.enum(['gain', 'freq', 'q'])
          .describe('Parameter to change: "gain" (dB), "freq" (Hz), or "q" (factor)'),
        value: z.number()
          .describe('Proposed value in real units: dB for gain, Hz for freq, dimensionless for q'),
      },
      async ({ deviceId, channelId, band, parameter, value }) => {
        pruneExpiredChangeSets()

        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected or no snapshot available. Run discover_mixers first.' }) }],
            isError: true,
          }
        }

        const channel = snap.channels.find((c) => c.id === channelId)
        if (!channel) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found in snapshot` }) }],
            isError: true,
          }
        }

        // Build the flat state key for this EQ band parameter
        const paramKeyMap: Record<string, string> = {
          gain: `${channelId}.eq.eqgain${band}`,
          freq: `${channelId}.eq.eqfreq${band}`,
          q:    `${channelId}.eq.eqq${band}`,
        }
        const flatKey = paramKeyMap[parameter]!

        // Read current raw value from flat state
        const currentRaw = typeof snap.flatState[flatKey] === 'number'
          ? (snap.flatState[flatKey] as number)
          : null

        // Compute proposed normalized value using inverse de-normalization
        let proposedRaw: number
        let currentDisplay: string
        let proposedDisplay: string
        const unit = parameter === 'gain' ? 'dB' : parameter === 'freq' ? 'Hz' : ''

        if (parameter === 'gain') {
          proposedRaw = eqGainDbToNormalized(value)
          currentDisplay = currentRaw !== null ? `${normalizedToEqGainDb(currentRaw).toFixed(1)} dB` : '(unknown)'
          proposedDisplay = `${value.toFixed(1)} dB`
        } else if (parameter === 'freq') {
          proposedRaw = eqFreqHzToNormalized(value)
          currentDisplay = currentRaw !== null ? `${Math.round(normalizedToEqFreqHz(currentRaw))} Hz` : '(unknown)'
          proposedDisplay = `${Math.round(value)} Hz`
        } else {  // q
          proposedRaw = eqQToNormalized(value)
          currentDisplay = currentRaw !== null ? normalizedToEqQ(currentRaw).toFixed(2) : '(unknown)'
          proposedDisplay = value.toFixed(2)
        }

        const channelLabel = channel.name ?? channelId
        const description = `Set EQ band ${band} ${parameter} on ${channelLabel} from ${currentDisplay} to ${proposedDisplay}${unit ? ' ' + unit : ''}`

        const now = Date.now()
        const changeSetId = randomUUID()
        const proposedAt = new Date(now).toISOString()
        const expiresAt = new Date(now + CHANGESET_TTL_MS).toISOString()

        const changeSet: ProposedChangeSet = {
          changeSetId,
          deviceId,
          channelId,
          proposedAt,
          expiresAt,
          changes: [{
            parameter: `eq.${parameter}${band}` as ProposedChangeSet['changes'][0]['parameter'],
            rawKeyPath: flatKey,
            currentRawValue: currentRaw,
            proposedRawValue: proposedRaw,
            currentDisplayValue: currentDisplay,
            proposedDisplayValue: proposedDisplay,
          }],
          description,
          changeSetConfidence: 'guessed' as const,
        }

        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }],
        }
      },
    )

    // ─── apply_change_set ──────────────────────────────────────────────────────
    server.tool(
      'apply_change_set',
      'Apply a previously proposed change set to the mixer. Requires the changeSetId returned by propose_eq_change and a confirmation note from the operator. ChangeSetId expires after 60 seconds.',
      {
        deviceId: z.string().describe('Device ID — must match the one in the proposed change set'),
        changeSetId: z.string().uuid().describe('UUID returned by propose_eq_change'),
        confirmationNote: z.string()
          .min(3)
          .describe('Operator confirmation note, e.g. "Kick drum EQ adjustment approved by engineer"'),
      },
      async ({ deviceId, changeSetId, confirmationNote }) => {
        pruneExpiredChangeSets()

        const entry = changeSets.get(changeSetId)
        if (!entry) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `changeSetId '${changeSetId}' not found or expired (TTL: 60 s). Regenerate with propose_eq_change.` }) }],
            isError: true,
          }
        }
        if (entry.set.deviceId !== deviceId) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `changeSetId device mismatch: expected '${entry.set.deviceId}'` }) }],
            isError: true,
          }
        }

        const errors: string[] = []
        for (const change of entry.set.changes) {
          try {
            // Dispatch: string writes (username) use applyStringChange; numeric use applyChange
            if (change.parameter === 'username' && change.proposedStringValue != null) {
              await clientManager.applyStringChange(deviceId, change.rawKeyPath, change.proposedStringValue)
            } else if (change.proposedRawValue != null) {
              await clientManager.applyChange(deviceId, change.rawKeyPath, change.proposedRawValue)
            } else {
              errors.push(`Skipped ${change.parameter}: no proposedRawValue or proposedStringValue`)
            }
          } catch (err) {
            errors.push(`Failed to apply ${change.parameter}: ${String(err)}`)
          }
        }

        changeSets.delete(changeSetId)  // consume the changeSet

        const appliedAt = new Date().toISOString()
        const auditEntry = {
          changeSetId,
          deviceId,
          channelId: entry.set.channelId,
          appliedAt,
          operatorNote: confirmationNote,
          appliedChanges: entry.set.changes,
          errors: errors.length > 0 ? errors : undefined,
        }

        // Audit log to stderr (persistent audit file can be added later)
        process.stderr.write(`[presonus-mcp] AUDIT ${JSON.stringify(auditEntry)}\n`)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: errors.length === 0,
              appliedAt,
              description: entry.set.description,
              errors: errors.length > 0 ? errors : undefined,
            }, null, 2),
          }],
          isError: errors.length > 0,
        }
      },
    )

    // ─── prepare_mute_change_set ─────────────────────────────────────────
    server.tool(
      'prepare_mute_change_set',
      'Prepare a change set to mute or unmute a channel. Returns a changeSetId to pass to apply_change_set. CONFIDENCE: observed (mute key confirmed on 32SC).',
      {
        deviceId: z.string(),
        channelId: z.string().describe('Channel ID, e.g. "line.ch1"'),
        muted: z.boolean().describe('true = mute the channel, false = unmute'),
      },
      async ({ deviceId, channelId, muted }) => {
        pruneExpiredChangeSets()
        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
        const ch = snap.channels.find((c) => c.id === channelId)
        if (!ch) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found.` }) }], isError: true }
        const flatKey = `${channelId}.mute`
        const currentRaw = typeof snap.flatState[flatKey] === 'number' ? (snap.flatState[flatKey] as number) : null
        const proposedRaw = muted ? 1.0 : 0.0
        const now = Date.now()
        const changeSetId = randomUUID()
        const changeSet: ProposedChangeSet = {
          changeSetId, deviceId, channelId,
          proposedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHANGESET_TTL_MS).toISOString(),
          changes: [{ parameter: 'mute', rawKeyPath: flatKey, currentRawValue: currentRaw, proposedRawValue: proposedRaw,
            currentDisplayValue: ch.mute === true ? 'muted' : 'active',
            proposedDisplayValue: muted ? 'muted' : 'active' }],
          description: `${muted ? 'Mute' : 'Unmute'} channel ${ch.name ?? channelId}`,
          changeSetConfidence: 'observed' as const,
        }
        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }] }
      },
    )

    // ─── prepare_fader_change_set ─────────────────────────────────────────
    server.tool(
      'prepare_fader_change_set',
      'Prepare a change set to set a channel fader level. levelLinear: 0.0 = off, 0.75 = approx unity (0 dBFS), 1.0 = maximum. CONFIDENCE: guessed — fader taper not probe-confirmed.',
      {
        deviceId: z.string(),
        channelId: z.string().describe('Channel ID, e.g. "line.ch1"'),
        levelLinear: z.number().min(0).max(1).describe('Fader level 0.0–1.0 (0.75 ≈ unity gain, guessed)'),
      },
      async ({ deviceId, channelId, levelLinear }) => {
        pruneExpiredChangeSets()
        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
        const ch = snap.channels.find((c) => c.id === channelId)
        if (!ch) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found.` }) }], isError: true }
        const flatKey = `${channelId}.volume`
        const currentRaw = typeof snap.flatState[flatKey] === 'number' ? (snap.flatState[flatKey] as number) : null
        const now = Date.now()
        const changeSetId = randomUUID()
        const changeSet: ProposedChangeSet = {
          changeSetId, deviceId, channelId,
          proposedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHANGESET_TTL_MS).toISOString(),
          changes: [{ parameter: 'fader', rawKeyPath: flatKey, currentRawValue: currentRaw, proposedRawValue: levelLinear,
            currentDisplayValue: currentRaw !== null ? currentRaw.toFixed(3) : '(unknown)',
            proposedDisplayValue: levelLinear.toFixed(3) }],
          description: `Set fader on ${ch.name ?? channelId} to ${levelLinear.toFixed(3)} (guessed taper)`,
          changeSetConfidence: 'guessed' as const,
        }
        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }] }
      },
    )

    // ─── prepare_aux_send_change_set ─────────────────────────────────────
    server.tool(
      'prepare_aux_send_change_set',
      'Prepare a change set to adjust a channel\'s send level to an aux mix bus. levelLinear 0.0–1.0. CONFIDENCE: inferred (aux send key pattern observed, de-normalization unverified).',
      {
        deviceId: z.string(),
        channelId: z.string().describe('Source channel ID, e.g. "line.ch1"'),
        auxBus: z.number().int().min(1).max(32).describe('Destination aux bus number (1–32)'),
        levelLinear: z.number().min(0).max(1).describe('Send level 0.0–1.0'),
      },
      async ({ deviceId, channelId, auxBus, levelLinear }) => {
        pruneExpiredChangeSets()
        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
        const ch = snap.channels.find((c) => c.id === channelId)
        if (!ch) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found.` }) }], isError: true }
        const flatKey = `${channelId}.aux${auxBus}`
        const currentRaw = typeof snap.flatState[flatKey] === 'number' ? (snap.flatState[flatKey] as number) : null
        const now = Date.now()
        const changeSetId = randomUUID()
        // Use eq.gain1 slot in ChangeParameter — aux_send not in enum; store as fader (closest match)
        const changeSet: ProposedChangeSet = {
          changeSetId, deviceId, channelId,
          proposedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHANGESET_TTL_MS).toISOString(),
          changes: [{ parameter: 'fader' as const, rawKeyPath: flatKey, currentRawValue: currentRaw, proposedRawValue: levelLinear,
            currentDisplayValue: currentRaw !== null ? currentRaw.toFixed(3) : '(unknown)',
            proposedDisplayValue: levelLinear.toFixed(3) }],
          description: `Set ${ch.name ?? channelId} send to Aux ${auxBus} to ${levelLinear.toFixed(3)}`,
          changeSetConfidence: 'inferred' as const,
        }
        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }] }
      },
    )

    // ─── prepare_fat_channel_change_set ─────────────────────────────────
    server.tool(
      'prepare_fat_channel_change_set',
      'Prepare a change set for compressor, gate, or limiter parameters. All de-normalization formulas are CONFIDENCE: guessed — verify with probe-fat-channel before use on a real show.',
      {
        deviceId: z.string(),
        channelId: z.string().describe('Channel ID, e.g. "line.ch1"'),
        compressor: z.object({
          enabled: z.boolean().optional(),
          thresholdDb: z.number().optional().describe('Threshold −60 to 0 dBFS'),
          makeupDb: z.number().optional().describe('Makeup gain 0–24 dB'),
          ratioX: z.number().optional().describe('Ratio 1–16×'),
          attackMs: z.number().optional().describe('Attack 0–150 ms'),
          releaseMs: z.number().optional().describe('Release 0–2000 ms'),
        }).optional(),
        gate: z.object({
          enabled: z.boolean().optional(),
          thresholdDb: z.number().optional().describe('Threshold −80 to 0 dBFS'),
          attackMs: z.number().optional().describe('Attack 0–150 ms'),
          releaseMs: z.number().optional().describe('Release 0–2000 ms'),
          rangeDb: z.number().optional().describe('Range 0 to −80 dB'),
        }).optional(),
        limiter: z.object({
          enabled: z.boolean().optional(),
          thresholdDb: z.number().optional().describe('Threshold −20 to 0 dBFS'),
          releaseMs: z.number().optional().describe('Release 0–2000 ms'),
        }).optional(),
      },
      async ({ deviceId, channelId, compressor, gate, limiter }) => {
        pruneExpiredChangeSets()
        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
        const ch = snap.channels.find((c) => c.id === channelId)
        if (!ch) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found.` }) }], isError: true }

        const changes: ProposedChangeSet['changes'] = []
        const f = (suffix: string) => snap.flatState[`${channelId}${suffix}`]

        if (compressor) {
          if (compressor.enabled !== undefined) changes.push({ parameter: 'comp.enabled', rawKeyPath: `${channelId}.comp.on`, currentRawValue: typeof f('.comp.on') === 'number' ? f('.comp.on') as number : null, proposedRawValue: compressor.enabled ? 1 : 0, currentDisplayValue: String(f('.comp.on')), proposedDisplayValue: compressor.enabled ? 'on' : 'off' })
          if (compressor.thresholdDb !== undefined) changes.push({ parameter: 'comp.threshold', rawKeyPath: `${channelId}.comp.input`, currentRawValue: typeof f('.comp.input') === 'number' ? f('.comp.input') as number : null, proposedRawValue: compThresholdDbToNormalized(compressor.thresholdDb), currentDisplayValue: typeof f('.comp.input') === 'number' ? `${normalizedToCompThresholdDb(f('.comp.input') as number).toFixed(1)} dBFS` : '(unknown)', proposedDisplayValue: `${compressor.thresholdDb.toFixed(1)} dBFS` })
          if (compressor.makeupDb !== undefined) changes.push({ parameter: 'comp.makeup', rawKeyPath: `${channelId}.comp.output`, currentRawValue: typeof f('.comp.output') === 'number' ? f('.comp.output') as number : null, proposedRawValue: compMakeupDbToNormalized(compressor.makeupDb), currentDisplayValue: typeof f('.comp.output') === 'number' ? `${normalizedToCompMakeupDb(f('.comp.output') as number).toFixed(1)} dB` : '(unknown)', proposedDisplayValue: `${compressor.makeupDb.toFixed(1)} dB` })
          if (compressor.ratioX !== undefined) changes.push({ parameter: 'comp.ratio', rawKeyPath: `${channelId}.comp.ratio`, currentRawValue: typeof f('.comp.ratio') === 'number' ? f('.comp.ratio') as number : null, proposedRawValue: compRatioXToNormalized(compressor.ratioX), currentDisplayValue: typeof f('.comp.ratio') === 'number' ? `${normalizedToCompRatioX(f('.comp.ratio') as number).toFixed(1)}×` : '(unknown)', proposedDisplayValue: `${compressor.ratioX.toFixed(1)}×` })
          if (compressor.attackMs !== undefined) changes.push({ parameter: 'comp.attack', rawKeyPath: `${channelId}.comp.attack`, currentRawValue: typeof f('.comp.attack') === 'number' ? f('.comp.attack') as number : null, proposedRawValue: attackMsToNormalized(compressor.attackMs), currentDisplayValue: typeof f('.comp.attack') === 'number' ? `${normalizedToAttackMs(f('.comp.attack') as number).toFixed(0)} ms` : '(unknown)', proposedDisplayValue: `${compressor.attackMs.toFixed(0)} ms` })
          if (compressor.releaseMs !== undefined) changes.push({ parameter: 'comp.release', rawKeyPath: `${channelId}.comp.release`, currentRawValue: typeof f('.comp.release') === 'number' ? f('.comp.release') as number : null, proposedRawValue: releaseMsToNormalized(compressor.releaseMs), currentDisplayValue: typeof f('.comp.release') === 'number' ? `${normalizedToReleaseMs(f('.comp.release') as number).toFixed(0)} ms` : '(unknown)', proposedDisplayValue: `${compressor.releaseMs.toFixed(0)} ms` })
        }
        if (gate) {
          if (gate.enabled !== undefined) changes.push({ parameter: 'gate.enabled', rawKeyPath: `${channelId}.gate.on`, currentRawValue: typeof f('.gate.on') === 'number' ? f('.gate.on') as number : null, proposedRawValue: gate.enabled ? 1 : 0, currentDisplayValue: String(f('.gate.on')), proposedDisplayValue: gate.enabled ? 'on' : 'off' })
          if (gate.thresholdDb !== undefined) changes.push({ parameter: 'gate.threshold', rawKeyPath: `${channelId}.gate.threshold`, currentRawValue: typeof f('.gate.threshold') === 'number' ? f('.gate.threshold') as number : null, proposedRawValue: gateThresholdDbToNormalized(gate.thresholdDb), currentDisplayValue: typeof f('.gate.threshold') === 'number' ? `${normalizedToGateThresholdDb(f('.gate.threshold') as number).toFixed(1)} dBFS` : '(unknown)', proposedDisplayValue: `${gate.thresholdDb.toFixed(1)} dBFS` })
          if (gate.attackMs !== undefined) changes.push({ parameter: 'gate.attack', rawKeyPath: `${channelId}.gate.attack`, currentRawValue: typeof f('.gate.attack') === 'number' ? f('.gate.attack') as number : null, proposedRawValue: attackMsToNormalized(gate.attackMs), currentDisplayValue: typeof f('.gate.attack') === 'number' ? `${normalizedToAttackMs(f('.gate.attack') as number).toFixed(0)} ms` : '(unknown)', proposedDisplayValue: `${gate.attackMs.toFixed(0)} ms` })
          if (gate.releaseMs !== undefined) changes.push({ parameter: 'gate.release', rawKeyPath: `${channelId}.gate.release`, currentRawValue: typeof f('.gate.release') === 'number' ? f('.gate.release') as number : null, proposedRawValue: releaseMsToNormalized(gate.releaseMs), currentDisplayValue: typeof f('.gate.release') === 'number' ? `${normalizedToReleaseMs(f('.gate.release') as number).toFixed(0)} ms` : '(unknown)', proposedDisplayValue: `${gate.releaseMs.toFixed(0)} ms` })
          if (gate.rangeDb !== undefined) changes.push({ parameter: 'gate.threshold' as const, rawKeyPath: `${channelId}.gate.range`, currentRawValue: typeof f('.gate.range') === 'number' ? f('.gate.range') as number : null, proposedRawValue: gateRangeDbToNormalized(gate.rangeDb), currentDisplayValue: typeof f('.gate.range') === 'number' ? `${normalizedToGateRangeDb(f('.gate.range') as number).toFixed(1)} dB` : '(unknown)', proposedDisplayValue: `${gate.rangeDb.toFixed(1)} dB` })
        }
        if (limiter) {
          if (limiter.enabled !== undefined) changes.push({ parameter: 'limiter.enabled', rawKeyPath: `${channelId}.limit.on`, currentRawValue: typeof f('.limit.on') === 'number' ? f('.limit.on') as number : null, proposedRawValue: limiter.enabled ? 1 : 0, currentDisplayValue: String(f('.limit.on')), proposedDisplayValue: limiter.enabled ? 'on' : 'off' })
          if (limiter.thresholdDb !== undefined) changes.push({ parameter: 'limiter.threshold', rawKeyPath: `${channelId}.limit.input`, currentRawValue: typeof f('.limit.input') === 'number' ? f('.limit.input') as number : null, proposedRawValue: limiterThresholdDbToNormalized(limiter.thresholdDb), currentDisplayValue: typeof f('.limit.input') === 'number' ? `${normalizedToLimiterThresholdDb(f('.limit.input') as number).toFixed(1)} dBFS` : '(unknown)', proposedDisplayValue: `${limiter.thresholdDb.toFixed(1)} dBFS` })
          if (limiter.releaseMs !== undefined) changes.push({ parameter: 'limiter.release', rawKeyPath: `${channelId}.limit.release`, currentRawValue: typeof f('.limit.release') === 'number' ? f('.limit.release') as number : null, proposedRawValue: releaseMsToNormalized(limiter.releaseMs), currentDisplayValue: typeof f('.limit.release') === 'number' ? `${normalizedToReleaseMs(f('.limit.release') as number).toFixed(0)} ms` : '(unknown)', proposedDisplayValue: `${limiter.releaseMs.toFixed(0)} ms` })
        }

        if (changes.length === 0) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No parameters specified. Provide at least one of: compressor, gate, limiter.' }) }], isError: true }
        }

        const now = Date.now()
        const changeSetId = randomUUID()
        const changeSet: ProposedChangeSet = {
          changeSetId, deviceId, channelId,
          proposedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHANGESET_TTL_MS).toISOString(),
          changes,
          description: `Fat Channel changes on ${ch.name ?? channelId}: ${changes.map((c) => c.parameter).join(', ')} [CONFIDENCE: guessed — verify before applying]`,
          changeSetConfidence: 'guessed' as const,
        }
        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }] }
      },
    )

    // ─── validate_change_set ──────────────────────────────────────────────────
    server.tool(
      'validate_change_set',
      'Validate a change set by ID: checks that it exists, has not expired, and belongs to the specified device. Does NOT apply the change. Use before apply_change_set to confirm validity.',
      {
        deviceId: z.string(),
        changeSetId: z.string().uuid().describe('UUID returned by a prepare_*_change_set tool'),
      },
      async ({ deviceId, changeSetId }) => {
        pruneExpiredChangeSets()
        const entry = changeSets.get(changeSetId)
        if (!entry) return { content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, reason: `changeSetId '${changeSetId}' not found or expired (TTL: 60 s).` }) }] }
        if (entry.set.deviceId !== deviceId) return { content: [{ type: 'text' as const, text: JSON.stringify({ valid: false, reason: `changeSetId belongs to device '${entry.set.deviceId}', not '${deviceId}'.` }) }] }
        const ttlRemaining = Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000))
        return { content: [{ type: 'text' as const, text: JSON.stringify({ valid: true, changeSetId, deviceId, channelId: entry.set.channelId, description: entry.set.description, changeCount: entry.set.changes.length, ttlRemainingSeconds: ttlRemaining, changes: entry.set.changes.map((c) => ({ parameter: c.parameter, current: c.currentDisplayValue, proposed: c.proposedDisplayValue })) }, null, 2) }] }
      },
    )

    // ─── prepare_channel_rename_change_set ────────────────────────────────────
    // @implements REQ-F-WRITE-005a (#86)
    server.tool(
      'prepare_channel_rename_change_set',
      'Prepare a change set to rename a channel (update its scribble-strip username label). Accepts any channel type: line.chN, fxreturn.chN, sub.chN, aux.chN, fxbus.chN, main.chN. Returns changeSetId to pass to apply_change_set. Name must be 1–16 chars.',
      {
        deviceId: z.string(),
        channelId: z.string().describe('Full channel ID, e.g. "line.ch11", "fxreturn.ch4", "sub.ch4"'),
        newName: z.string().min(1).max(16).describe('New channel name (scribble strip label, max 16 chars)'),
      },
      async ({ deviceId, channelId, newName }) => {
        pruneExpiredChangeSets()
        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
        if (!newName || newName.trim().length === 0) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'newName must not be empty.' }) }], isError: true }
        }
        if (newName.length > 16) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `newName length ${newName.length} exceeds max 16 chars.` }) }], isError: true }
        }
        const usernameKey = `${channelId}.username`
        if (!(usernameKey in snap.flatState)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found — no '${usernameKey}' key in current state.` }) }], isError: true }
        }
        const currentName = String(snap.flatState[usernameKey] ?? '')
        const now = Date.now()
        const changeSetId = randomUUID()
        const changeSet: ProposedChangeSet = {
          changeSetId, deviceId, channelId,
          proposedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHANGESET_TTL_MS).toISOString(),
          changes: [{
            parameter: 'username',
            rawKeyPath: usernameKey,
            currentRawValue: null,
            proposedRawValue: null,
            proposedStringValue: newName,
            currentDisplayValue: currentName,
            proposedDisplayValue: newName,
          }],
          description: `Rename ${channelId} from "${currentName}" to "${newName}"`,
          changeSetConfidence: 'observed' as const,
        }
        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }] }
      },
    )

    // ─── prepare_sub_group_membership_change_set ──────────────────────────────
    // @implements REQ-F-WRITE-005c (#86)
    server.tool(
      'prepare_sub_group_membership_change_set',
      'Prepare a change set to add or remove a channel from a fixed hardware sub group bus (Sub A=1, Sub B=2, Sub C=3, Sub D=4). Supported channel types: line.chN, fxreturn.chN. Returns changeSetId.',
      {
        deviceId: z.string(),
        channelId: z.string().describe('Channel ID, e.g. "line.ch16" or "fxreturn.ch4"'),
        subGroupIndex: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
          .describe('Sub group number: 1=Sub A, 2=Sub B, 3=Sub C, 4=Sub D'),
        assigned: z.boolean().describe('true = add to group, false = remove from group'),
      },
      async ({ deviceId, channelId, subGroupIndex, assigned }) => {
        pruneExpiredChangeSets()
        if (!/^(line|fxreturn)\.ch\d+$/.test(channelId)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unsupported channelId '${channelId}'. Use line.chN or fxreturn.chN.` }) }], isError: true }
        }
        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
        const flatKey = `${channelId}.sub${subGroupIndex}`
        const currentRaw = typeof snap.flatState[flatKey] === 'number' ? (snap.flatState[flatKey] as number) : null
        const subName = ['Sub A', 'Sub B', 'Sub C', 'Sub D'][subGroupIndex - 1]!
        const now = Date.now()
        const changeSetId = randomUUID()
        const changeSet: ProposedChangeSet = {
          changeSetId, deviceId, channelId,
          proposedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHANGESET_TTL_MS).toISOString(),
          changes: [{
            parameter: 'sub.membership',
            rawKeyPath: flatKey,
            currentRawValue: currentRaw,
            proposedRawValue: assigned ? 1.0 : 0.0,
            currentDisplayValue: currentRaw === 1 ? 'assigned' : 'unassigned',
            proposedDisplayValue: assigned ? 'assigned' : 'unassigned',
          }],
          description: `${assigned ? 'Add' : 'Remove'} ${channelId} ${assigned ? 'to' : 'from'} ${subName}`,
          changeSetConfidence: 'observed' as const,
        }
        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }] }
      },
    )

    // ─── prepare_aux_assignment_change_set ────────────────────────────────────
    // @implements REQ-F-WRITE-005d (#86)
    server.tool(
      'prepare_aux_assignment_change_set',
      'Prepare a change set to assign or unassign a channel from a FlexMix aux bus. Controls assign_auxN key (channel routing assignment), NOT the send level. Returns changeSetId.',
      {
        deviceId: z.string(),
        channelId: z.string().describe('Source channel ID, e.g. "line.ch17"'),
        auxBus: z.number().int().min(1).max(32).describe('Aux bus number (1–32)'),
        assigned: z.boolean().describe('true = assign channel to aux bus, false = unassign'),
      },
      async ({ deviceId, channelId, auxBus, assigned }) => {
        pruneExpiredChangeSets()
        const snap = clientManager.getSnapshot(deviceId)
        if (!snap) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Device not connected.' }) }], isError: true }
        const ch = snap.channels.find((c) => c.id === channelId)
        if (!ch) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Channel '${channelId}' not found.` }) }], isError: true }
        const flatKey = `${channelId}.assign_aux${auxBus}`
        const currentRaw = snap.flatState[flatKey]
        const currentAssigned = currentRaw === true || currentRaw === 1
        const now = Date.now()
        const changeSetId = randomUUID()
        const changeSet: ProposedChangeSet = {
          changeSetId, deviceId, channelId,
          proposedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + CHANGESET_TTL_MS).toISOString(),
          changes: [{
            parameter: 'aux.assignment',
            rawKeyPath: flatKey,
            currentRawValue: currentAssigned ? 1.0 : 0.0,
            proposedRawValue: assigned ? 1.0 : 0.0,
            currentDisplayValue: currentAssigned ? 'assigned' : 'unassigned',
            proposedDisplayValue: assigned ? 'assigned' : 'unassigned',
          }],
          description: `${assigned ? 'Assign' : 'Unassign'} ${ch.name ?? channelId} ${assigned ? 'to' : 'from'} Aux ${auxBus}`,
          changeSetConfidence: 'observed' as const,
        }
        changeSets.set(changeSetId, { set: changeSet, expiresAt: now + CHANGESET_TTL_MS })
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeSet, null, 2) }] }
      },
    )
  }
}
