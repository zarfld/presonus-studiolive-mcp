/**
 * Tests for RoutingKind and MixerRoute schemas.
 *
 * Verifies: #38 REQ-F-ROUT-008 — RoutingKind + MixerRoute unified type
 * Architecture: #47 ADR-008
 */
import { describe, it, expect } from 'vitest'
import {
  RoutingKindSchema,
  MixerRouteSchema,
  MixerRoutingGraphSchema,
  RoutingConfidenceSchema,
} from '../schemas/routing.js'

describe('RoutingKindSchema', () => {
  it('accepts all 8 Layer A and Layer B kinds', () => {
    const kinds = [
      'channel-to-aux',
      'channel-to-fx',
      'fx-return-to-aux',
      'talkback-to-aux',
      'input-source',
      'bus-to-output',
      'avb-stream',
      'stagebox',
    ] as const
    for (const kind of kinds) {
      expect(RoutingKindSchema.parse(kind)).toBe(kind)
    }
  })

  it('rejects unknown kind', () => {
    expect(() => RoutingKindSchema.parse('unknown-kind')).toThrow()
  })
})

describe('RoutingConfidenceSchema', () => {
  it('accepts observed, inferred, not_verifiable_with_current_adapter', () => {
    expect(RoutingConfidenceSchema.parse('observed')).toBe('observed')
    expect(RoutingConfidenceSchema.parse('inferred')).toBe('inferred')
    expect(RoutingConfidenceSchema.parse('not_verifiable_with_current_adapter')).toBe('not_verifiable_with_current_adapter')
  })

  it('accepts stub, planned, probe_required (extended set)', () => {
    expect(RoutingConfidenceSchema.parse('stub')).toBe('stub')
    expect(RoutingConfidenceSchema.parse('planned')).toBe('planned')
    expect(RoutingConfidenceSchema.parse('probe_required')).toBe('probe_required')
  })

  it('rejects guessed (renamed to inferred per ADR-008)', () => {
    expect(() => RoutingConfidenceSchema.parse('guessed')).toThrow()
  })

  it('rejects unknown values', () => {
    expect(() => RoutingConfidenceSchema.parse('ok')).toThrow()
    expect(() => RoutingConfidenceSchema.parse('complete')).toThrow()
    expect(() => RoutingConfidenceSchema.parse('unknown')).toThrow()
  })
})

describe('MixerRouteSchema', () => {
  it('parses a minimal required-only route', () => {
    const result = MixerRouteSchema.parse({
      kind: 'channel-to-aux',
      source: 'line.ch1',
      destination: 'aux.ch3',
      confidence: 'inferred',
    })
    expect(result.kind).toBe('channel-to-aux')
    expect(result.source).toBe('line.ch1')
    expect(result.destination).toBe('aux.ch3')
    expect(result.confidence).toBe('inferred')
    // Optional fields absent
    expect(result.level).toBeUndefined()
    expect(result.assigned).toBeUndefined()
    expect(result.muted).toBeUndefined()
  })

  it('parses a full route with all optional fields', () => {
    const result = MixerRouteSchema.parse({
      kind: 'channel-to-aux',
      source: 'line.ch5',
      destination: 'aux.ch2',
      level: 0.75,
      assigned: true,
      muted: false,
      rawPath: 'line.ch5.aux2',
      rawValue: 0.75,
      confidence: 'observed',
    })
    expect(result.level).toBe(0.75)
    expect(result.assigned).toBe(true)
    expect(result.muted).toBe(false)
    expect(result.rawPath).toBe('line.ch5.aux2')
    expect(result.confidence).toBe('observed')
  })

  it('parses a Layer B not_verifiable route', () => {
    const result = MixerRouteSchema.parse({
      kind: 'input-source',
      source: 'analog.input.1',
      destination: 'line.ch1',
      confidence: 'not_verifiable_with_current_adapter',
    })
    expect(result.kind).toBe('input-source')
    expect(result.confidence).toBe('not_verifiable_with_current_adapter')
  })

  it('rejects route with invalid kind', () => {
    expect(() => MixerRouteSchema.parse({
      kind: 'bad-kind',
      source: 'x',
      destination: 'y',
      confidence: 'inferred',
    })).toThrow()
  })
})

describe('MixerRoutingGraphSchema', () => {
  it('parses a valid routing graph with summary', () => {
    const result = MixerRoutingGraphSchema.parse({
      deviceId: 'SD7E21010066',
      capturedAt: new Date().toISOString(),
      routes: [
        { kind: 'channel-to-aux', source: 'line.ch1', destination: 'aux.ch3', level: 0.5, confidence: 'inferred' },
        { kind: 'channel-to-fx', source: 'line.ch2', destination: 'fxbus.chA', confidence: 'inferred' },
      ],
      summary: {
        byKind: { 'channel-to-aux': 1, 'channel-to-fx': 1 },
        observed: 0,
        inferred: 2,
        not_verifiable: 0,
      },
    })
    expect(result.routes).toHaveLength(2)
    expect(result.summary.inferred).toBe(2)
    expect(result.summary.observed).toBe(0)
  })
})
