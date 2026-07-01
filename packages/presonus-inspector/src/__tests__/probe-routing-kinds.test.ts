/**
 * Mock tests for probe-routing --kind filter patterns and VALID_KINDS completeness.
 *
 * @implements REQ-F-PROBE-002 (#46) — probe-routing CLI with --kind filter
 * @implements TEST-PROBE-002 (#60)  — kind filter patterns and VALID_KINDS completeness
 * @implements QA-SC-PROBE-001 (#50) — invalid --kind → helpful error guidance
 * @verifies #46 REQ-F-PROBE-002 — probe-routing --kind filter patterns
 * Traces to: EPIC-PROBE-HIL (#68)
 *
 * These tests verify the CLI-side kind filtering logic without requiring hardware.
 * The functions under test are exported from probe-routing.ts:
 *   - VALID_KINDS: string[] — all supported routing kinds
 *   - KIND_GREP_MAP: Record<RoutingKindFilter, string[]> — patterns per kind
 *   - getGrepPatterns(kind, extraGrep) — returns effective patterns
 *   - inferKindFromKey(key) — classifies a state key into a routing kind
 */
import { describe, it, expect } from 'vitest'
import {
  VALID_KINDS,
  getGrepPatterns,
} from '../cli/commands/probe-routing.js'

// We also need inferKindFromKey — it's not currently exported, so test via
// the observable effect (diff output annotation). If it needs to be tested
// directly, export it from probe-routing.ts.
// For now, test through KIND_GREP_MAP and getGrepPatterns since those are exported.

// ---------------------------------------------------------------------------
// REQ-F-PROBE-002 (#46) + TEST #60: VALID_KINDS completeness
// ---------------------------------------------------------------------------

