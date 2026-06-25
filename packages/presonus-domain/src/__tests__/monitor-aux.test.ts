/**
 * Tests for aux mix schemas (monitor sends, IEM mixes).
 *
 * Verifies: REQ-F-AUX-001 — MCP server shall expose aux mix state so that
 * the sound engineer agent can validate monitor/IEM sends.
 *
 * TDD: RED phase — written before aux.ts schema exists.
 * Note: Windows reserves "AUX" as a device name; file is named monitor-aux.test.ts.
 */
import { describe, it, expect } from 'vitest'
import {
  AuxMixSendSchema,
  AuxMixSchema,
  AuxMixSummarySchema,
  MonitorRequirementsInputSchema,
  MonitorRequirementsResultSchema,
} from '../schemas/mixauxes.js'

describe('AuxMixSendSchema', () => {
  it('parses a valid aux send', () => {
    const result = AuxMixSendSchema.parse({
      fromChannel: 8,
      fromChannelName: 'Lead Vox',
      auxMixNumber: 1,
      level: 0.75,
      levelDb: -3.5,
      prePost: 'post',
      muted: false,
    })
    expect(result.fromChannel).toBe(8)
    expect(result.prePost).toBe('post')
    expect(result.muted).toBe(false)
  })

  it('accepts unknown prePost when not determinable', () => {
    const result = AuxMixSendSchema.parse({
      fromChannel: 1,
      fromChannelName: 'Kick',
      auxMixNumber: 2,
      level: 0.5,
      levelDb: -6.0,
      prePost: 'unknown',
      muted: false,
    })
    expect(result.prePost).toBe('unknown')
  })
})

describe('AuxMixSchema', () => {
  it('parses an aux mix with sends', () => {
    const result = AuxMixSchema.parse({
      auxMixNumber: 1,
      name: 'Wedge 1',
      masterLevel: 0.8,
      masterMuted: false,
      sends: [
        { fromChannel: 8, fromChannelName: 'Lead Vox', auxMixNumber: 1, level: 0.9, levelDb: -1.5, prePost: 'post', muted: false },
        { fromChannel: 4, fromChannelName: 'Guitar', auxMixNumber: 1, level: 0.6, levelDb: -5.0, prePost: 'post', muted: false },
      ],
    })
    expect(result.sends).toHaveLength(2)
    expect(result.masterMuted).toBe(false)
  })
})

describe('AuxMixSummarySchema', () => {
  it('parses a summary with multiple aux mixes', () => {
    const result = AuxMixSummarySchema.parse({
      deviceId: 'serial:ABC',
      capturedAt: new Date().toISOString(),
      auxMixes: [
        {
          auxMixNumber: 1,
          name: 'Wedge 1',
          masterLevel: 0.8,
          masterMuted: false,
          sends: [],
        },
      ],
    })
    expect(result.auxMixes).toHaveLength(1)
  })

  it('includes _stale flag when provided', () => {
    const result = AuxMixSummarySchema.parse({
      deviceId: 'serial:ABC',
      capturedAt: new Date().toISOString(),
      auxMixes: [],
      _stale: true,
    })
    expect(result._stale).toBe(true)
  })
})

describe('MonitorRequirementsInputSchema', () => {
  it('parses valid monitor requirements', () => {
    const result = MonitorRequirementsInputSchema.parse({
      deviceId: 'serial:ABC',
      auxMix: 1,
      expectedSends: [
        { channel: 8, name: 'Lead Vox', minimumPresence: 'strong' },
        { channel: 4, name: 'Guitar', minimumPresence: 'medium' },
      ],
    })
    expect(result.expectedSends).toHaveLength(2)
    expect(result.expectedSends[0]?.minimumPresence).toBe('strong')
  })
})

describe('MonitorRequirementsResultSchema', () => {
  it('parses a result with a missing send issue', () => {
    const result = MonitorRequirementsResultSchema.parse({
      status: 'warning',
      issues: [
        {
          type: 'missing_monitor_send',
          auxMix: 1,
          channel: 8,
          name: 'Lead Vox',
          severity: 'high',
        },
      ],
    })
    expect(result.status).toBe('warning')
    expect(result.issues[0]?.type).toBe('missing_monitor_send')
  })

  it('parses an ok result with no issues', () => {
    const result = MonitorRequirementsResultSchema.parse({
      status: 'ok',
      issues: [],
    })
    expect(result.status).toBe('ok')
  })
})
