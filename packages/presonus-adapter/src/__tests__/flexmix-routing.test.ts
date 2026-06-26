/**
 * Unit tests for extractFlexMixBusTopology — CI (no hardware required).
 *
 * Fixture values are taken verbatim from the 2026-06-26 HIL capture
 * (StudioLive 32SC, SD7E21010066, fw 3.3.0.109659, 22786 keys).
 *
 * Mixer configuration at capture time:
 *   aux.ch2 → "Sub 2" (SubGroup mode, busmode.value=0.5)
 *   aux.ch3 → "Sub 3" (SubGroup mode, busmode.value=0.5)
 *   aux.ch6 → "Mtx 6" (Matrix mode,   busmode.value=1.0)
 *   aux.ch1,4,5,7,8 → Aux N (AUX mode, busmode.value=0)
 *
 * Sub 2 assigned: line.ch10, ch11, ch12, ch14, ch15  (assign_aux2=true)
 * Sub 3 assigned: line.ch4, ch5, ch6, ch7             (assign_aux3=true)
 *
 * @verifies REQ-F-FLEXMIX-001 (#84)
 * @implements TEST — mock counterpart to flexmix-routing.hil.test.ts
 */
import { describe, it, expect } from 'vitest'
import { extractFlexMixBusTopology } from '@presonus-mcp/adapter'

// ─── Fixture: sparse flat state from 2026-06-26 HIL capture ─────────────────
//
// Includes only the keys relevant to FlexMix topology.
// Values are EXACT copies from the live capture (not modified or rounded).

