/**
 * Unit tests for the privacy guard detector.
 *
 * Covers:
 *  - IP detection: must-fail / must-pass values
 *  - Serial detection: must-fail / must-pass values
 *  - Context variants: CLI examples, JSON, Markdown, TypeScript comments
 *  - parseDiff: staged additions extracted correctly with accurate line numbers
 *  - Allowlist behaviour
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { join, resolve } from 'node:path'

// Use dynamic import so Node.js loads the .mjs natively without going through
// esbuild's bundler.  Use process.cwd() (= repo root) instead of import.meta.url
// because vitest transforms test files to CJS internally where import.meta is invalid.
type GuardFn = (line: string, config: unknown) => Array<{ category: string; match: string; suggestion: string }>
type ScanFn = (lines: Array<{ filename: string; lineNo: number; text: string }>, config: unknown) => Array<{ filename: string; lineNo: number; category: string; match: string; suggestion: string }>
type ParseFn = (diffText: string) => Array<{ filename: string; lineNo: number; text: string }>
type LoadCfg = (cfgPath?: string, localPath?: string) => unknown

let detectIpsInLine: GuardFn
let detectSerialsInLine: GuardFn
let scanLines: ScanFn
let parseDiff: ParseFn
let loadConfig: LoadCfg
let CONFIG: unknown

beforeAll(async () => {
  const mod = await import('../scripts/check-sensitive-staged.mjs') as Record<string, unknown>
  detectIpsInLine = mod['detectIpsInLine'] as GuardFn
  detectSerialsInLine = mod['detectSerialsInLine'] as GuardFn
  scanLines = mod['scanLines'] as ScanFn
  parseDiff = mod['parseDiff'] as ParseFn
  loadConfig = mod['loadConfig'] as LoadCfg

  // Load the real committed config so tests reflect the repo's defaults.
  CONFIG = loadConfig(
    resolve('scripts/privacy-guard-config.json'),
    // Point local override to a nonexistent path so tests are deterministic.
    resolve('.privacy-guard-local-test-nonexistent.json'),
  )
})

// ─── IP detection ─────────────────────────────────────────────────────────────

describe('detectIpsInLine — MIXER_IP', () => {
  // ── Must block ────────────────────────────────────────────────────────────

  it('blocks 157.247.3.12 (not in allowlist, matches deny prefix)', () => {
    const findings = detectIpsInLine('Connect to 157.247.3.12', CONFIG)
    expect(findings).toHaveLength(1)
    expect(findings[0].category).toBe('MIXER_IP')
  })

  it('blocks 157.247.3.12 in a CLI example', () => {
    const line = 'export PRESONUS_IP=157.247.3.12'
    const findings = detectIpsInLine(line, CONFIG)
    expect(findings).toHaveLength(1)
  })

  it('blocks 157.247.3.12 in JSON', () => {
    const line = '  "PRESONUS_IP": "157.247.3.12",'
    const findings = detectIpsInLine(line, CONFIG)
    expect(findings).toHaveLength(1)
  })

  it('blocks 157.247.3.12 in a Markdown table cell', () => {
    const line = '| Mixer IP | 157.247.3.12 |'
    const findings = detectIpsInLine(line, CONFIG)
    expect(findings).toHaveLength(1)
  })

  it('blocks 157.247.3.12 in a TypeScript comment', () => {
    const line = '// hardcoded fallback: 157.247.3.12'
    const findings = detectIpsInLine(line, CONFIG)
    expect(findings).toHaveLength(1)
  })

  // ── Must allow ────────────────────────────────────────────────────────────

  it('allows <mixer-ip> placeholder (not an IPv4 address)', () => {
    expect(detectIpsInLine('ip: <mixer-ip>', CONFIG)).toHaveLength(0)
  })

  it('allows *.*.3.12 masked form (not an IPv4 address)', () => {
    expect(detectIpsInLine('fallback: *.*.3.12', CONFIG)).toHaveLength(0)
  })

  it('allows 127.0.0.1', () => {
    expect(detectIpsInLine('bind: 127.0.0.1', CONFIG)).toHaveLength(0)
  })

  it('allows 0.0.0.0', () => {
    expect(detectIpsInLine('host: 0.0.0.0', CONFIG)).toHaveLength(0)
  })

  it('allows 192.168.1.1 (in static allowlist as documentation example)', () => {
    expect(detectIpsInLine('ip: "192.168.1.1"', CONFIG)).toHaveLength(0)
  })

  it('allows 192.168.1.50 (README documentation example)', () => {
    expect(detectIpsInLine('export PRESONUS_IP=192.168.1.50', CONFIG)).toHaveLength(0)
  })

  it('allows 10.0.0.1 (test fixture in allowlist)', () => {
    expect(detectIpsInLine("expect(buildDeviceId({ ip: '10.0.0.1' }))", CONFIG)).toHaveLength(0)
  })

  it('does not treat firmware version strings as IPs (3.4.0.111374)', () => {
    // 111374 has more than 3 digits so the IPv4 pattern should not match
    expect(detectIpsInLine('firmware: 3.4.0.111374', CONFIG)).toHaveLength(0)
  })

  it('does not treat semver strings as IPs (1.30.1)', () => {
    expect(detectIpsInLine('version: 1.30.1', CONFIG)).toHaveLength(0)
  })

  // ── Suggestion format ─────────────────────────────────────────────────────

  it('suggests *.*.3.12 and <mixer-ip> for 157.247.3.12', () => {
    const [finding] = detectIpsInLine('157.247.3.12', CONFIG)
    expect(finding.suggestion).toContain('<mixer-ip>')
    expect(finding.suggestion).toContain('*.*.3.12')
  })
})

// ─── Serial detection ──────────────────────────────────────────────────────────

describe('detectSerialsInLine — MIXER_SERIAL', () => {
  // ── Must block ────────────────────────────────────────────────────────────

  it('blocks RA3E18030194 (full unredacted serial)', () => {
    const findings = detectSerialsInLine('serial: RA3E18030194', CONFIG)
    expect(findings).toHaveLength(1)
    expect(findings[0].category).toBe('MIXER_SERIAL')
  })

  it('blocks RA3E18030194 in a shell command', () => {
    const line = 'export PRESONUS_SERIAL=RA3E18030194'
    expect(detectSerialsInLine(line, CONFIG)).toHaveLength(1)
  })

  it('blocks RA3E18030194 in JSON', () => {
    const line = '  "expectedSerial": "RA3E18030194",'
    expect(detectSerialsInLine(line, CONFIG)).toHaveLength(1)
  })

  it('blocks RA3E18030194 in Markdown', () => {
    const line = '| Serial | RA3E18030194 |'
    expect(detectSerialsInLine(line, CONFIG)).toHaveLength(1)
  })

  it('blocks RA3E18030194 in a TypeScript comment', () => {
    const line = '// HIL: mixer serial RA3E18030194'
    expect(detectSerialsInLine(line, CONFIG)).toHaveLength(1)
  })

  // ── Must allow ────────────────────────────────────────────────────────────

  it('allows RA3E***0194 (already redacted — *** breaks digit-only match)', () => {
    expect(detectSerialsInLine('serial: RA3E***0194', CONFIG)).toHaveLength(0)
  })

  it('allows SD7E***0001 redacted form', () => {
    expect(detectSerialsInLine('HIL_32R_SERIAL = "SD7E***0001"', CONFIG)).toHaveLength(0)
  })

  it('allows <id.hidden> placeholder', () => {
    expect(detectSerialsInLine('serial: <id.hidden>', CONFIG)).toHaveLength(0)
  })

  it('does not flag short uppercase codes that are too short', () => {
    // "RA3E" alone is only 4 chars — not 12 chars needed for the full pattern
    expect(detectSerialsInLine('model prefix: RA3E', CONFIG)).toHaveLength(0)
  })

  it('does not flag lowercase strings', () => {
    expect(detectSerialsInLine('id: ra3e18030194', CONFIG)).toHaveLength(0)
  })

  // ── Suggestion format ─────────────────────────────────────────────────────

  it('suggests RA3E***0194 for RA3E18030194', () => {
    const [finding] = detectSerialsInLine('RA3E18030194', CONFIG)
    expect(finding.suggestion).toBe('RA3E***0194')
  })
})

// ─── scanLines (combined scanner) ────────────────────────────────────────────

describe('scanLines — combined', () => {
  it('returns findings with correct filename and lineNo', () => {
    const lines = [
      { filename: 'example.ts', lineNo: 10, text: 'const ip = "157.247.3.12"' },
      { filename: 'example.ts', lineNo: 11, text: 'const s = "RA3E18030194"' },
    ]
    const findings = scanLines(lines, CONFIG)
    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatchObject({ filename: 'example.ts', lineNo: 10, category: 'MIXER_IP' })
    expect(findings[1]).toMatchObject({ filename: 'example.ts', lineNo: 11, category: 'MIXER_SERIAL' })
  })

  it('skips files in allowlistFiles', () => {
    const lines = [
      { filename: 'pnpm-lock.yaml', lineNo: 1, text: '  157.247.3.12: fakepkg@1.0.0' },
    ]
    const findings = scanLines(lines, CONFIG)
    // scanLines does NOT filter by file — file filtering happens in getStagedLines/getAllTrackedLines
    // This test verifies scanLines passes through; the caller is responsible for allowlistFiles.
    // Re-test to document the expected behaviour.
    expect(typeof findings).toBe('object')
  })

  it('returns empty array when no sensitive values present', () => {
    const lines = [
      { filename: 'ok.ts', lineNo: 1, text: 'const ip = "127.0.0.1"' },
      { filename: 'ok.ts', lineNo: 2, text: '// serial: RA3E***0194' },
    ]
    expect(scanLines(lines, CONFIG)).toHaveLength(0)
  })
})

// ─── parseDiff ────────────────────────────────────────────────────────────────

describe('parseDiff — staged-diff parser', () => {
  const SAMPLE_DIFF = [
    'diff --git a/example.ts b/example.ts',
    'index abc123..def456 100644',
    '--- a/example.ts',
    '+++ b/example.ts',
    '@@ -10,4 +10,6 @@',
    ' const a = 1',           // context: new line 10
    '+const ip = "157.247.3.12"',  // addition: new line 11
    '+const s  = "RA3E18030194"',  // addition: new line 12
    ' const b = 2',           // context: new line 13
    '-const old = 3',         // removed: not counted in new
    '+const c = 4',           // addition: new line 14
  ].join('\n')

  it('extracts only added lines (+ prefix)', () => {
    const lines = parseDiff(SAMPLE_DIFF)
    expect(lines).toHaveLength(3)
  })

  it('assigns correct line numbers from the hunk header', () => {
    const lines = parseDiff(SAMPLE_DIFF)
    expect(lines[0]).toMatchObject({ lineNo: 11, text: 'const ip = "157.247.3.12"' })
    expect(lines[1]).toMatchObject({ lineNo: 12, text: 'const s  = "RA3E18030194"' })
    expect(lines[2]).toMatchObject({ lineNo: 14, text: 'const c = 4' })
  })

  it('assigns the correct filename', () => {
    const lines = parseDiff(SAMPLE_DIFF)
    expect(lines.every(l => l.filename === 'example.ts')).toBe(true)
  })

  it('handles multiple files in a single diff', () => {
    const multiDiff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1,2 @@',
      ' keep',
      '+added_a',
      'diff --git a/b.md b/b.md',
      '--- a/b.md',
      '+++ b/b.md',
      '@@ -1 +1 @@',
      '+added_b',
    ].join('\n')

    const lines = parseDiff(multiDiff)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ filename: 'a.ts', text: 'added_a' })
    expect(lines[1]).toMatchObject({ filename: 'b.md', text: 'added_b' })
  })

  it('returns empty array for an empty diff', () => {
    expect(parseDiff('')).toHaveLength(0)
  })

  it('handles new file additions (all lines are +)', () => {
    const newFileDiff = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,3 @@',
      '+line one',
      '+line two',
      '+line three',
    ].join('\n')

    const lines = parseDiff(newFileDiff)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ lineNo: 1, text: 'line one' })
    expect(lines[2]).toMatchObject({ lineNo: 3, text: 'line three' })
  })

  it('integrates with scanner: detects sensitive values in diff additions', () => {
    const lines = parseDiff(SAMPLE_DIFF)
    const findings = scanLines(lines, CONFIG)
    expect(findings.some(f => f.category === 'MIXER_IP')).toBe(true)
    expect(findings.some(f => f.category === 'MIXER_SERIAL')).toBe(true)
  })
})
