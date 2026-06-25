/**
 * Tests for probe-routing command utilities.
 *
 * Verifies: #46 REQ-F-PROBE-002 — probe-routing CLI command
 * Architecture: #47 ADR-008
 */
import { describe, it, expect } from 'vitest'
import { getGrepPatterns, VALID_KINDS, type RoutingKindFilter } from '../cli/commands/probe-routing.js'

describe('getGrepPatterns', () => {
  it('returns default routing patterns when no kind specified', () => {
    const patterns = getGrepPatterns(undefined, undefined)
    expect(patterns).toContain('aux')
    expect(patterns).toContain('avb')
    expect(patterns).toContain('source')
    expect(patterns).toContain('assign')
  })

  it('returns narrow patterns for channel-to-aux', () => {
    const patterns = getGrepPatterns('channel-to-aux', undefined)
    expect(patterns).toContain('aux')
    expect(patterns).toContain('assign_aux')
    expect(patterns).not.toContain('avb')
    expect(patterns).not.toContain('source')
  })

  it('returns narrow patterns for channel-to-fx', () => {
    const patterns = getGrepPatterns('channel-to-fx', undefined)
    expect(patterns).toContain('FX')
    expect(patterns).toContain('assign_FX')
  })

  it('returns avb patterns for avb-stream', () => {
    const patterns = getGrepPatterns('avb-stream', undefined)
    expect(patterns).toContain('avb')
    expect(patterns).toContain('network')
  })

  it('returns outputpatchrouter for bus-to-output', () => {
    const patterns = getGrepPatterns('bus-to-output', undefined)
    expect(patterns).toContain('outputpatchrouter')
  })

  it('includes extra grep patterns on top of kind patterns', () => {
    const patterns = getGrepPatterns('channel-to-aux', 'stagebox, custom_key')
    expect(patterns).toContain('aux')
    expect(patterns).toContain('stagebox')
    expect(patterns).toContain('custom_key')
  })

  it('includes extra grep patterns with no kind', () => {
    const patterns = getGrepPatterns(undefined, 'my_key')
    expect(patterns).toContain('my_key')
    expect(patterns).toContain('aux')  // default still present
  })

  it('throws on unknown kind', () => {
    expect(() => getGrepPatterns('not-a-kind', undefined)).toThrow(/Unknown --kind/)
  })

  it('throws with list of valid kinds in error message', () => {
    try {
      getGrepPatterns('bad', undefined)
    } catch (err) {
      const msg = (err as Error).message
      for (const kind of VALID_KINDS) {
        expect(msg).toContain(kind)
      }
    }
  })
})

describe('VALID_KINDS', () => {
  it('has all 8 RoutingKind values', () => {
    const expected: RoutingKindFilter[] = [
      'channel-to-aux',
      'channel-to-fx',
      'fx-return-to-aux',
      'talkback-to-aux',
      'input-source',
      'bus-to-output',
      'avb-stream',
      'stagebox',
    ]
    expect(VALID_KINDS).toHaveLength(8)
    for (const kind of expected) {
      expect(VALID_KINDS).toContain(kind)
    }
  })
})
