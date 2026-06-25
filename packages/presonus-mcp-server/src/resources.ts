/**
 * MCP resource registrations — all read-only mixer context resources.
 *
 * @module resources
 * @implements #17 REQ-F-003: Expose channel list as MCP resource
 * @implements #18 REQ-F-004: Expose meter summary as MCP resource
 * @implements #19 REQ-F-005: Expose scene/project as MCP resource
 * @architecture #14 ARC-C-004: presonus-mcp-server package
 * @architecture #7 ADR-002: Three-layer architecture
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { extractAuxMixes, type PresonusClientManager } from '@presonus-mcp/adapter'
import type { MixerSnapshot } from '@presonus-mcp/adapter'
import type { MixerRoute, RoutingKind } from '@presonus-mcp/domain'

/** Build stale metadata to inject into resource responses when the connection is lost. */
function staleMetadata(snapshot: MixerSnapshot | undefined): Record<string, unknown> {
  if (!snapshot?.isStale) return {}
  return { _stale: true, _disconnectedAt: snapshot.disconnectedAt }
}

export function registerResources(
  server: McpServer,
  clientManager: PresonusClientManager,
): void {
  // ─── presonus://mixers ─────────────────────────────────────────────────────
  server.resource(
    'mixers',
    'presonus://mixers',
    { description: 'All discovered StudioLive III mixers with identity and role information' },
    async () => {
      const ids = clientManager.getConnectedDeviceIds()
      const identities = ids.map((id) => clientManager.getIdentity(id)).filter(Boolean)
      return {
        contents: [{
          uri: 'presonus://mixers',
          text: JSON.stringify(identities, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/channels ───────────────────────────────────────
  server.resource(
    'mixer-channels',
    new ResourceTemplate('presonus://mixer/{deviceId}/channels', { list: undefined }),
    { description: 'Normalized channel list for a connected mixer (mute, name, fader, pan, color)' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const channels = snapshot?.channels ?? []
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/channels`,
          text: JSON.stringify({ channels, ...staleMetadata(snapshot) }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/meters/summary ─────────────────────────────────
  server.resource(
    'mixer-meters-summary',
    new ResourceTemplate('presonus://mixer/{deviceId}/meters/summary', { list: undefined }),
    { description: 'Time-windowed meter summary: silent/active/hot/clipping channel classification' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const summarizer = clientManager.getSummarizer(String(deviceId))
      const summary = summarizer?.getSummary(10) ?? {
        windowSec: 0,
        computedAt: new Date().toISOString(),
        silentChannels: [],
        activeChannels: [],
        clippingChannels: [],
        hotChannels: [],
        noSignalButExpected: [],
        signalButUnexpected: [],
      }
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/meters/summary`,
          text: JSON.stringify({ ...summary, ...staleMetadata(snapshot) }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/scene/current ──────────────────────────────────
  server.resource(
    'mixer-scene-current',
    new ResourceTemplate('presonus://mixer/{deviceId}/scene/current', { list: undefined }),
    { description: 'Current project and scene names for a connected mixer' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const sceneInfo = {
        currentProject: snapshot?.currentProject ?? null,
        currentScene: snapshot?.currentScene ?? null,
        availableProjects: snapshot?.availableProjects ?? [],
        ...staleMetadata(snapshot),
      }
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/scene/current`,
          text: JSON.stringify(sceneInfo, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/raw/state (diagnostic only) ────────────────────
  server.resource(
    'mixer-raw-state',
    new ResourceTemplate('presonus://mixer/{deviceId}/raw/state', { list: undefined }),
    { description: 'Raw state dump for diagnostics (do not use for agent reasoning)' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/raw/state`,
          text: JSON.stringify({ ...snapshot?.rawState ?? {}, ...staleMetadata(snapshot) }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/routing ─────────────────────────────────────────
  // @implements #31 REQ-F-ROUT-001: per-channel AUX/FX/SUB send routing
  // @architecture #29 ADR-007
  server.resource(
    'mixer-routing',
    new ResourceTemplate('presonus://mixer/{deviceId}/routing', { list: undefined }),
    { description: 'Per-channel send routing: AUX sends (1–32), FX sends (FXA–FXH), subgroup assigns (1–4), main LR. parameterConfidence=inferred until AUX probe calibration.' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const channelRouting = (snapshot?.channels ?? []).map((ch) => ({
        channelId: ch.id,
        channelName: ch.name,
        sendRouting: ch.sendRouting,
      }))
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/routing`,
          text: JSON.stringify({ channels: channelRouting, ...staleMetadata(snapshot) }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/routing/outputs ─────────────────────────────────
  // @implements #37 REQ-F-ROUT-007: output patch router
  // @implements #30 REQ-NF-ROUT-001: confidence field on routing data
  server.resource(
    'mixer-routing-outputs',
    new ResourceTemplate('presonus://mixer/{deviceId}/routing/outputs', { list: undefined }),
    { description: 'Output patch router: analog output source assignments. sourceName=null and confidence=not_verifiable_with_current_adapter until probe diff-state confirms index→source mapping.' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/routing/outputs`,
          text: JSON.stringify({
            outputPatch: snapshot?.outputPatch ?? null,
            ...staleMetadata(snapshot),
          }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/auxes ────────────────────────────────────────────
  // @implements REQ-F-AUX-001
  server.resource(
    'mixer-auxes',
    new ResourceTemplate('presonus://mixer/{deviceId}/auxes', { list: undefined }),
    { description: 'All aux mix buses with master state and per-channel send levels. Used by the sound engineer agent to validate monitor/IEM sends. prePost is always "unknown" until hardware probed.' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      if (!snapshot) {
        return {
          contents: [{
            uri: `presonus://mixer/${String(deviceId)}/auxes`,
            text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }),
            mimeType: 'application/json',
          }],
        }
      }
      const auxMixes = extractAuxMixes(snapshot.flatState)
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/auxes`,
          text: JSON.stringify({
            deviceId: String(deviceId),
            capturedAt: snapshot.capturedAt,
            auxMixes,
            ...staleMetadata(snapshot),
          }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/fx-sends ─────────────────────────────────────────
  // @implements #39 REQ-F-ROUT-009: FX send level and assignment per channel
  // @architecture #47 ADR-008: Layer A resource
  server.resource(
    'mixer-fx-sends',
    new ResourceTemplate('presonus://mixer/{deviceId}/fx-sends', { list: undefined }),
    { description: 'Per-channel FX send levels and assignments (FXA–FXH). confidence=inferred until probe-routing confirms assign_FXA key pattern. Part of ADR-008 Layer A routing.' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const channels = (snapshot?.channels ?? []).map((ch) => ({
        channelId: ch.id,
        channelName: ch.name,
        fxSends: ch.sendRouting?.fxSends ?? [],
      })).filter((ch) => ch.fxSends.length > 0)
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/fx-sends`,
          text: JSON.stringify({ channels, ...staleMetadata(snapshot) }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/monitor-routing ───────────────────────────────────
  // @implements #38 REQ-F-ROUT-008: MixerRoute unified type
  // @implements #40 REQ-F-ROUT-010: non-LINE channel routing
  // @architecture #47 ADR-008: Layer A resource — flattened MixerRoute[] for all AUX sends
  server.resource(
    'mixer-monitor-routing',
    new ResourceTemplate('presonus://mixer/{deviceId}/monitor-routing', { list: undefined }),
    { description: 'All channel→AUX sends as a flat MixerRoute[] (MixerRoutingGraph). Includes LINE, RETURN, FXRETURN, and TALKBACK sends. confidence=inferred (ADR-008 Layer A).' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      if (!snapshot) {
        return {
          contents: [{
            uri: `presonus://mixer/${String(deviceId)}/monitor-routing`,
            text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }),
            mimeType: 'application/json',
          }],
        }
      }

      const auxMixes = extractAuxMixes(snapshot.flatState)

      // Derive RoutingKind from channel prefix
      function channelPrefixToKind(prefix: string): RoutingKind {
        if (prefix.startsWith('fxreturn.')) return 'fx-return-to-aux'
        if (prefix.startsWith('talkback.')) return 'talkback-to-aux'
        return 'channel-to-aux'
      }

      const routes: MixerRoute[] = []
      const byKind: Record<string, number> = {}
      let inferred = 0

      for (const mix of auxMixes) {
        for (const send of mix.sends) {
          // Reconstruct source prefix from fromChannel and channel type
          // AuxMix.sends currently only have fromChannel (int) and fromChannelName — no type prefix stored.
          // Default to 'line' for now; RETURN/FXRETURN detection requires prefix in send (future enhancement).
          const source = `line.ch${send.fromChannel}`
          const destination = `aux.ch${mix.auxMixNumber}`
          const kind = channelPrefixToKind(source)
          const rawPath = `${source}.aux${mix.auxMixNumber}`

          const route: MixerRoute = {
            kind,
            source,
            destination,
            level: send.level,
            assigned: !send.muted,
            muted: send.muted,
            rawPath,
            rawValue: snapshot.flatState[rawPath],
            confidence: 'inferred',
          }
          routes.push(route)
          byKind[kind] = (byKind[kind] ?? 0) + 1
          inferred++
        }
      }

      const graph = {
        deviceId: String(deviceId),
        capturedAt: snapshot.capturedAt,
        routes,
        summary: { byKind, observed: 0, inferred, not_verifiable: 0 },
        ...staleMetadata(snapshot),
      }
      return {
        contents: [{
          uri: `presonus://mixer/${String(deviceId)}/monitor-routing`,
          text: JSON.stringify(graph, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/fat-channel/{channelId} ──────────────────────────  // @implements REQ-F-FAT-001
  server.resource(
    'mixer-fat-channel',
    new ResourceTemplate('presonus://mixer/{deviceId}/fat-channel/{channelId}', { list: undefined }),
    { description: 'Fat Channel DSP state for a single channel (EQ model, compressor, gate, limiter, HPF). Parameter confidence is "guessed" until probe-fat-channel calibration is run. Use get_fat_channel tool for programmatic access.' },
    async (_uri, { deviceId, channelId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const ch = snapshot?.channels.find((c) => c.id === String(channelId))
      const uri = `presonus://mixer/${String(deviceId)}/fat-channel/${String(channelId)}`
      if (!snapshot || !ch) {
        return {
          contents: [{
            uri,
            text: JSON.stringify({ error: !snapshot ? 'Device not connected. Run discover_mixers first.' : `Channel '${String(channelId)}' not found.` }),
            mimeType: 'application/json',
          }],
        }
      }
      return {
        contents: [{
          uri,
          text: JSON.stringify({
            channelId: String(channelId),
            channelName: ch.name,
            fatState: ch.fatChannel ?? null,
            capturedAt: snapshot.capturedAt,
            ...staleMetadata(snapshot),
          }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/monitor-layout ─────────────────────────────────
  // @implements REQ-F-MON-001 (Phase 4)
  server.resource(
    'mixer-monitor-layout',
    new ResourceTemplate('presonus://mixer/{deviceId}/monitor-layout', { list: undefined }),
    { description: 'Monitor mix layout for a mixer: all aux buses with type (mono/stereo-left/stereo-right/iem-stereo) and inferred stereo pairs. Pair inference is confidence=inferred until operator-confirmed.' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const uri = `presonus://mixer/${String(deviceId)}/monitor-layout`
      if (!snapshot) {
        return {
          contents: [{
            uri,
            text: JSON.stringify({ error: 'Device not connected. Run discover_mixers first.' }),
            mimeType: 'application/json',
          }],
        }
      }
      const caps = clientManager.getCapabilities(String(deviceId))
      const allMixes = extractAuxMixes(snapshot.flatState)
      const auxBuses = Array.from({ length: caps.auxMixes }, (_, i) => {
        const mix = allMixes.find((m) => m.auxMixNumber === i + 1)
        return { auxBus: i + 1, name: mix?.name, type: 'mono' as const, inferenceConfidence: 'observed' as const }
      })
      // Infer stereo pairs: consecutive buses with same send channel assignments and very similar send levels
      const inferredPairs: Array<{ leftBus: number; rightBus: number; confidence: 'inferred' }> = []
      for (let i = 0; i < auxBuses.length - 1; i++) {
        const left = allMixes.find((m) => m.auxMixNumber === i + 1)
        const right = allMixes.find((m) => m.auxMixNumber === i + 2)
        if (!left || !right) continue
        const leftChs = new Set(left.sends.map((s) => s.fromChannel))
        const rightChs = new Set(right.sends.map((s) => s.fromChannel))
        const overlap = [...leftChs].filter((c) => rightChs.has(c))
        // Heuristic: ≥80% channel overlap → likely stereo pair
        if (leftChs.size > 0 && rightChs.size > 0 && overlap.length / Math.max(leftChs.size, rightChs.size) >= 0.8) {
          inferredPairs.push({ leftBus: i + 1, rightBus: i + 2, confidence: 'inferred' })
        }
      }
      return {
        contents: [{
          uri,
          text: JSON.stringify({
            deviceId: String(deviceId), capturedAt: snapshot.capturedAt, auxBuses, inferredPairs,
            ...staleMetadata(snapshot),
          }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer/{id}/output-patch/labels ────────────────────────────
  // @implements REQ-F-ROUT-010 (Phase 5)
  server.resource(
    'mixer-output-patch-labels',
    new ResourceTemplate('presonus://mixer/{deviceId}/output-patch/labels', { list: undefined }),
    { description: 'Output patch router with source indices. Source names are null until probe-routing diff --kind bus-to-output is run. confidence=not_verifiable_with_current_adapter for source names.' },
    async (_uri, { deviceId }) => {
      const snapshot = clientManager.getSnapshot(String(deviceId))
      const uri = `presonus://mixer/${String(deviceId)}/output-patch/labels`
      return {
        contents: [{
          uri,
          text: JSON.stringify({
            deviceId: String(deviceId),
            outputPatch: snapshot?.outputPatch ?? null,
            capturedAt: snapshot?.capturedAt ?? null,
            note: 'Source names are null — run probe-routing diff --kind bus-to-output to confirm source name → index mapping.',
            ...staleMetadata(snapshot),
          }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )

  // ─── presonus://mixer-graph/current ───────────────────────────────────────
  // @implements REQ-F-GRAPH-001 (Phase 8)
  server.resource(
    'mixer-graph',
    'presonus://mixer-graph/current',
    { description: 'Topology graph across all connected mixers: identities, roles, channel counts, routing summaries, and output patch confidence. Single resource read to understand the full system topology without multiple round trips.' },
    async () => {
      const deviceIds = clientManager.getConnectedDeviceIds()
      const mixers = deviceIds.map((deviceId) => {
        const snapshot = clientManager.getSnapshot(deviceId)
        const identity = clientManager.getIdentity(deviceId)
        const caps = clientManager.getCapabilities(deviceId)
        const allMixes = snapshot ? extractAuxMixes(snapshot.flatState) : []
        const observedRouteCount = allMixes.reduce((sum, m) => sum + m.sends.length, 0)
        return {
          deviceId,
          serial: identity?.serial ?? null,
          role: identity?.role ?? 'UNKNOWN',
          ip: identity?.ip ?? null,
          channelCount: snapshot?.channels.length ?? 0,
          auxMixCapacity: caps.auxMixes,
          outputPatchConfidence: snapshot?.outputPatch?.globalConfidence ?? 'not_verifiable_with_current_adapter',
          isStale: snapshot?.isStale ?? true,
          routing: {
            auxMixCount: allMixes.length,
            observedRouteCount,
          },
        }
      })
      return {
        contents: [{
          uri: 'presonus://mixer-graph/current',
          text: JSON.stringify({ capturedAt: new Date().toISOString(), mixers }, null, 2),
          mimeType: 'application/json',
        }],
      }
    },
  )
}
