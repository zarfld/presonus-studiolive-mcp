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
import { discoverMixers, diagnoseChannel, analyzeLineCheckStep, extractAuxMixes, type PresonusClientManager } from '@presonus-mcp/adapter'
import {
  eqGainDbToNormalized,
  eqFreqHzToNormalized,
  eqQToNormalized,
  normalizedToEqGainDb,
  normalizedToEqFreqHz,
  normalizedToEqQ,
  type ProposedChangeSet,
  type NoSignalDiagnosis,
  type PatchSwapDetection,
  type RoutingValidationReport,
  type AuxMixAuditIssue,
  type AuxMixAuditResult,
  HOT_SEND_THRESHOLD_DB,
} from '@presonus-mcp/domain'

export interface ToolsConfig {
  /** When false (default): only read-only tools registered. Write tools: not registered. */
  writeEnabled: boolean
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
      const routing = {
        deviceId,
        capturedAt: snapshot.capturedAt,
        isStale: snapshot.isStale,
        channelCount: snapshot.channels.length,
        channels: snapshot.channels.map((ch) => ({
          channelId: ch.id,
          channelName: ch.name,
          sendRouting: ch.sendRouting,
        })),
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
        confidence: stageboxModeValue !== null ? 'inferred' : 'not_verifiable_with_current_adapter',
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

      const diagnosedIssues = checks.filter((c) => !['unmuted', 'active', 'clipping', 'disabled', 'present'].includes(c.result)).length
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
              confidence: 'guessed',
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

        // Name mismatch check
        if (ch.name && ch.name !== expected.name) {
          issues.push({ channel: expected.channel, issue: 'expected_name_mismatch', current: ch.name, expected: expected.name, severity: 'low' })
        }

        // Mute check
        if (ch.mute === true) {
          issues.push({ channel: expected.channel, issue: 'muted_expected_channel', current: 'muted', expected: 'active', severity: 'high' })
        }

        // Phantom power check (if key available in flatState)
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
          // muted = not assigned (assign_auxN = 0)
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
  // @architecture #47 ADR-008
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
  // @architecture #47 ADR-008
  server.tool(
    'find_hot_monitor_sends',
    'Find channels sending to an aux mix above a configurable threshold (default −6 dBFS). Only considers assigned and unmuted sends. Useful for detecting potential hearing damage risk in IEM/wedge mixes. Layer A: uses confirmed state keys.',
    {
      deviceId: z.string(),
      auxMixNumber: z.number().int().positive().describe('1-based aux mix number'),
      thresholdDb: z.number().optional().describe('Threshold in dBFS (default −6). Sends above this are reported as hot.'),
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
  // @architecture #47 ADR-008
  server.tool(
    'validate_aux_mix',
    'Zero-expectation audit of an aux mix: combines missing (unassigned/silent), muted, and hot send detection into a single AuxMixAuditResult. Does not require rider-provided expected sends. Layer A: uses confirmed state keys.',
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
        const result: AuxMixAuditResult = {
          auxMixNumber,
          name: `Aux ${auxMixNumber}`,
          masterLevel: 0,
          masterMuted: false,
          sendCount: 0,
          status: 'ok',
          issues: [],
          hotThresholdDb: threshold,
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      }

      const issues: AuxMixAuditIssue[] = []

      // Master muted
      if (mix.masterMuted) {
        issues.push({
          issueType: 'master_muted',
          auxMixNumber,
          channel: 0,
          channelName: mix.name,
          severity: 'high',
          detail: `Aux ${auxMixNumber} master output is muted`,
        })
      }

      for (const send of mix.sends) {
        if (send.muted) {
          issues.push({
            issueType: 'unassigned_send',
            auxMixNumber,
            channel: send.fromChannel,
            channelName: send.fromChannelName,
            severity: 'high',
            detail: `Channel not assigned to Aux ${auxMixNumber}`,
            level: send.level,
            levelDb: null,
          })
        } else if (send.level < 0.05) {
          const levelDb = send.level > 0 ? 20 * Math.log10(send.level) : null
          issues.push({
            issueType: 'very_low_send',
            auxMixNumber,
            channel: send.fromChannel,
            channelName: send.fromChannelName,
            severity: 'low',
            detail: `Send level very low (< 0.05 linear)`,
            level: send.level,
            levelDb,
          })
        } else if (send.level > 0) {
          const levelDb = 20 * Math.log10(send.level)
          if (levelDb > threshold) {
            issues.push({
              issueType: 'hot_send',
              auxMixNumber,
              channel: send.fromChannel,
              channelName: send.fromChannelName,
              severity: 'medium',
              detail: `Send level ${levelDb.toFixed(1)} dBFS exceeds threshold ${threshold} dBFS`,
              level: send.level,
              levelDb,
            })
          }
        }
      }

      const hasHigh = issues.some((i) => i.severity === 'high')
      const hasMedLow = issues.some((i) => i.severity === 'medium' || i.severity === 'low')
      const status = hasHigh ? 'problem' : hasMedLow ? 'warning' : 'ok'

      const result: AuxMixAuditResult = {
        auxMixNumber,
        name: mix.name,
        masterLevel: mix.masterLevel,
        masterMuted: mix.masterMuted,
        sendCount: mix.sends.length,
        status,
        issues,
        hotThresholdDb: threshold,
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── get_input_routing (Layer B stub) ─────────────────────────────────────
  // @implements #45 REQ-F-ROUT-011
  // @architecture #47 ADR-008: Layer B — probe-required, not verifiable with current adapter
  server.tool(
    'get_input_routing',
    'Layer B stub: physical input source routing (analog/digital/network → console channel) is not verifiable with the current adapter. Returns structured not_verifiable response with probe instructions.',
    { deviceId: z.string() },
    async ({ deviceId: _deviceId }) => {
      const probeSteps = [
        'pnpm probe-routing dump --device <IP> --out before-routing.json',
        '<In UC Surface: change one channel input source, e.g. Ch 1: Analog 1 → Network 1>',
        'pnpm probe-routing dump --device <IP> --out after-routing.json',
        'pnpm probe-routing diff --before before-routing.json --after after-routing.json --kind input-source',
        '<Identify the changed state key, update state-mapper.ts, set confidence: observed>',
      ]
      const result = {
        status: 'not_verifiable_with_current_adapter' as const,
        reason: 'Physical input source routing (analog/digital/network channel → console input) requires probe diff-state. No confirmed state key found yet for source selection on 32SC.',
        probeSteps,
        probeMarkdown: `## How to discover input routing state keys\n\n${probeSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── validate_avb_routing (Layer B stub) ──────────────────────────────────
  // @implements #45 REQ-F-ROUT-011
  // @architecture #47 ADR-008
  server.tool(
    'validate_avb_routing',
    'Layer B stub: AVB stream routing validation requires a 32R stagebox connected and a dedicated probe session. Returns structured not_verifiable response with probe instructions.',
    {
      deviceId: z.string(),
      expectedStreams: z.array(z.string()).optional().describe('Expected AVB stream names (for future use)'),
    },
    async ({ deviceId: _deviceId, expectedStreams: _expectedStreams }) => {
      const probeSteps = [
        'Connect StudioLive 32R stagebox via AVB',
        'pnpm probe-routing dump --device <FOH-IP> --out before-avb.json',
        '<In UC Surface: change one AVB stream assignment>',
        'pnpm probe-routing dump --device <FOH-IP> --out after-avb.json',
        'pnpm probe-routing diff --before before-avb.json --after after-avb.json --kind avb-stream',
        '<Identify changed key, update state-mapper.ts, mark confidence: observed>',
      ]
      const result = {
        status: 'not_verifiable_with_current_adapter' as const,
        reason: 'AVB stream mapping requires a 32R stagebox connected and a separate probe session. No confirmed state keys for AVB input assignment on FOH-only captures.',
        probeSteps,
        probeMarkdown: `## How to discover AVB routing state keys\n\n${probeSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ─── validate_output_routing (Layer B partial) ────────────────────────────
  // @implements #45 REQ-F-ROUT-011
  // @architecture #47 ADR-008
  server.tool(
    'validate_output_routing',
    'Layer B partial: output patch source index is known (from outputpatchrouter.mixN_src.value), but source name → index mapping is not yet probe-confirmed. Returns partial data with not_verifiable for source names.',
    {
      deviceId: z.string(),
      expectedOutputs: z.array(z.string()).optional().describe('Expected output source names (for future use)'),
    },
    async ({ deviceId, expectedOutputs: _expectedOutputs }) => {
      const snapshot = clientManager.getSnapshot(deviceId)
      const probeSteps = [
        'pnpm probe-routing dump --device <IP> --out before-patch.json',
        '<In UC Surface: Output → change one analog output source (e.g. Mix 1 → Aux 1)>',
        'pnpm probe-routing dump --device <IP> --out after-patch.json',
        'pnpm probe-routing diff --before before-patch.json --after after-patch.json --kind bus-to-output',
        '<Record sourceIndex value and map to source name in state-mapper.ts>',
      ]
      const unverified = {
        reason: 'Output patch source names (index 0–27 → source label) not yet probe-confirmed. Source indices are known; name mapping requires probe diff-state while reassigning outputs in UC Surface.',
        probeSteps,
        probeMarkdown: `## How to confirm output patch source names\n\n${probeSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      }

      if (!snapshot) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'partial', outputPatchIndex: null, unverified }) }] }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            status: 'partial',
            outputPatchIndex: snapshot.outputPatch ?? null,
            unverified,
          }, null, 2),
        }],
      }
    },
  )
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
            await clientManager.applyChange(deviceId, change.rawKeyPath, change.proposedRawValue)
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
  }
}
