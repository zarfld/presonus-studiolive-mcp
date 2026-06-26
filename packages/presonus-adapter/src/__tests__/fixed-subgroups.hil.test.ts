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

    it('sub.ch1 = Sub A: mono (stereoLinked=false), username="Sub A"', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subA = topology.buses.find((b) => b.busIndex === 1)
      expect(subA, 'sub.ch1 (Sub A) not found').toBeDefined()
      expect(subA!.username).toBe('Sub A')
      expect(subA!.stereoLinked).toBe(false)
      expect(subA!.isLinkMaster).toBe(false)
      expect(subA!.stereoPartnerIndex).toBeNull()
    })

    it('sub.ch2 = Sub B: mono (stereoLinked=false), username="Sub B"', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subB = topology.buses.find((b) => b.busIndex === 2)
      expect(subB, 'sub.ch2 (Sub B) not found').toBeDefined()
      expect(subB!.username).toBe('Sub B')
      expect(subB!.stereoLinked).toBe(false)
      expect(subB!.isLinkMaster).toBe(false)
      expect(subB!.stereoPartnerIndex).toBeNull()
    })

    it('sub.ch3 = Sub C: stereolinked MASTER (link=1, linkmaster=1, partner=4)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subC = topology.buses.find((b) => b.busIndex === 3)
      expect(subC, 'sub.ch3 (Sub C) not found').toBeDefined()
      expect(subC!.username).toBe('Sub C')
      expect(subC!.stereoLinked).toBe(true)
      expect(subC!.isLinkMaster).toBe(true)
      expect(subC!.stereoPartnerIndex).toBe(4)
    })

    it('sub.ch4 = Sub D: stereolinked SLAVE (link=1, linkmaster=0, partner=3)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subD = topology.buses.find((b) => b.busIndex === 4)
      expect(subD, 'sub.ch4 (Sub D) not found').toBeDefined()
      expect(subD!.username).toBe('Sub D')
      expect(subD!.stereoLinked).toBe(true)
      expect(subD!.isLinkMaster).toBe(false)
      expect(subD!.stereoPartnerIndex).toBe(3)
    })

    it('stereoPairs has exactly one pair: masterIndex=3, slaveIndex=4', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      expect(topology.stereoPairs).toHaveLength(1)
      expect(topology.stereoPairs[0]!.masterIndex).toBe(3)
      expect(topology.stereoPairs[0]!.slaveIndex).toBe(4)
    })

    it('Sub A assignedChannels = [3, 4]', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subA = topology.buses.find((b) => b.busIndex === 1)!
      expect(subA.assignedChannels.sort((a, b) => a - b)).toEqual([3, 4])
    })

    it('Sub B assignedChannels = [11, 16]', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subB = topology.buses.find((b) => b.busIndex === 2)!
      expect(subB.assignedChannels.sort((a, b) => a - b)).toEqual([11, 16])
    })

    it('Sub C assignedChannels = [5, 6, 7, 8] (stereolinked pair — master side)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subC = topology.buses.find((b) => b.busIndex === 3)!
      expect(subC.assignedChannels.sort((a, b) => a - b)).toEqual([5, 6, 7, 8])
    })

    it('Sub D assignedChannels mirrors Sub C (stereolinked pair — slave side)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFixedSubGroups(snap.flatState)
      const subC = topology.buses.find((b) => b.busIndex === 3)!
      const subD = topology.buses.find((b) => b.busIndex === 4)!
      expect(subD.assignedChannels.sort((a, b) => a - b))
        .toEqual(subC.assignedChannels.sort((a, b) => a - b))
    })
  },
)
