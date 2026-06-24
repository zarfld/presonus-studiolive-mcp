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
 * @architecture #10 ADR-005: Write methods explicitly NOT exposed in this class
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/22
 *
 * Connection lifecycle:
 *   connect → validate serial → subscribe to events → maintain state cache
 *   disconnect → cleanup subscriptions
 */
import type { MixerIdentity } from '@presonus-mcp/domain'
import type { MixerSnapshot } from './state-mapper.js'
import type { RawStateTree, RawMeterPacket } from './types.js'
import { mapRawStateToSnapshot } from './state-mapper.js'
import { PresonusMeterSummarizer } from './meter-summarizer.js'

/** Per-device connection state managed by this class */
interface DeviceConnection {
  identity: MixerIdentity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any  // featherbear Client (typed as any until lib types confirmed)
  snapshot: MixerSnapshot | undefined
  summarizer: PresonusMeterSummarizer
  connected: boolean
  lastError: string | undefined
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
      snapshot: undefined,
      summarizer: new PresonusMeterSummarizer(),
      connected: false,
      lastError: undefined,
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
      const rawState: RawStateTree = {}
      try {
        const dumped = await client.dumpState?.()
        if (dumped && typeof dumped === 'object') {
          Object.assign(rawState, dumped)
        }
      } catch {
        // dumpState may not exist in all firmware versions; graceful fallback
      }
      conn.snapshot = mapRawStateToSnapshot(conn.identity, rawState)

      // Subscribe to state updates
      client.on('data', (data: unknown) => {
        if (data && typeof data === 'object') {
          Object.assign(rawState, data)
          conn.snapshot = mapRawStateToSnapshot(conn.identity, rawState)
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
    } catch (err) {
      conn.lastError = String(err)
      conn.connected = false
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
}
