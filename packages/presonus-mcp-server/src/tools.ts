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
import { discoverMixers, type PresonusClientManager } from '@presonus-mcp/adapter'
import {
  eqGainDbToNormalized,
  eqFreqHzToNormalized,
  eqQToNormalized,
  normalizedToEqGainDb,
  normalizedToEqFreqHz,
  normalizedToEqQ,
  type ProposedChangeSet,
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
