/**
 * Client connection manager — manages featherbear Client instances per mixer.
 *
 * @module client-manager
 * @implements #15 REQ-F-001: Auto-discover and connect to StudioLive III mixers
 * @implements #16 REQ-F-002: Identify each mixer by stable serial number
 * @implements #22 REQ-NF-002: Zero write operations in default configuration
 * @implements #24 REQ-NF-004: MCP server operational within 3 s; survive mixer disconnect
 * @architecture #12 ARC-C-002: presonus-adapter package
 * @architecture #9 ADR-004: featherbear API wrapped; never exposed to consumers
 * @architecture #10 ADR-005: Write methods gated behind writeEnabled flag
 * @architecture ADR-006: Semi-automated write tools — applyChange()
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/22
 *
 * Connection lifecycle:
 *   connect → validate serial → subscribe to events → maintain state cache
 *   disconnect → cleanup subscriptions
 */
import type { MixerIdentity } from '@presonus-mcp/domain'
import type { MixerSnapshot } from './state-mapper.js'
import type { RawStateTree, RawMeterPacket } from './types.js'
import { mapRawStateToSnapshot, buildSnapshotFromFlatState } from './state-mapper.js'
import { PresonusMeterSummarizer } from './meter-summarizer.js'

/** Per-device connection state managed by this class */
interface DeviceConnection {
  identity: MixerIdentity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any  // featherbear Client (typed as any until lib types confirmed)
  /** Mutable raw state tree — accumulated from dumpState() + 'data' events + writes */
  rawState: RawStateTree
  snapshot: MixerSnapshot | undefined
  summarizer: PresonusMeterSummarizer
  connected: boolean
  lastError: string | undefined
  /** When true, applyChange() is permitted. Controlled by server config. */
  writeEnabled: boolean
  /** Consecutive reconnect attempts since last successful connection */
  reconnectAttempts: number
  /** Active reconnect timer handle (undefined when connected or not scheduled) */
  reconnectTimer: ReturnType<typeof setTimeout> | undefined
}

export class PresonusClientManager {
  private readonly connections = new Map<string, DeviceConnection>()

  /**
   * Connect to a mixer in read-only mode.
   * Validates serial if provided in identity.
   */
  async connect(identity: MixerIdentity): Promise<void> {
    if (this.connections.has(identity.deviceId)) {
      return  // Already connected
    }

    const { Client } = await import('@featherbear/presonus-studiolive-api')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new (Client as any)({ host: identity.ip, port: identity.port })

    const conn: DeviceConnection = {
      identity,
      client,
      rawState: {},
      snapshot: undefined,
      summarizer: new PresonusMeterSummarizer(),
      connected: false,
      lastError: undefined,
      writeEnabled: this._globalWriteEnabled,
      reconnectAttempts: 0,
      reconnectTimer: undefined,
    }

    this.connections.set(identity.deviceId, conn)

    try {
      await client.connect()
      conn.connected = true

      // Verify serial after connect (REQ-F-002 #16)
      const deviceName = client.state?.get?.('global.mixer_name')
      if (deviceName) {
        conn.identity = { ...conn.identity, name: String(deviceName) }
      }

      // Build initial snapshot
      try {
        const dumped = await client.dumpState?.()
        if (dumped && typeof dumped === 'object') {
          Object.assign(conn.rawState, dumped)
        }
      } catch {
        // dumpState may not exist in all firmware versions; graceful fallback
      }
      conn.snapshot = mapRawStateToSnapshot(conn.identity, conn.rawState)

      // Patch project/scene from featherbear client properties (authoritative source — REQ-F-005 #19)
      if (conn.snapshot) {
        const project = typeof client.currentProject === 'string' && client.currentProject
          ? client.currentProject : undefined
        const scene = typeof client.currentScene === 'string' && client.currentScene
          ? client.currentScene : undefined
        conn.snapshot = { ...conn.snapshot, currentProject: project ?? conn.snapshot.currentProject, currentScene: scene }
      }

      // Subscribe to state updates
      client.on('data', (data: unknown) => {
        if (data && typeof data === 'object') {
          Object.assign(conn.rawState, data)
          conn.snapshot = mapRawStateToSnapshot(conn.identity, conn.rawState)
          // Re-apply scene/project from client properties after state update
          if (conn.snapshot) {
            const project = typeof client.currentProject === 'string' && client.currentProject
              ? client.currentProject : undefined
            const scene = typeof client.currentScene === 'string' && client.currentScene
              ? client.currentScene : undefined
            conn.snapshot = {
              ...conn.snapshot,
              currentProject: project ?? conn.snapshot.currentProject,
              currentScene: scene,
            }
          }
        }
      })

      // Subscribe to meters
      client.on('meter', (packet: unknown) => {
        // featherbear emits meter as { 0: lineValues[], 1: returnValues[], ..., type: "level" }
        // Key 0 = LINE channels (group 0 in StudioLive metering protocol)
        if (packet && typeof packet === 'object') {
          const lineValues = (packet as Record<string | number, unknown>)[0]
          if (Array.isArray(lineValues) && lineValues.length > 0) {
            conn.summarizer.ingest({
              channels: lineValues as number[],
              timestamp: Date.now(),
            })
          }
        }
      })

      if (typeof client.meterSubscribe === 'function') {
        client.meterSubscribe()
      }

      // Subscribe to project/scene changes (featherbear 'setting' event — REQ-F-005 #19)
      client.on('setting', () => {
        if (!conn.snapshot) return
        const project = typeof client.currentProject === 'string' && client.currentProject
          ? client.currentProject : undefined
        const scene = typeof client.currentScene === 'string' && client.currentScene
          ? client.currentScene : undefined
        conn.snapshot = { ...conn.snapshot, currentProject: project ?? conn.snapshot.currentProject, currentScene: scene }
      })

      // Subscribe to disconnect/error events for reconnect logic (QA-SC-003 #27, REQ-NF-004 #24)
      const onLost = (reason: string) => {
        if (!conn.connected) return  // already handling
        conn.connected = false
        const disconnectedAt = new Date().toISOString()
        if (conn.snapshot) {
          conn.snapshot = { ...conn.snapshot, isStale: true, disconnectedAt }
        }
        conn.reconnectAttempts++
        const delayMs = Math.min(1000 * Math.pow(2, conn.reconnectAttempts - 1), 30_000)
        process.stderr.write(
          `[presonus-mcp] ${identity.deviceId} disconnected (${reason}); reconnect attempt ${conn.reconnectAttempts} in ${delayMs} ms\n`,
        )
        conn.reconnectTimer = setTimeout(() => {
          this._reconnect(identity.deviceId).catch((err: unknown) => {
            process.stderr.write(`[presonus-mcp] _reconnect error for ${identity.deviceId}: ${String(err)}\n`)
          })
        }, delayMs)
      }

      client.on('disconnect', () => onLost('disconnect'))
      client.on('error', (err: unknown) => {
        conn.lastError = String(err)
        onLost(`error: ${String(err)}`)
      })
    } catch (err) {
      conn.lastError = String(err)
      conn.connected = false
    }
  }

