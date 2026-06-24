/**
 * Normalized mixer identity schemas.
 *
 * @module mixer-schemas
 * @implements #15 REQ-F-001: Auto-discover StudioLive III mixers on local subnet
 * @implements #16 REQ-F-002: Identify each mixer by stable serial number
 * @architecture #11 ARC-C-001: presonus-domain package — Zod schemas
 * @architecture #7 ADR-002: Three-layer architecture
 * @architecture #8 ADR-003: pnpm monorepo
 *
 * Identity priority rule (per ADR-005 #10):
 *   1. serial + model
 *   2. configuredAlias + serial
 *   3. configuredAlias + static IP
 *   4. IP + port (temporary fallback only)
 */
import { z } from 'zod'

export const MixerRoleSchema = z.enum(['FOH', 'STAGEBOX', 'MONITOR', 'UNKNOWN'])
export type MixerRole = z.infer<typeof MixerRoleSchema>

export const MixerIdentitySchema = z.object({
  /** Stable internal ID. Prefer: `serial:<serial>`, fallback: `ip:<ip>:<port>` */
  deviceId: z.string(),
  /** Serial number from discovery (preferred stable identity — REQ-F-002 #16) */
  serial: z.string().optional(),
  /** Human-assigned alias from config (e.g. "FOH-32SC", "Stagebox-32R") */
  configuredAlias: z.string().optional(),
  /** Model name from discovery (e.g. "StudioLive 32SC") */
  model: z.string().optional(),
  /** Mixer name as set on the device */
  name: z.string().optional(),
  /** Current IP address (may change; not used as primary identity) */
  ip: z.string(),
  /** Control port (normally 53000) */
  port: z.number().int(),
  /** ISO 8601 timestamp of last successful discovery or heartbeat */
  lastSeen: z.string().datetime(),
  /** Assigned role for this device in the current rig */
  role: MixerRoleSchema,
  /** Whether this device is configured to accept write operations (always false in MVP) */
  controllable: z.boolean(),
  /** How this device was identified (observed: serial confirmed; fallback: IP-only) */
  confidence: z.enum(['observed', 'configured', 'fallback']).default('fallback'),
})
export type MixerIdentity = z.infer<typeof MixerIdentitySchema>

export const MixerOverviewSchema = z.object({
  identity: MixerIdentitySchema,
  firmware: z.string().optional(),
  channelCount: z.number().int().optional(),
  auxCount: z.number().int().optional(),
  fxCount: z.number().int().optional(),
})
export type MixerOverview = z.infer<typeof MixerOverviewSchema>

/**
 * Mixer hardware capabilities — what the mixer CAN do.
 * Derived from known model table + live state.
 * Used by the sound engineer agent to validate capacity before planning.
 *
 * The agent provides requirements; the MCP server checks capability.
 * (Agent owns: rider, show planning. MCP owns: mixer facts.)
 */
export const MixerCapabilitiesSchema = z.object({
  deviceId: z.string(),
  model: z.string().optional(),
  role: MixerRoleSchema,
  capabilities: z.object({
    /** Number of mono line-level (XLR) input channels */
    lineInputs: z.number().int().nonnegative(),
    /** Number of independent aux mix buses (monitor mixes / IEM mixes) */
    auxMixes: z.number().int().nonnegative(),
    /** Number of subgroup buses */
    subgroups: z.number().int().nonnegative(),
    /** Number of FX return buses */
    fxBuses: z.number().int().nonnegative(),
    /** Has main L/R output bus */
    mainOutputs: z.boolean(),
    /** Fat Channel processing available on this mixer (EQ / compressor models) */
    fatChannel: z.boolean(),
    /** Supports AVB stagebox connection (e.g. 32R via AVB) */
    avbStagebox: z.boolean(),
  }),
})
export type MixerCapabilities = z.infer<typeof MixerCapabilitiesSchema>
