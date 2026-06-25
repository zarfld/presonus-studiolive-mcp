/**
 * Tests for input-list and patch-sheet domain schemas.
 *
 * Verifies: REQ-F-INP-001 — validate_input_list_against_mixer contract
 * Verifies: REQ-F-INP-002 — validate_patch_sheet contract
 * Verifies: REQ-F-INP-003 — render_patch_sheet_data contract
 *
 * TDD: RED phase written before tool handlers; schema contracts define
 * what valid/invalid data looks like at the agent/MCP boundary.
 */
import { describe, it, expect } from 'vitest'
import {
  InputListEntrySchema,
  InputListValidationIssueTypeSchema,
  InputListValidationIssueSchema,
  PatchSheetRowSchema,
  InputListValidationResultSchema,
  PatchSheetValidationResultSchema,
} from '../schemas/input-list.js'

// ---------------------------------------------------------------------------
// InputListEntrySchema
// ---------------------------------------------------------------------------

describe('InputListEntrySchema — agent-provided rider input', () => {
  it('parses a minimal valid entry', () => {
    const result = InputListEntrySchema.safeParse({
      inputNo: 1,
      sourceName: 'Kick',
      phantomRequired: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.inputNo).toBe(1)
      expect(result.data.sourceName).toBe('Kick')
      expect(result.data.phantomRequired).toBe(false)
    }
  })

  it('parses a fully-specified entry with optional fields', () => {
    const result = InputListEntrySchema.safeParse({
      inputNo: 8,
      sourceName: 'Lead Vox',
      phantomRequired: false,
      micPreference: 'SM58',
      standRequired: true,
      notes: 'Center front',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.micPreference).toBe('SM58')
      expect(result.data.standRequired).toBe(true)
      expect(result.data.notes).toBe('Center front')
    }
  })

  it('rejects negative inputNo', () => {
    const result = InputListEntrySchema.safeParse({ inputNo: -1, sourceName: 'Kick', phantomRequired: false })
    expect(result.success).toBe(false)
  })

  it('rejects inputNo = 0', () => {
    const result = InputListEntrySchema.safeParse({ inputNo: 0, sourceName: 'Kick', phantomRequired: false })
    expect(result.success).toBe(false)
  })

  it('rejects missing sourceName', () => {
    const result = InputListEntrySchema.safeParse({ inputNo: 1, phantomRequired: false })
    expect(result.success).toBe(false)
  })

  it('rejects missing phantomRequired', () => {
    const result = InputListEntrySchema.safeParse({ inputNo: 1, sourceName: 'Kick' })
    expect(result.success).toBe(false)
  })

  it('allows micPreference to be omitted (optional)', () => {
    const result = InputListEntrySchema.safeParse({ inputNo: 1, sourceName: 'Kick', phantomRequired: false })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.micPreference).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// InputListValidationIssueTypeSchema
// ---------------------------------------------------------------------------

describe('InputListValidationIssueTypeSchema — all issue types are valid enum values', () => {
  const validTypes = [
    'channel_name_mismatch',
    'phantom_mismatch',
    'input_out_of_range',
    'duplicate_input_number',
    'channel_muted',
    'phantom_conflict',
  ] as const

  for (const issueType of validTypes) {
    it(`accepts "${issueType}"`, () => {
      expect(InputListValidationIssueTypeSchema.safeParse(issueType).success).toBe(true)
    })
  }

  it('rejects unknown issue type', () => {
    expect(InputListValidationIssueTypeSchema.safeParse('cable_unplugged').success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// InputListValidationIssueSchema
// ---------------------------------------------------------------------------

describe('InputListValidationIssueSchema', () => {
  it('parses a full issue with current/expected', () => {
    const result = InputListValidationIssueSchema.safeParse({
      inputNo: 8,
      issue: 'channel_name_mismatch',
      current: 'Vox',
      expected: 'Lead Vox',
      severity: 'low',
    })
    expect(result.success).toBe(true)
  })

  it('parses an issue without optional current/expected fields', () => {
    const result = InputListValidationIssueSchema.safeParse({
      inputNo: 1,
      issue: 'duplicate_input_number',
      severity: 'high',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid severity', () => {
    const result = InputListValidationIssueSchema.safeParse({
      inputNo: 1,
      issue: 'channel_muted',
      severity: 'critical',   // not in enum
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PatchSheetRowSchema
// ---------------------------------------------------------------------------

describe('PatchSheetRowSchema — grounded patch sheet output', () => {
  const validRow = {
    inputNo: 1,
    sourceName: 'Kick',
    phantomRequired: false,
    manualPatchInstruction: 'Patch Kick to FOH/stagebox input 1',
    currentMixerLabel: 'Kick',
    currentPhantomState: 'off',
    currentMuteState: 'active',
    warnings: [],
  }

  it('parses a valid patch sheet row', () => {
    expect(PatchSheetRowSchema.safeParse(validRow).success).toBe(true)
  })

  it('accepts null currentMixerLabel (channel not found on mixer)', () => {
    const result = PatchSheetRowSchema.safeParse({ ...validRow, currentMixerLabel: null })
    expect(result.success).toBe(true)
  })

  it('accepts null currentPhantomState (not readable)', () => {
    const result = PatchSheetRowSchema.safeParse({ ...validRow, currentPhantomState: null })
    expect(result.success).toBe(true)
  })

  it('accepts muted muteState', () => {
    const result = PatchSheetRowSchema.safeParse({ ...validRow, currentMuteState: 'muted' })
    expect(result.success).toBe(true)
  })

  it('accepts unknown muteState', () => {
    const result = PatchSheetRowSchema.safeParse({ ...validRow, currentMuteState: 'unknown' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid muteState', () => {
    const result = PatchSheetRowSchema.safeParse({ ...validRow, currentMuteState: 'silent' })
    expect(result.success).toBe(false)
  })

  it('accepts warnings array with strings', () => {
    const result = PatchSheetRowSchema.safeParse({ ...validRow, warnings: ['Phantom mismatch', 'Channel is muted'] })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// InputListValidationResultSchema
// ---------------------------------------------------------------------------

describe('InputListValidationResultSchema — tool output contract', () => {
  const okResult = {
    status: 'ok',
    issues: [],
    printablePatchRows: [],
  }

  it('parses ok result', () => {
    expect(InputListValidationResultSchema.safeParse(okResult).success).toBe(true)
  })

  it('parses warning result with issues', () => {
    const result = InputListValidationResultSchema.safeParse({
      status: 'warning',
      issues: [{ inputNo: 8, issue: 'channel_name_mismatch', current: 'Vox', expected: 'Lead Vox', severity: 'low' }],
      printablePatchRows: [],
    })
    expect(result.success).toBe(true)
  })

  it('parses error result', () => {
    const result = InputListValidationResultSchema.safeParse({
      status: 'error',
      issues: [{ inputNo: 3, issue: 'channel_muted', severity: 'high' }],
      printablePatchRows: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = InputListValidationResultSchema.safeParse({ status: 'info', issues: [], printablePatchRows: [] })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PatchSheetValidationResultSchema — offline validation output
// ---------------------------------------------------------------------------

describe('PatchSheetValidationResultSchema', () => {
  it('parses valid=true with no issues', () => {
    const result = PatchSheetValidationResultSchema.safeParse({ valid: true, issues: [] })
    expect(result.success).toBe(true)
  })

  it('parses valid=false with duplicate_input_number issue', () => {
    const result = PatchSheetValidationResultSchema.safeParse({
      valid: false,
      issues: [{ inputNo: 3, issue: 'duplicate_input_number', detail: 'Input 3 already assigned to "Snare"' }],
    })
    expect(result.success).toBe(true)
  })

  it('parses valid=false with input_out_of_range issue', () => {
    const result = PatchSheetValidationResultSchema.safeParse({
      valid: false,
      issues: [{ inputNo: 33, issue: 'input_out_of_range', detail: 'Input 33 exceeds maximum 32' }],
    })
    expect(result.success).toBe(true)
  })
})
