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
import type { PresonusClientManager } from '@presonus-mcp/adapter'
import type { MixerSnapshot } from '@presonus-mcp/adapter'

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
    { description: 'Per-channel send routing: AUX sends (1–32), FX sends (FXA–FXH), subgroup assigns (1–4), main LR. parameterConfidence=guessed until AUX probe calibration.' },
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
}
