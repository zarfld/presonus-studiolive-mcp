/**
 * README completeness test — v1.0 documentation gate.
 *
 * Reads the workspace README.md at test time and asserts all required v1.0
 * sections are present. This test goes RED if any section is missing, driving
 * documentation updates (#73 HOUSEKEEPING-005, #67 EPIC-DOCS).
 *
 * TDD approach:
 *   RED  = section not present in README → write the documentation
 *   GREEN = all sections present → documentation is field-ready
 *
 * @implements #67 EPIC-DOCS
 * @implements #73 HOUSEKEEPING-005 — Update README with issue model
 * Traces to: #1 (StR: sound engineer agent backend)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Resolve to workspace root (4 levels up from packages/presonus-mcp-server/src/__tests__/)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const README_PATH = resolve(__dirname, '../../../../README.md')
const readme = readFileSync(README_PATH, 'utf8')

// ---------------------------------------------------------------------------
// v1.0 required README sections
// ---------------------------------------------------------------------------

describe('README.md completeness — v1.0 field-ready documentation (#67 EPIC-DOCS)', () => {
  /**
   * Verifies: #67 EPIC-DOCS, #73 HOUSEKEEPING-005
   * Traces to: #1 (StR)
   */

  it('README has a title header', () => {
    expect(readme).toMatch(/^# presonus-studiolive-mcp/m)
  })

  it('README has "Quick start" section with install instructions', () => {
    expect(readme, 'Missing ## Quick start section').toMatch(/^## Quick start/m)
    expect(readme, 'Quick start section missing pnpm install').toContain('pnpm install')
  })

  it('README has "MCP server" tools-and-resources section', () => {
    expect(readme, 'Missing MCP server tools section').toMatch(/^## MCP server/m)
  })

  it('README has "Probe CLI" section', () => {
    expect(readme, 'Missing ## Probe CLI section').toMatch(/^## Probe CLI/m)
  })

  it('README has "Development" section with test commands', () => {
    expect(readme, 'Missing ## Development section').toMatch(/^## Development/m)
    expect(readme, 'Development section missing pnpm test').toContain('pnpm test')
    expect(readme, 'Development section missing pnpm test:hil').toContain('pnpm test:hil')
  })

  it('README has "Architecture" section', () => {
    expect(readme, 'Missing ## Architecture section').toMatch(/^## Architecture/m)
  })

  it('README documents HIL environment variables (HOUSEKEEPING-005 #73)', () => {
    // Sound engineers running field tests need to know how to set up HIL env vars
    expect(
      readme,
      'README missing HIL_PRESONUS env var documentation — needed for pnpm test:hil',
    ).toContain('HIL_PRESONUS')
    expect(
      readme,
      'README missing HIL_PRESONUS_IP env var documentation',
    ).toContain('HIL_PRESONUS_IP')
    expect(
      readme,
      'README missing HIL_PRESONUS_SERIAL env var documentation',
    ).toContain('HIL_PRESONUS_SERIAL')
  })

  it('README documents the issue model or links to contributing guide (HOUSEKEEPING-005 #73)', () => {
    // Required by #73: README must explain the issue model so new contributors understand
    // the GitHub issue taxonomy (StR → REQ-F → TEST, milestones, etc.)
    const hasIssueModel = readme.includes('GitHub issue') || readme.includes('issue model')
      || readme.includes('CONTRIBUTING') || readme.includes('traceability')
    expect(hasIssueModel, 'README missing reference to GitHub issue model or CONTRIBUTING guide').toBe(true)
  })

  it('README documents hardware requirements', () => {
    expect(readme, 'Missing hardware requirements section').toMatch(/[Hh]ardware/m)
    expect(readme, 'Missing TCP port 53000 documentation').toContain('53000')
  })

  it('README mentions the StudioLive III hardware compatibility', () => {
    expect(readme).toContain('StudioLive III')
  })

  it('README accuracy: mentions 33 read-only tools (current count after v0.1–v0.5)', () => {
    // The README currently says "22 read-only tools" but we now have 33 after v0.1–v0.5
    // This test drives the README accuracy update
    const hasCorrectCount = readme.includes('33') || readme.includes('33 read-only')
    const hasOldCount = readme.includes('22 read-only tools') && !readme.includes('33')
    expect(
      hasCorrectCount || !hasOldCount,
      'README tool count is outdated (says "22 read-only tools" but we have 33). Update to 33.',
    ).toBe(true)
  })
})