describe('VALID_KINDS completeness (REQ-F-PROBE-002 #46, TEST #60)', () => {
  /**
   * Verifies: REQ-F-PROBE-002 (#46) — probe-routing CLI --kind filter
   * Verifies: TEST-PROBE-002 (#60) — VALID_KINDS completeness test
   * Traces to: EPIC-PROBE-HIL (#68)
   *
   * ADR-008 defines 8 routing kinds across Layer A and Layer B.
   * All 8 must be present in VALID_KINDS.
   */

  it('VALID_KINDS has exactly 8 entries (all ADR-008 routing kinds)', () => {
    expect(VALID_KINDS).toHaveLength(8)
  })

  it('VALID_KINDS contains all 4 Layer A kinds (observable software state)', () => {
    expect(VALID_KINDS).toContain('channel-to-aux')
    expect(VALID_KINDS).toContain('channel-to-fx')
    expect(VALID_KINDS).toContain('fx-return-to-aux')
    expect(VALID_KINDS).toContain('talkback-to-aux')
  })

  it('VALID_KINDS contains all 4 Layer B kinds (probe-required physical routing)', () => {
    expect(VALID_KINDS).toContain('input-source')
    expect(VALID_KINDS).toContain('bus-to-output')
    expect(VALID_KINDS).toContain('avb-stream')
    expect(VALID_KINDS).toContain('stagebox')
  })

  it('VALID_KINDS has no duplicates', () => {
    const unique = new Set(VALID_KINDS)
    expect(unique.size).toBe(VALID_KINDS.length)
  })

  it('all VALID_KINDS values are non-empty strings', () => {
    for (const kind of VALID_KINDS) {
      expect(typeof kind).toBe('string')
      expect(kind.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// REQ-F-PROBE-002 (#46) + TEST #60: getGrepPatterns correctness
// ---------------------------------------------------------------------------

describe('getGrepPatterns — filter patterns (REQ-F-PROBE-002 #46, TEST #60)', () => {
  /**
   * Verifies: REQ-F-PROBE-002 (#46), TEST-PROBE-002 (#60)
   * Traces to: EPIC-PROBE-HIL (#68)
   */

  it("getGrepPatterns('channel-to-aux') includes 'aux' and 'assign_aux'", () => {
    const patterns = getGrepPatterns('channel-to-aux', undefined)
    expect(patterns).toContain('aux')
    expect(patterns).toContain('assign_aux')
  })

  it("getGrepPatterns('channel-to-fx') includes 'FX' and 'assign_FX'", () => {
    const patterns = getGrepPatterns('channel-to-fx', undefined)
    expect(patterns).toContain('FX')
    expect(patterns).toContain('assign_FX')
  })

  it("getGrepPatterns('bus-to-output') includes 'outputpatchrouter'", () => {
    const patterns = getGrepPatterns('bus-to-output', undefined)
    expect(patterns).toContain('outputpatchrouter')
  })

  it("getGrepPatterns('avb-stream') includes 'avb'", () => {
    const patterns = getGrepPatterns('avb-stream', undefined)
    expect(patterns).toContain('avb')
  })

  it("getGrepPatterns('stagebox') includes 'stagebox'", () => {
    const patterns = getGrepPatterns('stagebox', undefined)
    expect(patterns).toContain('stagebox')
  })

  it("getGrepPatterns('input-source') includes 'source' and 'input'", () => {
    const patterns = getGrepPatterns('input-source', undefined)
    expect(patterns).toContain('source')
    expect(patterns).toContain('input')
  })

  it("getGrepPatterns('fx-return-to-aux') includes 'fxreturn' and 'aux'", () => {
    const patterns = getGrepPatterns('fx-return-to-aux', undefined)
    expect(patterns).toContain('fxreturn')
    expect(patterns).toContain('aux')
  })

  it("getGrepPatterns('talkback-to-aux') includes 'talkback' and 'aux'", () => {
    const patterns = getGrepPatterns('talkback-to-aux', undefined)
    expect(patterns).toContain('talkback')
    expect(patterns).toContain('aux')
  })

  it('getGrepPatterns(undefined) returns default routing patterns including "assign"', () => {
    const patterns = getGrepPatterns(undefined, undefined)
    expect(Array.isArray(patterns)).toBe(true)
    expect(patterns.length).toBeGreaterThan(3)
    expect(patterns).toContain('assign')
  })

  it('getGrepPatterns appends extra patterns from extraGrep argument', () => {
    const patterns = getGrepPatterns('channel-to-aux', 'custom,extra')
    expect(patterns).toContain('custom')
    expect(patterns).toContain('extra')
    // Original patterns still present
    expect(patterns).toContain('aux')
  })

  it('getGrepPatterns returns array of non-empty strings', () => {
    for (const kind of VALID_KINDS) {
      const patterns = getGrepPatterns(kind, undefined)
      expect(Array.isArray(patterns)).toBe(true)
      expect(patterns.length).toBeGreaterThan(0)
      for (const p of patterns) {
        expect(typeof p).toBe('string')
        expect(p.length).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// QA-SC-PROBE-001 (#50): Invalid kind → helpful error guidance
// ---------------------------------------------------------------------------

describe('getGrepPatterns — invalid kind error guidance (QA-SC-PROBE-001 #50)', () => {
  /**
   * QA-SC-PROBE-001: "probe-routing --kind filter completeness and error guidance"
   *
   * When an invalid --kind value is passed, the error message MUST:
   *   1. Include the invalid kind value (so operator knows what they typed)
   *   2. Include the word "Valid" (or similar) to signal the list follows
   *   3. List all VALID_KINDS so the operator can correct their command
   *
   * Verifies: QA-SC-PROBE-001 (#50)
   * Traces to: EPIC-PROBE-HIL (#68)
   */

  it('throws an error for an invalid kind value', () => {
    expect(() => getGrepPatterns('bad-routing-kind', undefined)).toThrow()
  })

  it('error message includes the invalid kind value', () => {
    let caught: Error | undefined
    try {
      getGrepPatterns('totally-wrong', undefined)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeDefined()
    expect(caught!.message).toContain('totally-wrong')
  })

  it('error message contains "Valid" to signal list of valid options', () => {
    let caught: Error | undefined
    try {
      getGrepPatterns('invalid-kind', undefined)
    } catch (e) {
      caught = e as Error
    }
    expect(caught!.message).toMatch(/valid/i)
  })

  it('error message lists all 8 valid kinds', () => {
    let caught: Error | undefined
    try {
      getGrepPatterns('unknown', undefined)
    } catch (e) {
      caught = e as Error
    }
    expect(caught).toBeDefined()
    // All 8 valid kinds must appear in the error message
    for (const kind of VALID_KINDS) {
      expect(caught!.message, `Expected "${kind}" in error message`).toContain(kind)
    }
  })

  it('error message is a non-empty string (not an object or undefined)', () => {
    let caught: Error | undefined
    try {
      getGrepPatterns('bad', undefined)
    } catch (e) {
      caught = e as Error
    }
    expect(typeof caught!.message).toBe('string')
    expect(caught!.message.length).toBeGreaterThan(10)
  })
})

// ---------------------------------------------------------------------------
// REQ-F-PROBE-002 (#46): Routing key classification patterns
// These tests verify that key patterns used in probe-routing diff
// correctly match the keys seen in real StudioLive 32SC captures.
// ---------------------------------------------------------------------------

describe('KIND_GREP_MAP patterns match real capture keys (REQ-F-PROBE-002 #46)', () => {
  /**
   * Tests that the patterns in KIND_GREP_MAP correctly match the key patterns
   * observed in real StudioLive 32SC captures (2026-06-24).
   *
   * Note: These tests work by running the patterns through a regex filter,
   * mimicking what probe-routing diff does internally.
   *
   * Verifies: REQ-F-PROBE-002 (#46), TEST-PROBE-002 (#60)
   */

  function matchesKind(key: string, kind: string): boolean {
    const patterns = getGrepPatterns(kind, undefined)
    const regex = new RegExp(patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
    return regex.test(key)
  }

  // Layer A — observable from software
  it('channel-to-aux patterns match line.chN.auxM keys (real capture observed)', () => {
    expect(matchesKind('line.ch1.aux1', 'channel-to-aux')).toBe(true)
    expect(matchesKind('line.ch8.aux16', 'channel-to-aux')).toBe(true)
    expect(matchesKind('line.ch1.assign_aux1', 'channel-to-aux')).toBe(true)
    expect(matchesKind('return.ch1.aux3', 'channel-to-aux')).toBe(true)
  })

  it('channel-to-fx patterns match line.chN.FXA-H keys (real capture observed)', () => {
    expect(matchesKind('line.ch1.FXA', 'channel-to-fx')).toBe(true)
    expect(matchesKind('line.ch1.FXH', 'channel-to-fx')).toBe(true)
  })

  it('bus-to-output patterns match outputpatchrouter.* keys (real capture observed)', () => {
    expect(matchesKind('outputpatchrouter.mix1_src.value', 'bus-to-output')).toBe(true)
    expect(matchesKind('outputpatchrouter.mix2_src.range.max', 'bus-to-output')).toBe(true)
  })

  it('avb-stream patterns match avb-containing keys', () => {
    expect(matchesKind('global.avb_status', 'avb-stream')).toBe(true)
  })

  it('stagebox patterns match stagebox-containing keys', () => {
    expect(matchesKind('global.stagebox_mode', 'stagebox')).toBe(true)
  })

  // Layer B — patterns should not match Layer A keys (isolation check)
  it('bus-to-output patterns do NOT match basic channel-to-aux keys', () => {
    // outputpatchrouter is specific — aux sends should not be included
    const patchPatterns = getGrepPatterns('bus-to-output', undefined)
    const regex = new RegExp(patchPatterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
    // 'line.ch1.aux1' does not contain 'mix', 'output', or 'outputpatchrouter'
    expect(regex.test('line.ch1.aux1')).toBe(false)
  })
})
