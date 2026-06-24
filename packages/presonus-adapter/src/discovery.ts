/**
 * PreSonus mixer discovery service.
 *
 * Wraps @featherbear/presonus-studiolive-api Discovery class.
 * Returns normalized MixerIdentity[] (never raw featherbear types).
 *
 * @module discovery
 * @implements #15 REQ-F-001: Auto-discover StudioLive III mixers on local subnet
 * @implements #16 REQ-F-002: Identify each mixer by stable serial number
 * @implements #21 REQ-NF-001: Discovery response time ≤ 5 s
 * @architecture #12 ARC-C-002: presonus-adapter package
 * @architecture #7 ADR-002: Three-layer architecture
 * @architecture #9 ADR-004: featherbear API adapter (pinned)
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/15
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/16
 */
import type { MixerIdentity } from '@presonus-mcp/domain'
import type { RawDiscoveredDevice } from './types.js'

/** Configuration for a pre-configured device (for fallback IP support) */
export interface DeviceConfig {
  alias: string
  expectedSerial?: string
  fallbackIp?: string
  fallbackPort?: number
  role?: MixerIdentity['role']
}

export interface DiscoveryConfig {
  timeoutMs?: number
  fallbackDevices?: DeviceConfig[]
}

/** Discovery result with richer metadata than raw MixerIdentity */
export interface DiscoveryResult {
  devices: MixerIdentity[]
  /** Devices that were configured but not discovered (may use fallback IP) */
  missingConfigured: DeviceConfig[]
  /** Devices discovered but not in any configuration */
  unknownDiscovered: MixerIdentity[]
}

/**
 * Build a stable deviceId from discovery data.
 * Priority: serial+model > serial > alias > ip:port (REQ-F-002 #16)
 */
export function buildDeviceId(raw: RawDiscoveredDevice, config?: DeviceConfig): string {
  if (raw.serial) {
    return `serial:${raw.serial}`
  }
  if (config?.alias && config.expectedSerial) {
    return `alias:${config.alias}`
  }
  return `ip:${raw.ip}:${raw.port}`
}

/**
 * Normalize a raw discovered device into a MixerIdentity.
 * All fields from featherbear are mapped to domain types here.
 */
export function normalizeDiscoveredDevice(
  raw: RawDiscoveredDevice,
  config?: DeviceConfig,
): MixerIdentity {
  const deviceId = buildDeviceId(raw, config)
  const serialMatches = config?.expectedSerial
    ? raw.serial === config.expectedSerial
    : true

  return {
    deviceId,
    serial: raw.serial,
    configuredAlias: config?.alias,
    model: raw.model,
    name: raw.name,
    ip: raw.ip,
    port: raw.port,
    lastSeen: new Date().toISOString(),
    role: serialMatches ? (config?.role ?? 'UNKNOWN') : 'UNKNOWN',
    controllable: false, // Always false in MVP (ADR-005 #10)
    confidence: raw.serial ? 'observed' : 'fallback',
  }
}

/**
 * Discover StudioLive mixers on the local network.
 *
 * Uses featherbear Discovery, collects responses for `timeoutMs`,
 * then normalizes results into MixerIdentity[].
 *
 * Falls back to configured IPs for devices that did not respond.
 */
export async function discoverMixers(config: DiscoveryConfig = {}): Promise<DiscoveryResult> {
  const { timeoutMs = 5000, fallbackDevices = [] } = config

  // Dynamic import to avoid top-level module load errors if library is unavailable
  const { Discovery } = await import('@featherbear/presonus-studiolive-api')

  const rawDevices: RawDiscoveredDevice[] = []

  // Collect into a Map keyed by serial (deduplicate per physical device).
  // Multiple network interfaces on the host mean the same broadcast is received once per NIC.
  // The same mixer may also appear with multiple source IPs (one per mixer NIC).
  // We keep only one entry per serial, preferring the IP/port that already uses TCP 53000.
  const seenDevices = new Map<string, RawDiscoveredDevice>()

  await new Promise<void>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discovery = new (Discovery as any)()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    discovery.on('discover', (device: any) => {
      const ip = String(device.ip)
      // Filter loopback — 127.x.x.x addresses can never be a real remote mixer
      if (ip.startsWith('127.')) return

      const serial = device.serial !== undefined ? String(device.serial) : undefined
      // Deduplicate key: prefer serial; fall back to ip for devices without serial
      const dedupeKey = serial ?? ip

      const candidatePort = Number(device.port ?? 53000)
      const existing = seenDevices.get(dedupeKey)

      if (!existing) {
        seenDevices.set(dedupeKey, {
          name: String(device.name ?? ''),
          ...(serial !== undefined ? { serial } : {}),
          ip,
          // Use port 53000 (TCP control) regardless of UDP source port in discovery packet.
          // featherbear docs: "control uses TCP port 53000". The discovery port is the UDP
          // source port which varies per NIC and is NOT the control port.
          port: candidatePort === 53000 ? 53000 : 53000,
          ...(device.model !== undefined ? { model: String(device.model) } : {}),
          timestamp: device.timestamp,
        })
      } else if (candidatePort === 53000 && existing.ip !== ip) {
        // Same serial seen from a different IP with TCP port 53000 — prefer it
        seenDevices.set(dedupeKey, { ...existing, ip, port: 53000 })
      }
      // All other duplicates (same serial from different NIC or repeat broadcast) are ignored
    })

    // Start discovery
    if (typeof discovery.start === 'function') {
      discovery.start()
    }

    setTimeout(() => {
      if (typeof discovery.stop === 'function') {
        discovery.stop()
      }
      resolve()
    }, timeoutMs)
  })

  // Drain deduplicated Map into rawDevices array
  rawDevices.push(...seenDevices.values())

  // Match discovered devices to configured devices
  const discoveredSerials = new Set(
    rawDevices.map((d) => d.serial).filter((s): s is string => s !== undefined),
  )
  const missingConfigured: DeviceConfig[] = []

  const normalizedDevices: MixerIdentity[] = rawDevices.map((raw) => {
    const match = fallbackDevices.find((cfg) => cfg.expectedSerial === raw.serial)
    return normalizeDiscoveredDevice(raw, match)
  })

  // Check which configured devices were not discovered
  for (const cfg of fallbackDevices) {
    if (cfg.expectedSerial && !discoveredSerials.has(cfg.expectedSerial)) {
      missingConfigured.push(cfg)
    }
  }

  // For missing configured devices, attempt fallback IP if provided
  for (const cfg of missingConfigured) {
    if (cfg.fallbackIp) {
      normalizedDevices.push({
        deviceId: cfg.expectedSerial
          ? `serial:${cfg.expectedSerial}`
          : `alias:${cfg.alias}`,
        serial: cfg.expectedSerial,
        configuredAlias: cfg.alias,
        ip: cfg.fallbackIp,
        port: cfg.fallbackPort ?? 53000,
        lastSeen: new Date().toISOString(),
        role: cfg.role ?? 'UNKNOWN',
        controllable: false,
        confidence: 'configured',
      })
    }
  }

  const configuredAliases = new Set(fallbackDevices.map((c) => c.alias))
  const unknownDiscovered = normalizedDevices.filter(
    (d) => !d.configuredAlias || !configuredAliases.has(d.configuredAlias),
  )

  return { devices: normalizedDevices, missingConfigured, unknownDiscovered }
}
