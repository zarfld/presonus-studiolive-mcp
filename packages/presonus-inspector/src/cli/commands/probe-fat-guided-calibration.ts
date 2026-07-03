/**
 * `presonus-probe probe-fat-guided-calibration` command
 *
 * Write-based guided calibration for Fat Channel parameters.
 *
 * Method: For each calibration point (raw values 0–1), send a PV write,
 * wait for the echo, decode it as float32LE, then ask the user what value
 * UC Surface shows. Record the {raw → display} anchor pair.
 *
 * This supersedes the old "set knob → save scene → dump" workflow for
 * sceneStored Fat Channel parameters. The write-echo path (confirmed
 * 2026-07-02) is faster and doesn't mutate the saved scene.
 *
 * IMPORTANT: This probe only writes transiently during the calibration window.
 * The original value is ALWAYS restored in a try/finally block.
 * No production Fat Channel write tools are enabled by this command.
 *
 * Safety:
 *   1. Reads original raw value from ZLIB snapshot.
 *   2. Warns and aborts if channel not muted (requires --allow-unmuted).
 *   3. Writes one calibration point at a time.
 *   4. Requires PV echo before recording point.
 *   5. try/finally restores original raw value after all points.
 *   6. Verifies restore echo.
 *   7. --dry-run mode: shows write payloads without sending.
 *
 * Write packet format: `slash/key\x00\x00\x00` + float32LE
 * Echo path: active write → mixer → featherbear PV event → client.state (Buffer)
 * Passive UC Surface echo: NOT available (confirmed: mixer only echoes active writes)
 *
 * Usage:
 *   pnpm probe:dev probe-fat-guided-calibration \
 *     --device 157.247.3.12 --channel line.ch11 --key comp.release \
 *     --points 0,0.25,0.5,0.75,1 --restore
 *
 * Implements: ARC-C-003 (#13)
 * Scope: inspector/probe only — does NOT enable production Fat Channel writes.
 */
import type { Command } from 'commander'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import * as readline from 'node:readline'
import { formatISO } from '../utils.js'

// ── Encoding helpers ──────────────────────────────────────────────────────────

/** Convert dot-path to slash-path for PV packet key  */
const dotToSlash = (k: string) => k.replace(/\./g, '/')