const FLEXMIX_FIXTURE: Record<string, unknown> = {
  // ── FlexMix1 (aux.ch1) — AUX mode ────────────────────────────────────────
  'aux.ch1.busmode.strings': 8,
  'aux.ch1.busmode.value': 0,
  'aux.ch1.username': 'Aux 1',
  'aux.ch1.chnum': 'Ax 1',
  'aux.ch1.panlinkstate': 0,

  // ── FlexMix2 (aux.ch2) — SUBGROUP mode: "Sub 2" ──────────────────────────
  'aux.ch2.busmode.strings': 8,
  'aux.ch2.busmode.value': 0.5,
  'aux.ch2.username': 'Sub 2',
  'aux.ch2.chnum': 'Sb 2',
  'aux.ch2.panlinkstate': 0,

  // ── FlexMix3 (aux.ch3) — SUBGROUP mode: "Sub 3" ──────────────────────────
  'aux.ch3.busmode.strings': 8,
  'aux.ch3.busmode.value': 0.5,
  'aux.ch3.username': 'Sub 3',
  'aux.ch3.chnum': 'Sb 3',
  'aux.ch3.panlinkstate': 0,

  // ── FlexMix4 (aux.ch4) — AUX mode ────────────────────────────────────────
  'aux.ch4.busmode.strings': 8,
  'aux.ch4.busmode.value': 0,
  'aux.ch4.username': 'Aux 4',
  'aux.ch4.chnum': 'Ax 4',
  'aux.ch4.panlinkstate': 0,

  // ── FlexMix5 (aux.ch5) — AUX mode ────────────────────────────────────────
  'aux.ch5.busmode.strings': 8,
  'aux.ch5.busmode.value': 0,
  'aux.ch5.username': 'Aux 5',
  'aux.ch5.chnum': 'Ax 5',
  'aux.ch5.panlinkstate': 0,

  // ── FlexMix6 (aux.ch6) — MATRIX mode: "Mtx 6" ───────────────────────────
  'aux.ch6.busmode.strings': 8,
  'aux.ch6.busmode.value': 1,
  'aux.ch6.username': 'Mtx 6',
  'aux.ch6.chnum': 'Mx 6',
  'aux.ch6.panlinkstate': 0,

  // ── FlexMix7, FlexMix8 — AUX mode ────────────────────────────────────────
  'aux.ch7.busmode.strings': 8,
  'aux.ch7.busmode.value': 0,
  'aux.ch7.username': 'Aux 7',
  'aux.ch7.chnum': 'Ax 7',
  'aux.ch7.panlinkstate': 0,

  'aux.ch8.busmode.strings': 8,
  'aux.ch8.busmode.value': 0,
  'aux.ch8.username': 'Aux 8',
  'aux.ch8.chnum': 'Ax 8',
  'aux.ch8.panlinkstate': 0,

  // ── Sub 2 assignments (assign_aux2): channels 10,11,12,14,15 = true ───────
  // Channels NOT in Sub 2 (explicitly false in capture):
  'line.ch1.assign_aux2': false,
  'line.ch2.assign_aux2': false,
  'line.ch3.assign_aux2': false,
  'line.ch4.assign_aux2': false,
  'line.ch5.assign_aux2': false,
  'line.ch6.assign_aux2': false,
  'line.ch7.assign_aux2': false,
  'line.ch8.assign_aux2': false,
  'line.ch9.assign_aux2': false,
  // Channels IN Sub 2:
  'line.ch10.assign_aux2': true,
  'line.ch11.assign_aux2': true,
  'line.ch12.assign_aux2': true,
  'line.ch13.assign_aux2': false,
  'line.ch14.assign_aux2': true,
  'line.ch15.assign_aux2': true,
  'line.ch16.assign_aux2': false,

  // ── Sub 3 assignments (assign_aux3): channels 4,5,6,7 = true ─────────────
  // Channels NOT in Sub 3 (explicitly false in capture):
  'line.ch1.assign_aux3': false,
  'line.ch2.assign_aux3': false,
  'line.ch3.assign_aux3': false,
  // Channels IN Sub 3:
  'line.ch4.assign_aux3': true,
  'line.ch5.assign_aux3': true,
  'line.ch6.assign_aux3': true,
  'line.ch7.assign_aux3': true,
  // Channels NOT in Sub 3:
  'line.ch8.assign_aux3': false,
  'line.ch9.assign_aux3': false,
  'line.ch10.assign_aux3': false,
  'line.ch11.assign_aux3': false,
  'line.ch12.assign_aux3': false,
  'line.ch13.assign_aux3': false,
  'line.ch14.assign_aux3': false,
  'line.ch15.assign_aux3': false,
  'line.ch16.assign_aux3': false,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('extractFlexMixBusTopology — AUX mode (REQ-F-FLEXMIX-001 #84)', () => {
  it('returns 8 buses from fixture', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    expect(topology.buses).toHaveLength(8)
  })

  it('topology.confidence is high', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    expect(topology.confidence).toBe('high')
  })

  it('returns empty buses and confidence=high for empty flat state', () => {
    const topology = extractFlexMixBusTopology({})
    expect(topology.buses).toHaveLength(0)
    expect(topology.confidence).toBe('high')
  })

  it('aux.ch1 mode = AUX (busmode.value = 0)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus1 = topology.buses.find((b) => b.busIndex === 1)!
    expect(bus1.mode).toBe('AUX')
    expect(bus1.username).toBe('Aux 1')
    expect(bus1.chnum).toBe('Ax 1')
    expect(bus1.busmodeRaw).toBe(0)
  })

  it('AUX mode bus has assignedChannels = null (not user intent)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus1 = topology.buses.find((b) => b.busIndex === 1)!
    expect(bus1.assignedChannels).toBeNull()
  })

  it('all 5 AUX mode buses have assignedChannels = null', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const auxBuses = topology.buses.filter((b) => b.mode === 'AUX')
    expect(auxBuses).toHaveLength(5)   // ch1, ch4, ch5, ch7, ch8
    for (const bus of auxBuses) {
      expect(bus.assignedChannels, `AUX bus ${bus.busIndex} should have null assignedChannels`).toBeNull()
    }
  })
})