  /**
   * Attempt to reconnect a disconnected device.
   *
   * Replaces the featherbear Client instance, re-subscribes to all events,
   * and refreshes the snapshot. On failure, schedules another attempt with
   * increasing backoff (capped at 30 s).
   *
   * Safe to call multiple times — guards against re-entry when already connected.
   */
  private async _reconnect(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId)
    if (!conn) return
    if (conn.connected) return  // already recovered (race condition guard)

    // Clear the scheduled timer
    if (conn.reconnectTimer !== undefined) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = undefined
    }

    // Close old client (best-effort)
    try { await conn.client.close?.() } catch { /* ignore */ }

    try {
      const { Client } = await import('@featherbear/presonus-studiolive-api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: conn.identity.ip, port: conn.identity.port })
      conn.client = client

      await client.connect()
      conn.connected = true
      conn.reconnectAttempts = 0
      conn.lastError = undefined

      // Refresh snapshot
      try {
        const dumped = await client.dumpState?.()
        if (dumped && typeof dumped === 'object') Object.assign(conn.rawState, dumped)
      } catch { /* graceful fallback */ }
      conn.snapshot = mapRawStateToSnapshot(conn.identity, conn.rawState)
      if (conn.snapshot) {
        const project = typeof client.currentProject === 'string' && client.currentProject
          ? client.currentProject : undefined
        conn.snapshot = {
          ...conn.snapshot,
          currentProject: project ?? conn.snapshot.currentProject,
          currentScene: typeof client.currentScene === 'string' && client.currentScene
            ? client.currentScene : undefined,
          isStale: false,
          disconnectedAt: undefined,
        }
      }
      conn.writeEnabled = this._globalWriteEnabled

      // Re-subscribe to events (same as connect())
      client.on('data', (data: unknown) => {
        if (data && typeof data === 'object') {
          Object.assign(conn.rawState, data)
          conn.snapshot = mapRawStateToSnapshot(conn.identity, conn.rawState)
        }
      })
      client.on('meter', (packet: unknown) => {
        if (packet && typeof packet === 'object') {
          const lineValues = (packet as Record<string | number, unknown>)[0]
          if (Array.isArray(lineValues) && lineValues.length > 0) {
            conn.summarizer.ingest({ channels: lineValues as number[], timestamp: Date.now() })
          }
        }
      })
      if (typeof client.meterSubscribe === 'function') client.meterSubscribe()

      const onLost = (reason: string) => {
        if (!conn.connected) return
        conn.connected = false
        const disconnectedAt = new Date().toISOString()
        if (conn.snapshot) conn.snapshot = { ...conn.snapshot, isStale: true, disconnectedAt }
        conn.reconnectAttempts++
        const delayMs = Math.min(1000 * Math.pow(2, conn.reconnectAttempts - 1), 30_000)
        process.stderr.write(`[presonus-mcp] ${deviceId} disconnected (${reason}); reconnect in ${delayMs} ms\n`)
        conn.reconnectTimer = setTimeout(() => {
          this._reconnect(deviceId).catch(() => undefined)
        }, delayMs)
      }
      client.on('disconnect', () => onLost('disconnect'))
      client.on('error', (err: unknown) => { conn.lastError = String(err); onLost(`error: ${String(err)}`) })

      process.stderr.write(`[presonus-mcp] ${deviceId} reconnected successfully\n`)
    } catch (err) {
      conn.lastError = String(err)
      conn.connected = false
      conn.reconnectAttempts++
      const delayMs = Math.min(1000 * Math.pow(2, conn.reconnectAttempts - 1), 30_000)
      process.stderr.write(`[presonus-mcp] ${deviceId} reconnect failed: ${String(err)}; retry in ${delayMs} ms\n`)
      conn.reconnectTimer = setTimeout(() => {
        this._reconnect(deviceId).catch(() => undefined)
      }, delayMs)
    }
  }

  /** Disconnect from a mixer */
  async disconnect(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId)
    if (!conn) return
    try {
      await conn.client.close?.()
    } finally {
      this.connections.delete(deviceId)
    }
  }

  /** Get the current snapshot for a device (may be undefined if not connected) */
  getSnapshot(deviceId: string): MixerSnapshot | undefined {
    return this.connections.get(deviceId)?.snapshot
  }

  /** Get meter summarizer for a device */
  getSummarizer(deviceId: string): PresonusMeterSummarizer | undefined {
    return this.connections.get(deviceId)?.summarizer
  }

  /** List all connected device IDs */
  getConnectedDeviceIds(): string[] {
    return [...this.connections.entries()]
      .filter(([, c]) => c.connected)
      .map(([id]) => id)
  }

  /** Get identity for a connected device */
  getIdentity(deviceId: string): MixerIdentity | undefined {
    return this.connections.get(deviceId)?.identity
  }

  /**
   * Enable or disable write operations for a device.
   * Called by the server with the configured writeEnabled flag.
   * Only takes effect if the device is connected.
   */
  setWriteEnabled(deviceId: string, enabled: boolean): void {
    const conn = this.connections.get(deviceId)
    if (conn) conn.writeEnabled = enabled
  }

  /** Enable write mode for ALL connected devices (called at server init). */
  setAllWriteEnabled(enabled: boolean): void {
    for (const conn of this.connections.values()) {
      conn.writeEnabled = enabled
    }
    // Store flag so future connections inherit it
    this._globalWriteEnabled = enabled
  }

  private _globalWriteEnabled = false

  /**
   * Apply a single raw parameter change to the mixer.
   *
   * Protocol: featherbear ParamValue packet (message code 'PV').
   *   Buffer = [path as UTF-8 + "\0\0\0"] ++ [float32BE (normalized 0–1)]
   *
   * Safety: throws if writeEnabled is false for this device.
   * After sending, updates the local flatState and rebuilds the snapshot so
   * consumers see the change immediately without waiting for the mixer echo.
   *
   * @param deviceId  Device identifier (from getConnectedDeviceIds)
   * @param flatKey   Dot-notation state key, e.g. "line.ch1.eq.eqgain1"
   * @param normalizedValue  Value in [0, 1] to send (de-normalized by caller)
   */
  async applyChange(
    deviceId: string,
    flatKey: string,
    normalizedValue: number,
  ): Promise<void> {
    const conn = this.connections.get(deviceId)
    if (!conn) throw new Error(`applyChange: device '${deviceId}' not connected`)
    if (!conn.writeEnabled) {
      throw new Error(
        `applyChange: write not enabled for device '${deviceId}'. ` +
        'Pass controlEnabled: true to createServer() and use soundcheck_assist mode.',
      )
    }
    if (normalizedValue < 0 || normalizedValue > 1) {
      throw new Error(`applyChange: normalizedValue ${normalizedValue} out of range [0, 1]`)
    }

    // Convert dot-notation path to featherbear slash-notation and send PV packet
    const slashPath = flatKey.replace(/\./g, '/')
    const pathBuf = Buffer.from(slashPath + '\x00\x00\x00', 'utf8')
    const valBuf = Buffer.alloc(4)
    valBuf.writeFloatBE(normalizedValue, 0)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await conn.client._sendPacket('PV', Buffer.concat([pathBuf, valBuf]))

    // Update local flat state immediately so the snapshot reflects the change
    const snap = conn.snapshot
    if (snap) {
      const newFlat = { ...snap.flatState, [flatKey]: normalizedValue }
      conn.rawState[flatKey] = normalizedValue  // also update rawState for future re-flattens
      conn.snapshot = buildSnapshotFromFlatState(conn.identity, newFlat, conn.rawState)
    }
  }
}
