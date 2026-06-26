/**
 * Unit tests for extractFixedSubGroups — CI (no hardware required).
 *
 * Fixture values are taken verbatim from the 2026-06-26 HIL capture
 * (StudioLive 32SC, SD7E21010066, fw 3.3.0.109659, 22786 keys).
 *
 * Mixer configuration at capture time:
 *   sub.ch1 "Sub A" — mono (link=0)
 *   sub.ch2 "Sub B" — mono (link=0)
 *   sub.ch3 "Sub C" — stereolinked MASTER (link=1, linkmaster=1)
 *   sub.ch4 "Sub D" — stereolinked SLAVE  (link=1, linkmaster=0)
 *
 * Sub A: ch3, ch4  (line.ch3.sub1=1, line.ch4.sub1=1)
 * Sub B: ch11, ch16
 * Sub C+D (stereo pair): ch5, ch6, ch7, ch8  (sub3=1 AND sub4=1 on all four channels)
 *
 * @verifies REQ-F-FIXEDSUB-001 (#85)
 * @implements TEST — mock counterpart to fixed-subgroups.hil.test.ts
 */
import { describe, it, expect } from 'vitest'
import { extractFixedSubGroups } from '@presonus-mcp/adapter'

// ─── Fixture: sparse flat state from 2026-06-26 HIL capture ─────────────────

const FIXED_SUB_FIXTURE: Record<string, unknown> = {
  // ── Sub A (sub.ch1) — mono ────────────────────────────────────────────────
  'sub.ch1.chnum': 'Sb A',
  'sub.ch1.username': 'Sub A',
  'sub.ch1.volume': 0,            // raw 0/100 → 0.0 normalized (fader down in capture)
  'sub.ch1.mute': false,
  'sub.ch1.link': 0,
  'sub.ch1.linkmaster': 0,
  'sub.ch1.panlinkstate': 0,

  // Sub A assigned channels:
  'line.ch3.sub1': 1,
  'line.ch4.sub1': 1,

  // ── Sub B (sub.ch2) — mono ────────────────────────────────────────────────
  'sub.ch2.chnum': 'Sb B',
  'sub.ch2.username': 'Sub B',
  'sub.ch2.volume': 0,
  'sub.ch2.mute': false,
  'sub.ch2.link': 0,
  'sub.ch2.linkmaster': 0,
  'sub.ch2.panlinkstate': 0,

  // Sub B assigned channels:
  'line.ch11.sub2': 1,
  'line.ch16.sub2': 1,

  // ── Sub C (sub.ch3) — STEREO MASTER ──────────────────────────────────────
  'sub.ch3.chnum': 'Sb C',
  'sub.ch3.username': 'Sub C',
  'sub.ch3.volume': 0,
  'sub.ch3.mute': false,
  'sub.ch3.link': 1,
  'sub.ch3.linkmaster': 1,
  'sub.ch3.panlinkstate': 1,

  // Sub C channels (stereolinked — protocol sets both sub3 AND sub4):
  'line.ch5.sub3': 1,
  'line.ch6.sub3': 1,
  'line.ch7.sub3': 1,
  'line.ch8.sub3': 1,

  // ── Sub D (sub.ch4) — STEREO SLAVE ───────────────────────────────────────
  'sub.ch4.chnum': 'Sb D',
  'sub.ch4.username': 'Sub D',
  'sub.ch4.volume': 0,
  'sub.ch4.mute': false,
  'sub.ch4.link': 1,
  'sub.ch4.linkmaster': 0,
  'sub.ch4.panlinkstate': 1,

  // Sub D channels (mirror of Sub C — same channels assigned to the stereo pair):
  'line.ch5.sub4': 1,
  'line.ch6.sub4': 1,
  'line.ch7.sub4': 1,
  'line.ch8.sub4': 1,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('extractFixedSubGroups — bus discovery (REQ-F-FIXEDSUB-001 #85)', () => {
  it('returns exactly 4 buses from fixture', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    expect(topology.buses).toHaveLength(4)
  })

  it('topology.confidence is high', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    expect(topology.confidence).toBe('high')
  })

  it('returns 0 buses and confidence=high for empty flat state', () => {
    const topology = extractFixedSubGroups({})
    expect(topology.buses).toHaveLength(0)
    expect(topology.confidence).toBe('high')
    expect(topology.stereoPairs).toHaveLength(0)
  })

  it('buses are sorted ascending by busIndex', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const indices = topology.buses.map((b) => b.busIndex)
    expect(indices).toEqual([1, 2, 3, 4])
  })
})

