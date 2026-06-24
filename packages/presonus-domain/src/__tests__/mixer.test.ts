/**
 * Tests for MixerIdentitySchema and MixerOverviewSchema
 *
 * Verifies: REQ-F-001 (#15), REQ-F-002 (#16)
 * TDD: These tests define the contract before any adapter code is written.
 */
import { describe, it, expect } from 'vitest'
import { MixerIdentitySchema, MixerOverviewSchema, MixerRoleSchema } from '../schemas/mixer.js'

const validIdentity = {
  deviceId: 'serial:ABC123',
  serial: 'ABC123',
  configuredAlias: 'FOH-32SC',
  model: 'StudioLive 32SC',
  name: 'My 32SC',
  ip: '192.168.10.50',
  port: 53000,
  lastSeen: '2026-06-24T12:00:00.000Z',
  role: 'FOH' as const,
  controllable: false,
  confidence: 'observed' as const,
}

describe('MixerRoleSchema', () => {
  it('accepts all valid roles', () => {
    for (const role of ['FOH', 'STAGEBOX', 'MONITOR', 'UNKNOWN']) {
      expect(MixerRoleSchema.parse(role)).toBe(role)
    }
  })

  it('rejects invalid role', () => {
    expect(() => MixerRoleSchema.parse('INVALID')).toThrow()
  })
})

describe('MixerIdentitySchema', () => {
  it('parses a fully-specified identity', () => {
    const result = MixerIdentitySchema.parse(validIdentity)
    expect(result.deviceId).toBe('serial:ABC123')
    expect(result.serial).toBe('ABC123')
    expect(result.role).toBe('FOH')
    expect(result.controllable).toBe(false)
    expect(result.confidence).toBe('observed')
  })

  it('accepts identity without optional fields', () => {
    const minimal = {
      deviceId: 'ip:192.168.10.50:53000',
      ip: '192.168.10.50',
      port: 53000,
      lastSeen: '2026-06-24T12:00:00.000Z',
      role: 'UNKNOWN',
      controllable: false,
    }
    const result = MixerIdentitySchema.parse(minimal)
    expect(result.deviceId).toBe('ip:192.168.10.50:53000')
    expect(result.serial).toBeUndefined()
    // Default confidence is 'fallback'
    expect(result.confidence).toBe('fallback')
  })

  it('rejects missing required fields', () => {
    expect(() => MixerIdentitySchema.parse({})).toThrow()
    expect(() => MixerIdentitySchema.parse({ deviceId: 'x' })).toThrow()
  })

  it('rejects invalid port (must be integer)', () => {
    expect(() =>
      MixerIdentitySchema.parse({ ...validIdentity, port: 53000.5 }),
    ).toThrow()
  })

  it('rejects invalid lastSeen (must be ISO datetime)', () => {
    expect(() =>
      MixerIdentitySchema.parse({ ...validIdentity, lastSeen: 'not-a-date' }),
    ).toThrow()
  })

  it('rejects invalid confidence value', () => {
    expect(() =>
      MixerIdentitySchema.parse({ ...validIdentity, confidence: 'trusted' }),
    ).toThrow()
  })
})

describe('MixerOverviewSchema', () => {
  it('parses valid overview', () => {
    const result = MixerOverviewSchema.parse({
      identity: validIdentity,
      firmware: '6.7.0.94665',
      channelCount: 32,
      auxCount: 16,
      fxCount: 4,
    })
    expect(result.channelCount).toBe(32)
    expect(result.identity.role).toBe('FOH')
  })

  it('accepts overview with identity only', () => {
    const result = MixerOverviewSchema.parse({ identity: validIdentity })
    expect(result.firmware).toBeUndefined()
  })
})
