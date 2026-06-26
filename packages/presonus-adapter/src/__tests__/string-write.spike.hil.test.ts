/**
 * Phase A Spike — Hardware-in-Loop proof of string-write protocol.
 *
 * Discovers the correct packet type and format for writing string values
 * (channel rename via username key) to a live StudioLive III mixer.
 *
 * PROTOCOL FINDINGS (from featherbear @1.8.0 source inspection):
 *   - Incoming string values arrive via PS (ParamString) packets.
 *   - Featherbear has NO outgoing PS sender in its public API.
 *   - Outgoing string write must use raw `_sendPacket('PS', ...)`.
 *   - PS packet format (inferred from handlePSPacket parser):
 *       [path]\x00\x00\x00[value string]\x00
 *   - `line.chN.username` is the scribble-strip label for line channels.
 *   - Same key pattern applies to fxreturn, sub, aux, fxbus, main channels.
 *
 * Run: HIL_PRESONUS=1 HIL_PRESONUS_IP=157.247.3.13 HIL_PRESONUS_SERIAL=SD7E21010066 pnpm test:hil
 *
 * Verifies: REQ-F-WRITE-005a (#86)
 * Traces to: #2 (StR-002: Show preparation)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { discoverMixers, PresonusClientManager } from '@presonus-mcp/adapter'
import type { MixerIdentity } from '@presonus-mcp/domain'

// ─── Environment ──────────────────────────────────────────────────────────────

const HIL    = process.env.HIL_PRESONUS        === '1'
const HIL_IP = process.env.HIL_PRESONUS_IP
const HIL_SN = process.env.HIL_PRESONUS_SERIAL

const SPIKE_LABEL = 'MCP_TEST_001'  // short, safe, uniquely recognisable on the scribble strip

function discoveryConfig(timeoutMs = 5000) {
  return {
    timeoutMs,
    ...(HIL_IP ? {
      fallbackDevices: [{
        alias: 'hil-mixer', fallbackIp: HIL_IP, fallbackPort: 53000,
        role: 'FOH' as const,
        ...(HIL_SN ? { expectedSerial: HIL_SN } : {}),
      }],
    } : {}),
  }
}

// ─── Shared connection ────────────────────────────────────────────────────────

let manager: PresonusClientManager
let identity: MixerIdentity

async function connectOnce(): Promise<void> {
  if (manager && identity && manager.getConnectedDeviceIds().includes(identity.deviceId)) return
  const result = await discoverMixers(discoveryConfig())
  expect(result.devices.length, HIL_IP ? `No mixer at ${HIL_IP}` : 'No mixer via UDP').toBeGreaterThan(0)
  identity = result.devices[0]!
  manager = new PresonusClientManager()
  await manager.connect(identity)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const s = manager.getSnapshot(identity.deviceId)
    if (s && s.channels.length > 0) break
    await new Promise(r => setTimeout(r, 400))
  }
}

if (HIL) {
  beforeAll(connectOnce, 30_000)
  afterAll(async () => {
    await manager?.disconnect(identity?.deviceId).catch(() => {})
  }, 10_000)
}

// ─── Freshness guard (REQ: NEVER use state older than 5 min) ─────────────────

function assertFreshSnapshot(): void {
  const snap = manager.getSnapshot(identity.deviceId)!
  const ageMs = Date.now() - new Date(snap.capturedAt).getTime()
  expect(ageMs, `Snapshot is ${Math.round(ageMs / 1000)} s old — exceeds 5-minute freshness limit`).toBeLessThan(5 * 60_000)
}

// ─── Helper: wait for state key to equal expected value ──────────────────────

async function waitForKey(
  flatKey: string,
  expected: unknown,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snap = manager.getSnapshot(identity.deviceId)
    const actual = snap?.flatState[flatKey]
    if (actual === expected) return
    await new Promise(r => setTimeout(r, 300))
  }
  const snap = manager.getSnapshot(identity.deviceId)
  const actual = snap?.flatState[flatKey]
  expect(actual, `Key '${flatKey}': expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`).toBe(expected)
}

// ─── Phase A Spike: discover correct string-write packet ─────────────────────

describe.skipIf(!HIL)(
  'string-write spike HIL — PS packet round-trip (REQ-F-WRITE-005a #86)',
  () => {

    /** Track original name for cleanup */
    let originalName: string
    /** Channel to test rename on — discovered from live state */
    let targetChannelKey: string

    beforeAll(() => {
      assertFreshSnapshot()
      // Use line.ch11 (typically "Klick" in current show) — but don't hardcode
      const snap = manager.getSnapshot(identity.deviceId)!
      const ch11name = snap.flatState['line.ch11.username']
      expect(ch11name, 'line.ch11 has no username key — cannot run spike').toBeDefined()
      targetChannelKey = 'line.ch11.username'
      originalName = String(ch11name)
      console.info(`[spike] Using ${targetChannelKey} = "${originalName}"`)
    })

    it('line.ch11.username is present and non-empty in live flatState', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      expect(snap.flatState[targetChannelKey]).toBeDefined()
      expect(String(snap.flatState[targetChannelKey]).length).toBeGreaterThan(0)
    })

    it('applyStringChange() renames line.ch11 and mixer echoes the change back', async () => {
      assertFreshSnapshot()
      // RED: This will fail until applyStringChange() is implemented in client-manager.ts
      await manager.applyStringChange(identity.deviceId, targetChannelKey, SPIKE_LABEL)

      // Give mixer 2 s to echo the change back via PS packet
      await waitForKey(targetChannelKey, SPIKE_LABEL, 3000)
    }, 10_000)

    it('applyStringChange() reverts rename (cleanup)', async () => {
      assertFreshSnapshot()
      await manager.applyStringChange(identity.deviceId, targetChannelKey, originalName)
      await waitForKey(targetChannelKey, originalName, 3000)
    }, 10_000)

    it('fxreturn.ch4.username is renameable (fxreturn channel type accepts PS write)', async () => {
      assertFreshSnapshot()
      const snap = manager.getSnapshot(identity.deviceId)!
      const fxKey = 'fxreturn.ch4.username'
      const fxOriginal = String(snap.flatState[fxKey] ?? 'FX Ret D')
      console.info(`[spike] fxreturn.ch4 original name = "${fxOriginal}"`)

      await manager.applyStringChange(identity.deviceId, fxKey, SPIKE_LABEL)
      await waitForKey(fxKey, SPIKE_LABEL, 3000)

      // revert
      await manager.applyStringChange(identity.deviceId, fxKey, fxOriginal)
      await waitForKey(fxKey, fxOriginal, 3000)
    }, 15_000)
  },
)
