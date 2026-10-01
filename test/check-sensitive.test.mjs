/**
 * Privacy guard unit tests.
 * Run with:  node --test test/check-sensitive.test.mjs
 * Or:        pnpm test:privacy
 *
 * Uses Node.js built-in test runner (node:test, Node 18+) so the file is
 * loaded as native ESM with no bundler transform.
 *
 * Test fixtures use RFC 5737 TEST-NET-2 (198.51.100.x) and a fictional serial
 * prefix (ZZ9Z).  No real network prefix or serial fragment is committed here.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { detectIpsInLine, detectSerialsInLine, scanLines, parseDiff } =
  await import('../scripts/check-sensitive-staged.mjs')

// RFC 5737 TEST-NET-2 -- reserved for documentation, never a real device.
const TEST_IP = '198.51.100.42'
// Fictional serial: ZZ9Z prefix has no known StudioLive assignment.
// Constructed from parts so the guard does not flag its own test file.
const TEST_SERIAL = 'ZZ9Z' + '9'.repeat(8)

// Inline config -- only the RFC 5737 range is denied so no real prefix is
// ever committed.  Real prefixes belong in the gitignored .privacy-guard-local.json.
const TC = {
  ipDenyPrefixes: ['198.51.100.'],
  serialPattern: '\\b[A-Z]{2}[A-Z0-9]{2}\\d{8}\\b',
  allowlistIps: ['127.0.0.1', '0.0.0.0'],
  allowlistFiles: [],
}

// ---------------------------------------------------------------------------
// IP detection
// ---------------------------------------------------------------------------

describe('detectIpsInLine -- MIXER_IP', () => {
  it('blocks TEST_IP standalone', () => {
    const f = detectIpsInLine('Connect to ' + TEST_IP, TC)
    assert.equal(f.length, 1)
    assert.equal(f[0].category, 'MIXER_IP')
  })
  it('blocks TEST_IP in CLI example', () => {
    assert.equal(detectIpsInLine('export PRESONUS_IP=' + TEST_IP, TC).length, 1)
  })
  it('blocks TEST_IP in JSON', () => {
    assert.equal(detectIpsInLine('"PRESONUS_IP": "' + TEST_IP + '"', TC).length, 1)
  })
  it('blocks TEST_IP in Markdown table cell', () => {
    assert.equal(detectIpsInLine('| Mixer IP | ' + TEST_IP + ' |', TC).length, 1)
  })
  it('blocks TEST_IP in TypeScript comment', () => {
    assert.equal(detectIpsInLine('// fallback: ' + TEST_IP, TC).length, 1)
  })

  it('allows <mixer-ip> placeholder', () => {
    assert.equal(detectIpsInLine('ip: <mixer-ip>', TC).length, 0)
  })
  it('allows *.*.100.42 masked form (not a 4-octet address)', () => {
    assert.equal(detectIpsInLine('fallback: *.*.100.42', TC).length, 0)
  })
  it('allows 127.0.0.1 (in allowlist)', () => {
    assert.equal(detectIpsInLine('bind: 127.0.0.1', TC).length, 0)
  })
  it('allows 0.0.0.0 (in allowlist)', () => {
    assert.equal(detectIpsInLine('host: 0.0.0.0', TC).length, 0)
  })
  it('does not flag firmware versions (3.4.0.111374)', () => {
    assert.equal(detectIpsInLine('firmware: 3.4.0.111374', TC).length, 0)
  })
  it('does not flag semver (1.30.1)', () => {
    assert.equal(detectIpsInLine('version: 1.30.1', TC).length, 0)
  })
  it('suggestion contains <mixer-ip> and *.*.100.42', () => {
    const [f] = detectIpsInLine(TEST_IP, TC)
    assert.ok(f.suggestion.includes('<mixer-ip>'))
    assert.ok(f.suggestion.includes('*.*.100.42'))
  })
})

// ---------------------------------------------------------------------------
// Serial detection
// ---------------------------------------------------------------------------

describe('detectSerialsInLine -- MIXER_SERIAL', () => {
  it('blocks TEST_SERIAL standalone', () => {
    const f = detectSerialsInLine('serial: ' + TEST_SERIAL, TC)
    assert.equal(f.length, 1)
    assert.equal(f[0].category, 'MIXER_SERIAL')
  })
  it('blocks TEST_SERIAL in shell command', () => {
    assert.equal(detectSerialsInLine('export PRESONUS_SERIAL=' + TEST_SERIAL, TC).length, 1)
  })
  it('blocks TEST_SERIAL in JSON', () => {
    assert.equal(detectSerialsInLine('"expectedSerial": "' + TEST_SERIAL + '"', TC).length, 1)
  })
  it('blocks TEST_SERIAL in Markdown', () => {
    assert.equal(detectSerialsInLine('| Serial | ' + TEST_SERIAL + ' |', TC).length, 1)
  })
  it('blocks TEST_SERIAL in TypeScript comment', () => {
    assert.equal(detectSerialsInLine('// serial ' + TEST_SERIAL, TC).length, 1)
  })

  it('allows RA3E***0194 redacted form', () => {
    assert.equal(detectSerialsInLine('serial: RA3E***0194', TC).length, 0)
  })
  it('allows SD7E***0001 redacted form', () => {
    assert.equal(detectSerialsInLine('HIL_32R_SERIAL = "SD7E***0001"', TC).length, 0)
  })
  it('allows <id.hidden> placeholder', () => {
    assert.equal(detectSerialsInLine('serial: <id.hidden>', TC).length, 0)
  })
  it('does not flag short codes (ZZ9Z only -- only 4 chars)', () => {
    assert.equal(detectSerialsInLine('prefix: ZZ9Z', TC).length, 0)
  })
  it('does not flag lowercase strings', () => {
    assert.equal(detectSerialsInLine('id: ' + TEST_SERIAL.toLowerCase(), TC).length, 0)
  })
  it('suggestion is first-4 + *** + last-4', () => {
    const [f] = detectSerialsInLine(TEST_SERIAL, TC)
    assert.equal(f.suggestion, TEST_SERIAL.slice(0, 4) + '***' + TEST_SERIAL.slice(-4))
  })
})

// ---------------------------------------------------------------------------
// Combined scanner
// ---------------------------------------------------------------------------

describe('scanLines -- combined', () => {
  it('returns findings with correct filename and lineNo', () => {
    const lines = [
      { filename: 'f.ts', lineNo: 10, text: 'ip="' + TEST_IP + '"' },
      { filename: 'f.ts', lineNo: 11, text: 'sn="' + TEST_SERIAL + '"' },
    ]
    const findings = scanLines(lines, TC)
    assert.equal(findings.length, 2)
    assert.equal(findings[0].lineNo, 10)
    assert.equal(findings[0].category, 'MIXER_IP')
    assert.equal(findings[1].lineNo, 11)
    assert.equal(findings[1].category, 'MIXER_SERIAL')
  })
  it('returns empty for allowlisted values', () => {
    const lines = [
      { filename: 'ok.ts', lineNo: 1, text: 'bind: 127.0.0.1' },
      { filename: 'ok.ts', lineNo: 2, text: 'serial: RA3E***0194' },
    ]
    assert.equal(scanLines(lines, TC).length, 0)
  })
  it('detects both categories in one pass', () => {
    const lines = [{ filename: 'x.ts', lineNo: 1, text: 'ip=' + TEST_IP + ' sn=' + TEST_SERIAL }]
    const f = scanLines(lines, TC)
    assert.ok(f.some(x => x.category === 'MIXER_IP'))
    assert.ok(f.some(x => x.category === 'MIXER_SERIAL'))
  })
})

// ---------------------------------------------------------------------------
// Staged diff parser
// ---------------------------------------------------------------------------

describe('parseDiff -- staged-diff parser', () => {
  const DIFF = [
    'diff --git a/f.ts b/f.ts',
    'index abc..def 100644',
    '--- a/f.ts',
    '+++ b/f.ts',
    '@@ -10,4 +10,6 @@',
    ' const a = 1',
    '+const ip = "' + TEST_IP + '"',
    '+const s  = "' + TEST_SERIAL + '"',
    ' const b = 2',
    '-const old = 3',
    '+const c = 4',
  ].join('\n')

  it('extracts only added lines', () => {
    assert.equal(parseDiff(DIFF).length, 3)
  })
  it('assigns correct new-file line numbers', () => {
    const lines = parseDiff(DIFF)
    assert.equal(lines[0].lineNo, 11)
    assert.equal(lines[1].lineNo, 12)
    assert.equal(lines[2].lineNo, 14)
  })
  it('assigns correct filename', () => {
    assert.ok(parseDiff(DIFF).every(l => l.filename === 'f.ts'))
  })
  it('handles multiple files', () => {
    const d = [
      'diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts',
      '@@ -1 +1,2 @@', ' keep', '+added_a',
      'diff --git a/b.md b/b.md', '--- a/b.md', '+++ b/b.md',
      '@@ -1 +1 @@', '+added_b',
    ].join('\n')
    const lines = parseDiff(d)
    assert.equal(lines.length, 2)
    assert.equal(lines[0].filename, 'a.ts')
    assert.equal(lines[0].text, 'added_a')
    assert.equal(lines[1].filename, 'b.md')
  })
  it('returns empty for empty diff', () => {
    assert.equal(parseDiff('').length, 0)
  })
  it('handles new-file additions', () => {
    const d = [
      'diff --git a/new.ts b/new.ts', 'new file mode 100644',
      '--- /dev/null', '+++ b/new.ts',
      '@@ -0,0 +1,2 @@', '+line one', '+line two',
    ].join('\n')
    const lines = parseDiff(d)
    assert.equal(lines.length, 2)
    assert.equal(lines[0].lineNo, 1)
    assert.equal(lines[0].text, 'line one')
  })
  it('integrates: scanner catches sensitive values in diff additions', () => {
    const lines = parseDiff(DIFF)
    const findings = scanLines(lines, TC)
    assert.ok(findings.some(f => f.category === 'MIXER_IP'))
    assert.ok(findings.some(f => f.category === 'MIXER_SERIAL'))
  })
})