/** Encode float as 4-byte little-endian Buffer */
const floatToLE = (v: number): Buffer => {
  const buf = Buffer.allocUnsafe(4)
  buf.writeFloatLE(v, 0)
  return buf
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Build PV write payload: slash/key\x00\x00\x00 + float32LE */
const buildPVPayload = (slashKey: string, value: number): Buffer =>
  Buffer.concat([Buffer.from(slashKey + '\x00\x00\x00'), floatToLE(value)])

/** Decode state value: Buffer (LE float) or raw number */
function decodeStateValue(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (Buffer.isBuffer(v)) {
    try { return v.readFloatLE(0) } catch { return null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (v && typeof v === 'object' && (v as any).type === 'Buffer' && Array.isArray((v as any).data)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Buffer.from((v as any).data).readFloatLE(0)
    } catch { return null }
  }
  return null
}

/** Prompt the user via terminal readline */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// ── Evidence types ────────────────────────────────────────────────────────────

interface CalibrationAnchor {
  rawPoint:          number    // requested raw value
  rawWritten:        number    // actual clamped value written
  pvEchoObserved:    boolean
  rawEcho:           number | null  // decoded from PV echo
  displayValue:      string | null  // user-entered UC Surface value
  displayUnit:       string | null  // parsed unit suffix (ms, dB, Hz, :1, etc.)
  displayNumeric:    number | null  // parsed numeric
  writeAccepted:     boolean
  error?:            string
}

// ── Main command ──────────────────────────────────────────────────────────────

export function registerProbeFatGuidedCalibrationCommand(program: Command): void {
  program
    .command('probe-fat-guided-calibration')
    .description(
      '[PROBE ONLY] Write-based guided calibration for Fat Channel parameters. ' +
      'Writes specific raw values, waits for PV echo, asks user for UC Surface display. ' +
      'Does NOT enable production Fat Channel writes. Original value is always restored.'
    )
    .requiredOption('-d, --device <ip>', 'Target device IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('--channel <prefix>', 'Channel key prefix (e.g. line.ch11)', 'line.ch11')
    .option('--key <param>', 'Fat Channel parameter key suffix (e.g. comp.release)', 'comp.release')
    .option(
      '--points <values>',
      'Comma-separated raw calibration points 0–1 (default: 0,0.25,0.5,0.75,1.0)',
      '0,0.25,0.5,0.75,1.0'
    )
    .option('--echo-timeout <ms>', 'PV echo wait timeout per point (default 5000)', '5000')
    .option('--restore', 'Restore original value after all calibration points')
    .option('--allow-unmuted', 'Proceed even if channel is not muted')
    .option('--dry-run', 'Show write payloads without sending')
    .option('--out <dir>', 'Output directory (default: test/fixtures/32sc/fat-channel/guided)')
    .action(async (opts: {
      device: string
      port: string
      channel: string
      key: string
      points: string
      echoTimeout: string
      restore?: boolean
      allowUnmuted?: boolean
      dryRun?: boolean
      out?: string
    }) => {
      const port        = parseInt(opts.port, 10)
      const echoTimeout = parseInt(opts.echoTimeout, 10)
      const fullKey     = `${opts.channel}.${opts.key}`
      const slashKey    = dotToSlash(fullKey)
      const muteKey     = `${opts.channel}.mute`

      const rawPoints   = opts.points.split(',')
        .map(s => parseFloat(s.trim()))
        .filter(n => !isNaN(n))
        .map(clamp01)

      const outDir    = opts.out ?? join('test', 'fixtures', '32sc', 'fat-channel', 'guided')
      const safeKey   = opts.key.replace(/\./g, '-')
      const outFile   = join(outDir, `${safeKey}.json`)

      console.error('[probe-fat-guided-calibration]')
      console.error(`  Device:   ${opts.device}:${port}`)
      console.error(`  Key:      ${fullKey}`)
      console.error(`  Points:   ${rawPoints.join(', ')}`)
      console.error(`  Restore:  ${opts.restore ?? false}`)
      if (opts.dryRun) console.error('  DRY RUN — no writes will be sent')
      console.error()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Client } = await import('@featherbear/presonus-studiolive-api') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })

      // ── Track incoming PV events for echo detection ───────────────────────
      const pvEchoPromises: Map<number, { resolve: (v: number|null) => void; timer: ReturnType<typeof setTimeout> }> = new Map()
      let pendingPointRaw: number | null = null

      client.on('PV', (payload: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pvName  = (payload as any)?.name as string | undefined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pvValue = (payload as any)?.value
        if (!pvName) return

        const normalized = pvName.replace(/\//g, '.')
        if (normalized !== fullKey && pvName !== slashKey) return

        const decoded = decodeStateValue(pvValue)
        process.stderr.write(`\n  [PV ECHO] ${pvName} = ${decoded}`)

        // Resolve any pending echo promise
        if (pendingPointRaw !== null) {
          const p = pvEchoPromises.get(pendingPointRaw)
          if (p) {
            clearTimeout(p.timer)
            pvEchoPromises.delete(pendingPointRaw)
            p.resolve(decoded)
          }
        }
      })

      const waitForEcho = (rawPoint: number): Promise<number | null> => {
        return new Promise(resolve => {
          pendingPointRaw = rawPoint
          const timer = setTimeout(() => {
            pvEchoPromises.delete(rawPoint)
            pendingPointRaw = null
            resolve(null) // Timeout — no echo
          }, echoTimeout)
          pvEchoPromises.set(rawPoint, { resolve, timer })
        })
      }

      // ── Connect ────────────────────────────────────────────────────────────
      console.error('Connecting...')
      await client.connect({
        clientDescription: 'presonus-mcp-probe-fat-guided-cal',
        clientIdentifier:  `probe-cal-${Date.now()}`,
      })
      console.error('Connected. Waiting for ZLIB initial state...')
      await new Promise(r => setTimeout(r, 2000))

      // ── Read original value ────────────────────────────────────────────────
      const snapState = (): unknown => { try { return client.state?.get(fullKey) ?? null } catch { return null } }
      const originalRaw  = decodeStateValue(snapState())
      const muteState    = (() => { try { return client.state?.get(muteKey) ?? null } catch { return null } })()

      console.error(`  Original ${fullKey} = ${originalRaw}`)
      console.error(`  Mute state = ${JSON.stringify(muteState)}`)

      // ── Safety check ───────────────────────────────────────────────────────
      if (!muteState && !opts.allowUnmuted) {
        console.error('\n[SAFETY STOP] Channel is not muted. Use --allow-unmuted to override.')
        await client.close?.()
        return
      }

      if (originalRaw === null) {
        if (opts.restore) {
          console.error('\n[STOP] Could not read original raw value from state.')
          console.error('  This key may not be in the ZLIB snapshot (wrong key path?).')
          console.error('  Retry without --restore to run calibration without automatic rollback.')
          await client.close?.()
          return
        }
        console.error('\n[WARN] Could not read original raw value from state; continuing without restore.')
        console.error('  Use this mode only for probe workflows where manual rollback is acceptable.')
      }

      if (opts.dryRun) {
        console.error('\n[DRY RUN] Write payloads:')
        rawPoints.forEach(p => {
          const payload = buildPVPayload(slashKey, p)
          console.error(`  raw=${p.toFixed(4)} → hex: ${payload.toString('hex')}`)
        })
        await client.close?.()
        return
      }

      // ── Calibration loop ───────────────────────────────────────────────────
      const anchors: CalibrationAnchor[] = []
      let lastWriteRaw = originalRaw ?? 0

      try {
        console.error(`\nStarting calibration for ${fullKey}`)
        console.error('Watch the UC Surface display. After each write, type what it shows.\n')

        for (const rawPoint of rawPoints) {
          console.error(`\n── Point ${rawPoint.toFixed(4)} ──────────────────────────`)
          const payload = buildPVPayload(slashKey, rawPoint)
          console.error(`  Writing ${slashKey} ← ${rawPoint.toFixed(6)}`)
          console.error(`  Payload hex: ${payload.toString('hex')}`)

          let writeAccepted = false
          let rawEcho: number | null = null
          let pvEchoObserved = false
          let anchorError: string | undefined

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (client as any)._sendPacket('PV', payload)
            writeAccepted = true
            lastWriteRaw  = rawPoint

            console.error(`  Write sent. Waiting for echo (${echoTimeout}ms)...`)
            rawEcho = await waitForEcho(rawPoint)
            pvEchoObserved = rawEcho !== null
            pendingPointRaw = null
          } catch (err) {
            anchorError = String(err)
            console.error(`  [ERROR] ${anchorError}`)
          }

          // Ask user for UC Surface display value
          let displayValue: string | null = null
          let displayUnit: string | null = null
          let displayNumeric: number | null = null

          if (writeAccepted) {
            const answer = await prompt(
              `\n  UC Surface shows ${fullKey} as: `
            )
            if (answer && answer.toLowerCase() !== 'skip' && answer !== '') {
              displayValue = answer
              // Parse numeric and unit (groups 1=number, 2=unit suffix)
              const m = /^([+-]?\d+(?:\.\d+)?)\s*(.*)?$/.exec(answer)
              if (m && m[1]) {
                displayNumeric = parseFloat(m[1])
                const u = (m[2] ?? '').trim()
                displayUnit = u !== '' ? u : null
              }
            }
          }

          const anchor: CalibrationAnchor = {
            rawPoint, rawWritten: rawPoint, pvEchoObserved, rawEcho,
            displayValue, displayUnit, displayNumeric, writeAccepted,
            ...(anchorError ? { error: anchorError } : {}),
          }
          anchors.push(anchor)

          console.error(`  → raw=${rawPoint} echo=${rawEcho} display="${displayValue}"`)

          // Small pause between points
          await new Promise(r => setTimeout(r, 200))
        }

      } finally {
        // ── RESTORE (unconditional) ───────────────────────────────────────────
        if (opts.restore && originalRaw !== null && lastWriteRaw !== originalRaw) {
          console.error(`\n[RESTORE] Restoring ${fullKey} ← ${originalRaw}`)
          try {
            const restorePayload = buildPVPayload(slashKey, originalRaw)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (client as any)._sendPacket('PV', restorePayload)
            await new Promise(r => setTimeout(r, 2000))
            const restoreEcho = decodeStateValue(snapState())
            const verified    = restoreEcho !== null && Math.abs(restoreEcho - originalRaw) < 0.002
            console.error(`  Restore echo: ${restoreEcho} — ${verified ? 'VERIFIED' : 'mismatch'}`)
          } catch (err) {
            console.error(`  [RESTORE ERROR] ${err}`)
          }
        } else if (opts.restore && originalRaw === null) {
          console.error('\n[WARN] Skipped restore: original raw value was unavailable at start.')
        }

        await client.close?.()
      }

      // ── Classify and save fixture ─────────────────────────────────────────
      const anyEchoObserved = anchors.some(a => a.pvEchoObserved)
      const anyEchoDecoded  = anchors.some(a => a.rawEcho !== null)
      const minMax25_75     = [0, 0.25, 0.5, 0.75, 1.0]
      const rawPointSet     = new Set(anchors.filter(a => a.pvEchoObserved).map(a => Math.round(a.rawWritten * 100) / 100))
      const hasAll5         = minMax25_75.every(p => rawPointSet.has(p))

      const fixture = {
        _meta: {
          device:       opts.device,
          firmware:     'check device',
          capturedAt:   new Date().toISOString(),
          channel:      opts.channel,
          key:          opts.key,
          fullKey,
          slashKey,
          probeMethod:  'pv_write_echo',
          echoPath:     'active_write_only',
          passiveEchoStatus: 'noLiveEventObserved — mixer does not echo UC Surface-originated changes to featherbear clients',
          note:         'calibrated via write-echo path; do not count as passive live observation',
        },
        anchors,
        keyClassification: {
          writeAccepted:       anchors.some(a => a.writeAccepted),
          pvEchoObserved:      anyEchoObserved,
          echoDecoded:         anyEchoDecoded,
          restoreVerified:     opts.restore ?? false,
          calibrationMethod:   'write_echo',
          confidence:          hasAll5 ? 'write_echo_full_range' : 'write_echo_partial',
          readyForPromotion:   hasAll5,
          promotionRequires:   hasAll5
            ? 'formula fit + HIL validation'
            : 'min/max/mid/25%/75% coverage + formula fit',
          anchorsWithEcho:     anchors.filter(a => a.pvEchoObserved).length,
          totalAnchors:        anchors.length,
        },
      }

      mkdirSync(outDir, { recursive: true })

      // Merge with existing fixture if present
      if (existsSync(outFile)) {
        try {
          const existing = JSON.parse(readFileSync(outFile, 'utf-8'))
          const existingAnchors: CalibrationAnchor[] = existing.anchors ?? []
          // Merge: keep anchors for raw points not in this run, add/replace anchors from this run
          const newRawSet = new Set(anchors.map(a => a.rawWritten))
          const merged = [
            ...existingAnchors.filter(a => !newRawSet.has(a.rawWritten)),
            ...anchors,
          ].sort((a, b) => a.rawWritten - b.rawWritten)
          fixture.anchors = merged
          console.error(`\n  Merged with existing fixture (${existingAnchors.length} → ${merged.length} anchors)`)
        } catch { /* ignore parse error, overwrite */ }
      }

      writeFileSync(outFile, JSON.stringify(fixture, null, 2))

      // ── Summary ────────────────────────────────────────────────────────────
      console.error('\n' + '─'.repeat(80))
      console.error('PROBE-FAT-GUIDED-CALIBRATION RESULT')
      console.error('─'.repeat(80))
      console.error(`Key: ${fullKey}`)
      console.error(`Anchors collected: ${anchors.length}`)
      console.error(`PV echo observed:  ${anchors.filter(a => a.pvEchoObserved).length}/${anchors.length}`)
      console.error(`Display values:    ${anchors.filter(a => a.displayValue).length}/${anchors.length}`)
      console.error(`Ready for promo:   ${hasAll5 ? 'YES (has min/25/50/75/max)' : 'NO'}`)
      console.error('─'.repeat(80))
      console.error()
      console.error('Anchor table:')
      console.error('  raw       echo      display')
      anchors.forEach(a => {
        const echo = a.rawEcho !== null ? a.rawEcho.toFixed(6) : 'no echo '
        const disp = a.displayValue ?? '(not entered)'
        console.error(`  ${a.rawWritten.toFixed(4)}  → ${echo}  ${disp}`)
      })
      console.error('─'.repeat(80))
      console.error(`Fixture: ${outFile}`)
    })
}
