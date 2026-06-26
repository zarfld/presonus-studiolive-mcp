/**
 * Hardware-in-Loop (HIL) tests for FlexMix bus topology extraction.
 *
 * Verifies REQ-F-FLEXMIX-001 (#84) against real StudioLive 32SC
 * with user-configured SubGroups "Sub 2" (FlexMix2) and "Sub 3" (FlexMix3).
 *
 * OBSERVED values from captures/2026-06-26/SD7E21010066/state-full.json:
 *   aux.ch1.busmode.value = 0     → AUX mode (chnum="Ax 1")
 *   aux.ch2.busmode.value = 0.5   → SUBGROUP mode (chnum="Sb 2", username="Sub 2")
 *   aux.ch3.busmode.value = 0.5   → SUBGROUP mode (chnum="Sb 3", username="Sub 3")
 *   aux.ch6.busmode.value = 1     → MATRIX mode (chnum="Mx 6", username="Mtx 6")
 *   Sub 2 assigned channels: line.ch10, ch11, ch12, ch14, ch15 (assign_aux2=true)
 *   Sub 3 assigned channels: line.ch4, ch5, ch6, ch7 (assign_aux3=true)
 *   flexassignflags: ch4-7=4 (bit2=FlexMix3), ch10-12,14,15=2 (bit1=FlexMix2)
 *
 * Decode formula: modeIndex = Math.round(busmodeRaw * 7) where strings=8, max=7
 *
 * Run: pnpm test:hil  (requires HIL_PRESONUS=1, HIL_PRESONUS_IP, HIL_PRESONUS_SERIAL)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  discoverMixers,
  PresonusClientManager,
  extractFlexMixBusTopology,
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

// ─── REQ-F-FLEXMIX-001 (#84): FlexMix bus topology on real hardware ───────────

describe.skipIf(!HIL)(
  'flexmix-routing HIL — FlexMix bus topology (REQ-F-FLEXMIX-001 #84)',
  () => {
    /**
     * Verifies: REQ-F-FLEXMIX-001 (#84)
     * Traces to: #4 (StR-4: Routing validation)
     */

    it('extractFlexMixBusTopology returns buses on real hardware', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      expect(topology, 'extractFlexMixBusTopology returned undefined').toBeDefined()
      expect(topology.buses.length, 'No FlexMix buses found — aux.chN.busmode.value keys absent').toBeGreaterThan(0)
    })

    it('topology.confidence is high (Layer A observable — no probe required)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      expect(topology.confidence).toBe('high')
    })

    it('aux.ch1 classified as AUX mode (busmode.value = 0)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const bus1 = topology.buses.find((b) => b.busIndex === 1)
      expect(bus1, 'aux.ch1 not found in topology').toBeDefined()
      expect(bus1!.mode).toBe('AUX')
    })

    it('AUX mode bus has assignedChannels = null (auto-assigned, not user intent)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const bus1 = topology.buses.find((b) => b.busIndex === 1)!
      expect(bus1.assignedChannels, 'AUX bus should have null assignedChannels').toBeNull()
    })

    it('aux.ch2 classified as SUBGROUP mode (busmode.value = 0.5, username = "Sub 2")', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const bus2 = topology.buses.find((b) => b.busIndex === 2)
      expect(bus2, 'aux.ch2 not found in topology').toBeDefined()
      expect(bus2!.mode).toBe('SUBGROUP')
      expect(bus2!.username).toBe('Sub 2')
    })

    it('aux.ch3 classified as SUBGROUP mode (busmode.value = 0.5, username = "Sub 3")', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const bus3 = topology.buses.find((b) => b.busIndex === 3)
      expect(bus3, 'aux.ch3 not found in topology').toBeDefined()
      expect(bus3!.mode).toBe('SUBGROUP')
      expect(bus3!.username).toBe('Sub 3')
    })

    it('aux.ch6 classified as MATRIX mode (busmode.value = 1.0, scene-agnostic username check)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const bus6 = topology.buses.find((b) => b.busIndex === 6)
      expect(bus6, 'aux.ch6 not found in topology').toBeDefined()
      expect(bus6!.mode).toBe('MATRIX')
      // username is scene-dependent — log it but don't assert specific value
      console.info(`[live] aux.ch6 username="${bus6!.username}"`)
    })

    it('SUBGROUP buses have non-null assignedChannels array (scene-agnostic)', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const subBuses = topology.buses.filter((b) => b.mode === 'SUBGROUP')
      for (const bus of subBuses) {
        expect(
          bus.assignedChannels,
          `SUBGROUP bus ${bus.busIndex} (${bus.username}) should have non-null assignedChannels`,
        ).not.toBeNull()
        expect(Array.isArray(bus.assignedChannels), `SUBGROUP bus ${bus.busIndex} assignedChannels is not array`).toBe(true)
        // Log actual members for diagnostic visibility (scene changes over time)
        console.info(`[live] flexmix sub bus ${bus.busIndex} username="${bus.username}" assignedChannels=${JSON.stringify(bus.assignedChannels)}`)
      }
    })

    it('all AUX mode buses have assignedChannels = null', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const auxBuses = topology.buses.filter((b) => b.mode === 'AUX')
      expect(auxBuses.length, 'Expected at least 5 AUX mode buses on 32SC').toBeGreaterThanOrEqual(5)
      for (const bus of auxBuses) {
        expect(
          bus.assignedChannels,
          `AUX bus ${bus.busIndex} (${bus.username}) should have null assignedChannels`,
        ).toBeNull()
      }
    })

    it('SUBGROUP buses have non-null assignedChannels array', () => {
      const snap = manager.getSnapshot(identity.deviceId)!
      const topology = extractFlexMixBusTopology(snap.flatState)
      const subgroupBuses = topology.buses.filter((b) => b.mode === 'SUBGROUP')
      expect(subgroupBuses.length, 'Expected at least 2 SUBGROUP buses').toBeGreaterThanOrEqual(2)
      for (const bus of subgroupBuses) {
        expect(
          bus.assignedChannels,
          `SUBGROUP bus ${bus.busIndex} (${bus.username}) should have non-null assignedChannels`,
        ).not.toBeNull()
      }
    })
  },
)
