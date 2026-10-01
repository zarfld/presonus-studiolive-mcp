#!/usr/bin/env node
/**
 * Privacy guard for presonus-studiolive-mcp.
 *
 * Detects real mixer-network IP addresses and full StudioLive serial numbers
 * in staged (pre-commit) or tracked (CI) content and aborts the commit when
 * sensitive values are found.
 *
 * USAGE
 *   Staged mode (pre-commit hook):
 *     node scripts/check-sensitive-staged.mjs
 *     node scripts/check-sensitive-staged.mjs --staged
 *
 *   Full-repo scan (CI):
 *     node scripts/check-sensitive-staged.mjs --all
 *
 * CONFIGURATION
 *   scripts/privacy-guard-config.json  — committed, shared defaults
 *   .privacy-guard-local.json          — gitignored, per-developer overrides
 *
 * OUTPUT FORMAT ON FAILURE
 *   Privacy guard blocked commit:
 *
 *   [MIXER_IP] path/to/file.ts:33
 *     Found private mixer-network address.
 *     Replace with <mixer-ip> or *.*.X.X form.
 *
 *   [MIXER_SERIAL] captures/README.md:18
 *     Found full mixer serial.
 *     Replace with RA3E***0194-style redaction.
 */

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Load and merge configuration from (in order of precedence):
 *   1. scripts/privacy-guard-config.json  — committed shared defaults
 *   2. .privacy-guard-local.json          — gitignored per-developer overrides
 *   3. PRIVACY_GUARD_DENY_PREFIXES env var — comma-separated extra deny prefixes
 *                                           (use this in CI to add non-RFC-1918
 *                                            prefixes without committing them)
 * @param {string} [configPath]
 * @param {string} [localPath]
 * @returns {PrivacyConfig}
 */
export function loadConfig(configPath, localPath) {
  const cfgPath = configPath ?? join(__dirname, 'privacy-guard-config.json')
  const locPath = localPath ?? join(REPO_ROOT, '.privacy-guard-local.json')

  const base = JSON.parse(readFileSync(cfgPath, 'utf8'))

  if (existsSync(locPath)) {
    const local = JSON.parse(readFileSync(locPath, 'utf8'))
    if (Array.isArray(local.allowlistIps)) {
      base.allowlistIps = [...(base.allowlistIps ?? []), ...local.allowlistIps]
    }
    if (Array.isArray(local.ipDenyPrefixes)) {
      base.ipDenyPrefixes = [...(base.ipDenyPrefixes ?? []), ...local.ipDenyPrefixes]
    }
    if (Array.isArray(local.allowlistFiles)) {
      base.allowlistFiles = [...(base.allowlistFiles ?? []), ...local.allowlistFiles]
    }
    if (typeof local.serialPattern === 'string') {
      base.serialPattern = local.serialPattern
    }
  }

  // Environment variable: PRIVACY_GUARD_DENY_PREFIXES=157.247.,10.42.
  // Use this in CI to add real non-RFC-1918 prefixes without committing them.
  const envPrefixes = process.env['PRIVACY_GUARD_DENY_PREFIXES']
  if (envPrefixes) {
    const extra = envPrefixes.split(',').map(s => s.trim()).filter(Boolean)
    base.ipDenyPrefixes = [...(base.ipDenyPrefixes ?? []), ...extra]
  }

  return base
}

// ─── IP detection ────────────────────────────────────────────────────────────

/** @type {RegExp} Matches a four-octet IPv4 address. Post-match checks exclude version strings. */
const IPV4_RE = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/g

/** @param {string} ip @param {PrivacyConfig} config */
function isDeniedIp(ip, config) {
  const prefixes = config.ipDenyPrefixes ?? []
  return prefixes.some(p => ip.startsWith(p))
}

/** @param {string} ip @param {PrivacyConfig} config */
function isAllowedIp(ip, config) {
  const list = config.allowlistIps ?? []
  return list.includes(ip)
}

