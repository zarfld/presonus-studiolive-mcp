/**
 * Tests for channel setup and capability requirements validation schemas.
 *
 * Verifies: REQ-F-VAL-001 — validate_channel_setup accepts agent-provided
 * expected channel list and checks actual mixer state for mismatches.
 *
 * Verifies: REQ-F-VAL-002 — check_required_setup accepts agent-provided
 * capacity requirements and checks against mixer capabilities.
 *
 * TDD: RED phase — written before validation.ts schema exists.
 */
import { describe, it, expect } from 'vitest'
import {
  ChannelSetupValidationResultSchema,
  MixerRequirementsSchema,
  RequirementsCheckResultSchema,
} from '../schemas/validation.js'

describe('ChannelSetupValidationResultSchema', () => {
  it('parses an ok result', () => {
    const result = ChannelSetupValidationResultSchema.parse({
      status: 'ok',
      issues: [],
    })
    expect(result.status).toBe('ok')
    expect(result.issues).toHaveLength(0)
  })

  it('parses a warning with name mismatch issue', () => {
    const result = ChannelSetupValidationResultSchema.parse({
      status: 'warning',
      issues: [
        {
          channel: 8,
          issue: 'expected_name_mismatch',
          current: 'Vox',
          expected: 'Lead Vox',
          severity: 'low',
        },
      ],
    })
    expect(result.issues[0]?.issue).toBe('expected_name_mismatch')
    expect(result.issues[0]?.severity).toBe('low')
  })

  it('parses a problem with muted expected channel', () => {
    const result = ChannelSetupValidationResultSchema.parse({
      status: 'problem',
      issues: [
        {
          channel: 8,
          issue: 'muted_expected_channel',
          current: 'muted',
          expected: 'active',
          severity: 'high',
        },
      ],
    })
    expect(result.status).toBe('problem')
  })
})

describe('MixerRequirementsSchema', () => {
  it('parses partial requirements (only specified fields matter)', () => {
    const result = MixerRequirementsSchema.parse({
      inputChannels: 18,
      monitorMixes: 5,
    })
    expect(result.inputChannels).toBe(18)
    expect(result.monitorMixes).toBe(5)
    expect(result.fxBuses).toBeUndefined()
  })

  it('parses full requirements', () => {
    const result = MixerRequirementsSchema.parse({
      inputChannels: 32,
      monitorMixes: 16,
      fxBuses: 4,
      stageboxRequired: true,
    })
    expect(result.stageboxRequired).toBe(true)
  })
})

describe('RequirementsCheckResultSchema', () => {
  it('parses an ok result', () => {
    const result = RequirementsCheckResultSchema.parse({
      status: 'ok',
      checks: [
        { requirement: 'inputChannels', required: 18, available: 32, status: 'ok' },
        { requirement: 'monitorMixes', required: 5, available: 16, status: 'ok' },
      ],
    })
    expect(result.status).toBe('ok')
    expect(result.checks).toHaveLength(2)
  })

  it('parses a problem result when requirement exceeds available', () => {
    const result = RequirementsCheckResultSchema.parse({
      status: 'problem',
      checks: [
        { requirement: 'monitorMixes', required: 20, available: 16, status: 'insufficient' },
      ],
    })
    expect(result.checks[0]?.status).toBe('insufficient')
  })
})
