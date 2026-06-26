/**
 * Hardware-in-Loop (HIL) tests for fixed hardware subgroup bus extraction.
 *
 * Verifies REQ-F-FIXEDSUB-001 (#85) against real StudioLive 32SC
 * with user-configured Sub A (mono), Sub B (mono), Sub C+D (stereolinked pair).
 *
 * OBSERVED values from captures/2026-06-26/SD7E21010066/state-full.json:
 *   sub.ch1: chnum="Sb A", username="Sub A", link=0, linkmaster=0
 *            assigned: line.ch3, ch4 (sub1=1)
 *   sub.ch2: chnum="Sb B", username="Sub B", link=0, linkmaster=0
 *            assigned: line.ch11, ch16 (sub2=1)
 *   sub.ch3: chnum="Sb C", username="Sub C", link=1, linkmaster=1, panlinkstate=1 → STEREO MASTER
 *            assigned: line.ch5, ch6, ch7, ch8 (sub3=1)
 *   sub.ch4: chnum="Sb D", username="Sub D", link=1, linkmaster=0, panlinkstate=1 → STEREO SLAVE
 *            assigned: line.ch5, ch6, ch7, ch8 (sub4=1 mirrors sub3)
 *
 * Run: pnpm test:hil  (requires HIL_PRESONUS=1, HIL_PRESONUS_IP, HIL_PRESONUS_SERIAL)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  discoverMixers,
  PresonusClientManager,
  extractFixedSubGroups,
} from '@presonus-mcp/adapter'
import type { MixerIdentity } from '@presonus-mcp/domain'

// ─── Environment ──────────────────────────────────────────────────────────────

const HIL    = process.env.HIL_PRESONUS        === '1'
const HIL_IP = process.env.HIL_PRESONUS_IP
const HIL_SN = process.env.HIL_PRESONUS_SERIAL

function discoveryConfig(timeoutMs = 5000) {
  return {
    timeoutMs,
    ...(HIL_IP ? {
      fallbackDevices: [{
        alias: 'hil-mixer',
        fallbackIp: HIL_IP,
        fallbackPort: 53000,
        role: 'FOH' as const,
        ...(HIL_SN ? { expectedSerial: HIL_SN } : {}),
      }],
    } : {}),
  }
}

// ─── Shared connection (hardware lifecycle) ────────────────────────────────

let manager: PresonusClientManager
let identity: MixerIdentity

async function connectOnce(): Promise<void> {
  if (manager && identity && manager.getConnectedDeviceIds().includes(identity.deviceId)) return
  const result = await discoverMixers(discoveryConfig())
  expect(result.devices.length, HIL_IP ? `No mixer — is ${HIL_IP} reachable?` : 'No mixer via UDP').toBeGreaterThan(0)
  identity = result.devices[0]!
  manager = new PresonusClientManager()
  await manager.connect(identity)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const snap = manager.getSnapshot(identity.deviceId)
    if (snap && snap.channels.length > 0) break
    await new Promise((r) => setTimeout(r, 500))
  }
}

if (HIL) {
  beforeAll(connectOnce, 30_000)
  afterAll(async () => {
    await manager?.disconnect(identity?.deviceId).catch(() => {})
  }, 10_000)
}

// ─── REQ-F-FIXEDSUB-001 (#85): Fixed sub bus topology on real hardware ────────

describe.skipIf(!HIL)(
  'fixed-subgroups HIL — fixed sub bus topology (REQ-F-FIXEDSUB-001 #85)',
  () => {
    /**
     * Verifies: REQ-F-FIXEDSUB-001 (#85)
     * Traces to: #4 (StR-4: Routing validation)
     *
     * NOTE: All assertions are scene-agnostic (structural only).
     * Specific channel names/assignments are NOT checked here because they
     * change with each loaded scene — checking them would require stale JSON
     * which violates the "ALWAYS use actual mixer state" rule.
     */

    it('extractFixedSubGroups returns exactly 4 buses on StudioLive 32SC', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      expect(topology, 'extractFixedSubGroups returned undefined').toBeDefined()
      expect(topology.buses, 'Expected exactly 4 fixed sub buses (Sub A/B/C/D)').toHaveLength(4)
    })

    it('topology.confidence is high (Layer A observable — no probe required)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      expect(topology.confidence).toBe('high')
    })

    it('each bus has busIndex 1–4, non-empty username string, and busId "sub.chN"', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      for (let i = 1; i <= 4; i++) {
        const bus = topology.buses.find((b) => b.busIndex === i)
        expect(bus, `bus ${i} missing`).toBeDefined()
        expect(typeof bus!.username).toBe('string')
        expect(bus!.username.length, `bus ${i} username is empty`).toBeGreaterThan(0)
        expect(bus!.busId).toBe(`sub.ch${i}`)
      }
    })

    it('each bus has a members array (includes fxreturn channels — REQ-F-WRITE-005 #86)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      for (const bus of topology.buses) {
        expect(Array.isArray(bus.members), `bus ${bus.busIndex} members not array`).toBe(true)
        for (const m of bus.members) {
          expect(typeof m.channelId).toBe('string')
          expect(typeof m.channelType).toBe('string')
          expect(['line', 'fxreturn', 'return', 'talkback']).toContain(m.channelType)
          expect(m.channelId).toMatch(new RegExp(`^${m.channelType}\\.ch\\d+$`))
        }
      }
    })

    it('assignedChannels (legacy) contains only line channel numbers (backward compat)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      for (const bus of topology.buses) {
        expect(Array.isArray(bus.assignedChannels), `bus ${bus.busIndex} assignedChannels not array`).toBe(true)
        for (const ch of bus.assignedChannels) {
          expect(typeof ch).toBe('number')
          // Verify only line channels appear in legacy assignedChannels
          expect(bus.members.some(m => m.channelType === 'line' && m.channelIndex === ch)).toBe(true)
        }
      }
    })

    it('stereoPairs has valid masterIndex/slaveIndex pairs', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      for (const pair of topology.stereoPairs) {
        expect(pair.masterIndex).toBeGreaterThanOrEqual(1)
        expect(pair.slaveIndex).toBeGreaterThanOrEqual(1)
        const master = topology.buses.find(b => b.busIndex === pair.masterIndex)
        const slave  = topology.buses.find(b => b.busIndex === pair.slaveIndex)
        expect(master?.stereoLinked).toBe(true)
        expect(master?.isLinkMaster).toBe(true)
        expect(slave?.stereoLinked).toBe(true)
        expect(slave?.isLinkMaster).toBe(false)
      }
    })

    it('stereolinked slave mirrors master assignedChannels', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      for (const pair of topology.stereoPairs) {
        const master = topology.buses.find(b => b.busIndex === pair.masterIndex)!
        const slave  = topology.buses.find(b => b.busIndex === pair.slaveIndex)!
        expect(slave.assignedChannels.sort((a, b) => a - b))
          .toEqual(master.assignedChannels.sort((a, b) => a - b))
      }
    })

    it('live sub bus usernames are logged for diagnostic visibility', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      // Log actual names for observability — not asserting specific values (scene-dependent)
      for (const bus of topology.buses) {
        console.info(`[live] sub.ch${bus.busIndex} username="${bus.username}" members=${bus.members.map(m => m.channelId).join(',')}`)
      }
    })
  },
)

