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
  AuxMixAuditIssueSchema,
  AuxMixAuditResultSchema,
  HOT_SEND_THRESHOLD_DB,
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

// ---------------------------------------------------------------------------
// AuxMixAuditIssueSchema — ADR-008, REQ-F-AUX-005
// ---------------------------------------------------------------------------

describe('AuxMixAuditIssueSchema', () => {
  it('parses an unassigned_send issue', () => {
    const result = AuxMixAuditIssueSchema.parse({
      issueType: 'unassigned_send',
      auxMixNumber: 3,
      channel: 5,
      channelName: 'Kick',
      severity: 'high',
      detail: 'Channel not assigned to Aux 3',
      level: 0,
      levelDb: null,
    })
    expect(result.issueType).toBe('unassigned_send')
    expect(result.severity).toBe('high')
  })

  it('parses all 5 issue types', () => {
    const types = ['unassigned_send', 'muted_send', 'very_low_send', 'hot_send', 'master_muted'] as const
    for (const issueType of types) {
      const result = AuxMixAuditIssueSchema.parse({
        issueType,
        auxMixNumber: 1,
        channel: 1,
        channelName: 'Test',
        severity: 'high',
        detail: 'test',
      })
      expect(result.issueType).toBe(issueType)
    }
  })

  it('rejects unknown issueType', () => {
    expect(() =>
      AuxMixAuditIssueSchema.parse({
        issueType: 'not_a_type',
        auxMixNumber: 1,
        channel: 1,
        channelName: 'X',
        severity: 'high',
        detail: 'x',
      }),
    ).toThrow()
  })

  it('allows absent level fields', () => {
    const result = AuxMixAuditIssueSchema.parse({
      issueType: 'master_muted',
      auxMixNumber: 1,
      channel: 0,
      channelName: 'Aux 1',
      severity: 'high',
      detail: 'Master muted',
    })
    expect(result.level).toBeUndefined()
    expect(result.levelDb).toBeUndefined()
  })
})

describe('AuxMixAuditResultSchema', () => {
  const baseAudit = {
    auxMixNumber: 2,
    name: 'Wedge 1',
    masterLevel: 0.75,
    masterMuted: false,
    sendCount: 8,
    issues: [],
    hotThresholdDb: HOT_SEND_THRESHOLD_DB,
  }

  it('parses a clean audit result (ok)', () => {
    const result = AuxMixAuditResultSchema.parse({ ...baseAudit, status: 'ok' })
    expect(result.status).toBe('ok')
    expect(result.hotThresholdDb).toBe(HOT_SEND_THRESHOLD_DB)
    expect(result.issues).toHaveLength(0)
  })

  it('parses a problem result with issues', () => {
    const result = AuxMixAuditResultSchema.parse({
      ...baseAudit,
      status: 'problem',
      issues: [{
        issueType: 'muted_send',
        auxMixNumber: 2,
        channel: 7,
        channelName: 'Lead Vox',
        severity: 'high',
        detail: 'Send muted',
        level: 0.7,
      }],
    })
    expect(result.status).toBe('problem')
    expect(result.issues).toHaveLength(1)
  })

  it('uses HOT_SEND_THRESHOLD_DB = -6', () => {
    expect(HOT_SEND_THRESHOLD_DB).toBe(-6)
  })
})
