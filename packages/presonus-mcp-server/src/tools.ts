/**
 * MCP tool registrations — read-only analysis tools only in default config.
 *
 * @module tools
 * @implements #22 REQ-NF-002: Zero write tools in default configuration
 * @implements #15 REQ-F-001: Auto-discover mixers (discover_mixers tool)
 * @architecture #14 ARC-C-004: presonus-mcp-server package
 * @architecture #10 ADR-005: Read-only-first policy — write tools NOT registered in MVP
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/22
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { discoverMixers, type PresonusClientManager } from '@presonus-mcp/adapter'

export interface ToolsConfig {
  /** When false (default): only read-only tools registered. Write tools: not registered. */
  writeEnabled: boolean
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

  // ─── Write tools (NOT registered in MVP — ADR-005 #10, REQ-NF-002 #22) ───
  if (config.writeEnabled) {
    // Future: register set_fader, set_mute, apply_change_set here
    // For now: write mode is enabled in config but no write tools are implemented
    process.stderr.write('[presonus-mcp] WARNING: writeEnabled=true but no write tools are implemented in this version.\n')
  }
  // Write tools intentionally NOT registered. Do not add them here without:
  //   1. Updating REQ-NF-002 (#22) test to account for them
  //   2. Implementing full ProposedChangeSet + audit log + confirmation flow
  //   3. Review by project owner
}