/**
 * Detect sensitive IP addresses in a single text line.
 *
 * @param {string} line
 * @param {PrivacyConfig} config
 * @returns {Finding[]}
 */
export function detectIpsInLine(line, config) {
  if (!line.includes('.')) return []

  const findings = []
  let m
  IPV4_RE.lastIndex = 0

  while ((m = IPV4_RE.exec(line)) !== null) {
    const ip = m[0]
    const start = m.index
    const end = start + ip.length

    // Skip if immediately preceded by a digit or dot (embedded in longer number)
    const before = start > 0 ? line[start - 1] : ''
    if (before === '.' || (before >= '0' && before <= '9')) continue

    // Skip if immediately followed by a digit or dot (version string like 3.4.0.111374)
    const after = line[end] ?? ''
    if (after === '.' || (after >= '0' && after <= '9')) continue

    if (!isDeniedIp(ip, config)) continue
    if (isAllowedIp(ip, config)) continue

    const parts = ip.split('.')
    const masked = `*.*.${parts[2]}.${parts[3]}`
    findings.push({
      category: 'MIXER_IP',
      match: ip,
      suggestion: `<mixer-ip> or ${masked}`,
    })
  }

  return findings
}

// ─── Serial detection ─────────────────────────────────────────────────────────

/**
 * Detect full StudioLive serial numbers in a single text line.
 * The pattern matches: 2 uppercase letters + 2 uppercase alphanumeric + 8 digits.
 * Redacted forms like RA3E***0194 do NOT match because *** is not digits.
 *
 * @param {string} line
 * @param {PrivacyConfig} config
 * @returns {Finding[]}
 */
export function detectSerialsInLine(line, config) {
  const pattern = config.serialPattern ?? '\\b[A-Z]{2}[A-Z0-9]{2}\\d{8}\\b'
  const re = new RegExp(pattern, 'g')
  const findings = []
  let m

  while ((m = re.exec(line)) !== null) {
    const serial = m[0]
    // Suggest: keep first 4 chars + *** + last 4 chars
    const suggestion = `${serial.slice(0, 4)}***${serial.slice(-4)}`
    findings.push({
      category: 'MIXER_SERIAL',
      match: serial,
      suggestion,
    })
  }

  return findings
}

// ─── Multi-line scan ─────────────────────────────────────────────────────────

/**
 * Scan an array of content lines for sensitive values.
 *
 * @param {ContentLine[]} lines
 * @param {PrivacyConfig} config
 * @returns {LocatedFinding[]}
 */
export function scanLines(lines, config) {
  const results = []

  for (const { filename, lineNo, text } of lines) {
    const ipFindings = detectIpsInLine(text, config)
    const serialFindings = detectSerialsInLine(text, config)

    for (const f of [...ipFindings, ...serialFindings]) {
      results.push({ filename, lineNo, ...f })
    }
  }

  return results
}

// ─── Diff parser ─────────────────────────────────────────────────────────────

/**
 * Parse `git diff --cached` output and extract added lines with their file
 * name and new-file line number.
 *
 * @param {string} diffText
 * @returns {ContentLine[]}
 */
export function parseDiff(diffText) {
  /** @type {ContentLine[]} */
  const lines = []
  let filename = /** @type {string|null} */ (null)
  let newLineNo = 0

  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      filename = raw.slice(6)
      newLineNo = 0
    } else if (raw.startsWith('@@ ')) {
      // @@ -old_start[,old_count] +new_start[,new_count] @@
      const hunk = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (hunk) newLineNo = parseInt(hunk[1], 10) - 1 // will be incremented before use
    } else if (filename && raw.startsWith('+') && !raw.startsWith('+++')) {
      newLineNo++
      lines.push({ filename, lineNo: newLineNo, text: raw.slice(1) })
    } else if (filename && !raw.startsWith('-')) {
      // Context line — counts toward new file line numbers
      newLineNo++
    }
    // Removed lines ('-') do not advance the new-file line counter
  }

  return lines
}