describe('extractFlexMixBusTopology — SUBGROUP mode (REQ-F-FLEXMIX-001 #84)', () => {
  it('aux.ch2 mode = SUBGROUP (busmode.value = 0.5)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus2 = topology.buses.find((b) => b.busIndex === 2)!
    expect(bus2.mode).toBe('SUBGROUP')
    expect(bus2.username).toBe('Sub 2')
    expect(bus2.chnum).toBe('Sb 2')
    expect(bus2.busmodeRaw).toBe(0.5)
  })

  it('aux.ch3 mode = SUBGROUP (busmode.value = 0.5)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus3 = topology.buses.find((b) => b.busIndex === 3)!
    expect(bus3.mode).toBe('SUBGROUP')
    expect(bus3.username).toBe('Sub 3')
    expect(bus3.chnum).toBe('Sb 3')
  })

  it('Sub 2 (aux.ch2) assignedChannels = [10, 11, 12, 14, 15]', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus2 = topology.buses.find((b) => b.busIndex === 2)!
    expect(bus2.assignedChannels).not.toBeNull()
    expect(bus2.assignedChannels).toEqual([10, 11, 12, 14, 15])
  })

  it('Sub 3 (aux.ch3) assignedChannels = [4, 5, 6, 7]', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus3 = topology.buses.find((b) => b.busIndex === 3)!
    expect(bus3.assignedChannels).not.toBeNull()
    expect(bus3.assignedChannels).toEqual([4, 5, 6, 7])
  })

  it('assignedChannels is sorted ascending', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus2 = topology.buses.find((b) => b.busIndex === 2)!
    const sorted = [...bus2.assignedChannels!].sort((a, b) => a - b)
    expect(bus2.assignedChannels).toEqual(sorted)
  })

  it('channel 13 is NOT in Sub 2 assignedChannels (assign_aux2=false)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus2 = topology.buses.find((b) => b.busIndex === 2)!
    expect(bus2.assignedChannels).not.toContain(13)
  })

  it('channel 8 is NOT in Sub 3 assignedChannels (assign_aux3=false)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus3 = topology.buses.find((b) => b.busIndex === 3)!
    expect(bus3.assignedChannels).not.toContain(8)
  })
})

describe('extractFlexMixBusTopology — MATRIX mode (REQ-F-FLEXMIX-001 #84)', () => {
  it('aux.ch6 mode = MATRIX (busmode.value = 1.0)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus6 = topology.buses.find((b) => b.busIndex === 6)!
    expect(bus6.mode).toBe('MATRIX')
    expect(bus6.username).toBe('Mtx 6')
    expect(bus6.chnum).toBe('Mx 6')
    expect(bus6.busmodeRaw).toBe(1)
  })

  it('MATRIX bus has non-null assignedChannels array (may be empty)', () => {
    const topology = extractFlexMixBusTopology(FLEXMIX_FIXTURE)
    const bus6 = topology.buses.find((b) => b.busIndex === 6)!
    expect(bus6.assignedChannels).not.toBeNull()
    expect(Array.isArray(bus6.assignedChannels)).toBe(true)
  })
})

describe('extractFlexMixBusTopology — busmode decode formula', () => {
  it('busmode 0.0 → AUX (index=0)', () => {
    const topology = extractFlexMixBusTopology({ 'aux.ch1.busmode.value': 0, 'aux.ch1.username': 'Aux 1' })
    expect(topology.buses[0]!.mode).toBe('AUX')
  })

  it('busmode 0.5 → SUBGROUP (Math.round(0.5*7)=4)', () => {
    const topology = extractFlexMixBusTopology({ 'aux.ch1.busmode.value': 0.5, 'aux.ch1.username': 'Sub X' })
    expect(topology.buses[0]!.mode).toBe('SUBGROUP')
  })

  it('busmode 1.0 → MATRIX (Math.round(1.0*7)=7)', () => {
    const topology = extractFlexMixBusTopology({ 'aux.ch1.busmode.value': 1, 'aux.ch1.username': 'Mtx X' })
    expect(topology.buses[0]!.mode).toBe('MATRIX')
  })

  it('missing busmode key defaults to AUX (value=0 implied)', () => {
    const topology = extractFlexMixBusTopology({ 'aux.ch1.username': 'Aux 1' })
    // No busmode.value key → bus not discovered (requires busmode.value key to be present)
    expect(topology.buses).toHaveLength(0)
  })
})