describe('extractFixedSubGroups — Sub A and Sub B (mono)', () => {
  it('sub.ch1 = Sub A: username, chnum, stereoLinked=false', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subA = topology.buses.find((b) => b.busIndex === 1)!
    expect(subA.username).toBe('Sub A')
    expect(subA.chnum).toBe('Sb A')
    expect(subA.stereoLinked).toBe(false)
    expect(subA.isLinkMaster).toBe(false)
    expect(subA.stereoPartnerIndex).toBeNull()
  })

  it('sub.ch1 assignedChannels = [3, 4]', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subA = topology.buses.find((b) => b.busIndex === 1)!
    expect(subA.assignedChannels).toEqual([3, 4])
  })

  it('sub.ch2 = Sub B: username, chnum, stereoLinked=false', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subB = topology.buses.find((b) => b.busIndex === 2)!
    expect(subB.username).toBe('Sub B')
    expect(subB.chnum).toBe('Sb B')
    expect(subB.stereoLinked).toBe(false)
    expect(subB.isLinkMaster).toBe(false)
    expect(subB.stereoPartnerIndex).toBeNull()
  })

  it('sub.ch2 assignedChannels = [11, 16]', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subB = topology.buses.find((b) => b.busIndex === 2)!
    expect(subB.assignedChannels).toEqual([11, 16])
  })

  it('assignedChannels is sorted ascending', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subB = topology.buses.find((b) => b.busIndex === 2)!
    const sorted = [...subB.assignedChannels].sort((a, b) => a - b)
    expect(subB.assignedChannels).toEqual(sorted)
  })

  it('volume = 0 (raw 0/100 → 0.0 normalized)', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subA = topology.buses.find((b) => b.busIndex === 1)!
    expect(subA.volume).toBe(0)
  })

  it('volume normalization: raw 75 → 0.75', () => {
    const topology = extractFixedSubGroups({ 'sub.ch1.username': 'Sub A', 'sub.ch1.volume': 75 })
    expect(topology.buses[0]!.volume).toBe(0.75)
  })

  it('volume normalization: raw 100 → 1.0 (clamped)', () => {
    const topology = extractFixedSubGroups({ 'sub.ch1.username': 'Sub A', 'sub.ch1.volume': 100 })
    expect(topology.buses[0]!.volume).toBe(1.0)
  })

  it('mute state extracted correctly', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subA = topology.buses.find((b) => b.busIndex === 1)!
    expect(subA.muted).toBe(false)
  })
})

describe('extractFixedSubGroups — Sub C+D stereolinked pair', () => {
  it('sub.ch3 = Sub C: stereoLinked=true, isLinkMaster=true, partner=4', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subC = topology.buses.find((b) => b.busIndex === 3)!
    expect(subC.username).toBe('Sub C')
    expect(subC.stereoLinked).toBe(true)
    expect(subC.isLinkMaster).toBe(true)
    expect(subC.stereoPartnerIndex).toBe(4)
  })

  it('sub.ch4 = Sub D: stereoLinked=true, isLinkMaster=false, partner=3', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subD = topology.buses.find((b) => b.busIndex === 4)!
    expect(subD.username).toBe('Sub D')
    expect(subD.stereoLinked).toBe(true)
    expect(subD.isLinkMaster).toBe(false)
    expect(subD.stereoPartnerIndex).toBe(3)
  })

  it('stereoPairs has exactly one pair: masterIndex=3, slaveIndex=4', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    expect(topology.stereoPairs).toHaveLength(1)
    expect(topology.stereoPairs[0]!.masterIndex).toBe(3)
    expect(topology.stereoPairs[0]!.slaveIndex).toBe(4)
  })

  it('Sub C assignedChannels = [5, 6, 7, 8]', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subC = topology.buses.find((b) => b.busIndex === 3)!
    expect(subC.assignedChannels).toEqual([5, 6, 7, 8])
  })

  it('Sub D assignedChannels mirrors Sub C (both sub3=1 AND sub4=1 on stereo channels)', () => {
    const topology = extractFixedSubGroups(FIXED_SUB_FIXTURE)
    const subC = topology.buses.find((b) => b.busIndex === 3)!
    const subD = topology.buses.find((b) => b.busIndex === 4)!
    expect(subD.assignedChannels).toEqual(subC.assignedChannels)
  })

  it('no stereoPairs when no links present', () => {
    const noLink: Record<string, unknown> = {
      'sub.ch1.username': 'Sub A', 'sub.ch1.link': 0, 'sub.ch1.linkmaster': 0,
      'sub.ch2.username': 'Sub B', 'sub.ch2.link': 0, 'sub.ch2.linkmaster': 0,
      'sub.ch3.username': 'Sub C', 'sub.ch3.link': 0, 'sub.ch3.linkmaster': 0,
      'sub.ch4.username': 'Sub D', 'sub.ch4.link': 0, 'sub.ch4.linkmaster': 0,
    }
    const topology = extractFixedSubGroups(noLink)
    expect(topology.stereoPairs).toHaveLength(0)
    for (const bus of topology.buses) {
      expect(bus.stereoLinked).toBe(false)
      expect(bus.stereoPartnerIndex).toBeNull()
    }
  })
})