// ─── Full-repo scanner (CI mode) ─────────────────────────────────────────────

/**
 * Return content lines for every file tracked by git (minus allowlisted files).
 *
 * @param {PrivacyConfig} config
 * @returns {ContentLine[]}
 */
function getAllTrackedLines(config) {
  const tracked = execSync('git ls-files --cached', { encoding: 'utf8', cwd: REPO_ROOT })
    .trim()
    .split('\n')
    .filter(Boolean)

  const denied = config.allowlistFiles ?? []
  const result = []

  for (const filename of tracked) {
    if (denied.some(f => filename === f || filename.endsWith(`/${f}`))) continue

    const fullPath = join(REPO_ROOT, filename)
    let content
    try {
      content = readFileSync(fullPath, 'utf8')
    } catch {
      continue // skip binary / unreadable files
    }

    // Heuristic: skip files that contain null bytes (binary)
    if (content.includes('\0')) continue

    const fileLines = content.split('\n')
    for (let i = 0; i < fileLines.length; i++) {
      result.push({ filename, lineNo: i + 1, text: fileLines[i] ?? '' })
    }
  }

  return result
}

// ─── Staged-diff scanner (pre-commit mode) ────────────────────────────────────

/**
 * Return content lines from staged additions only.
 *
 * @param {PrivacyConfig} config
 * @returns {ContentLine[]}
 */
function getStagedLines(config) {
  const diff = execSync('git diff --cached', { encoding: 'utf8', cwd: REPO_ROOT })
  const all = parseDiff(diff)

  const denied = config.allowlistFiles ?? []
  return all.filter(({ filename }) =>
    !denied.some(f => filename === f || filename.endsWith(`/${f}`)),
  )
}

// ─── Reporting ───────────────────────────────────────────────────────────────

/**
 * Format and print findings.  Returns true if any findings were printed.
 *
 * @param {LocatedFinding[]} findings
 * @returns {boolean}
 */
function report(findings) {
  if (findings.length === 0) return false

  console.error('\nPrivacy guard blocked commit:\n')

  for (const { filename, lineNo, category, suggestion } of findings) {
    console.error(`[${category}] ${filename}:${lineNo}`)
    if (category === 'MIXER_IP') {
      console.error(`  Found private mixer-network address.`)
      console.error(`  Replace with ${suggestion}.`)
    } else {
      console.error(`  Found full mixer serial number.`)
      console.error(`  Replace with ${suggestion} style redaction.`)
    }
    console.error()
  }

  console.error(`${findings.length} sensitive value(s) found. Redact before committing.`)
  console.error(
    `See scripts/privacy-guard-config.json to add intentional documentation IPs to allowlistIps.`,
  )
  return true
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const allMode = args.includes('--all')

  let config
  try {
    config = loadConfig()
  } catch (err) {
    console.error(`Privacy guard: failed to load config — ${err.message}`)
    process.exit(1)
  }

  const lines = allMode ? getAllTrackedLines(config) : getStagedLines(config)
  const findings = scanLines(lines, config)

  if (report(findings)) {
    process.exit(1)
  }

  if (allMode) {
    console.log(`Privacy guard: no sensitive values found in ${lines.length} tracked lines.`)
  }
}

// Run when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`Privacy guard error: ${err.message}`)
    process.exit(1)
  })
}

// ─── JSDoc typedefs ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} PrivacyConfig
 * @property {string[]} ipDenyPrefixes
 * @property {string}   serialPattern
 * @property {string[]} allowlistIps
 * @property {string[]} allowlistFiles
 */

/**
 * @typedef {Object} Finding
 * @property {'MIXER_IP'|'MIXER_SERIAL'} category
 * @property {string} match
 * @property {string} suggestion
 */

/**
 * @typedef {Object} ContentLine
 * @property {string} filename
 * @property {number} lineNo
 * @property {string} text
 */

/**
 * @typedef {Finding & ContentLine} LocatedFinding
 */
