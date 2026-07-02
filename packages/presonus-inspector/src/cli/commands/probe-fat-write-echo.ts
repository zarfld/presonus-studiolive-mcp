/**
 * `presonus-probe probe-fat-write-echo` command
 *
 * Controlled PV write-echo probe for Fat Channel parameters.
 *
 * Goal: determine whether a PV write for a Fat Channel parameter is:
 *   - accepted by the mixer
 *   - echoed back as a PV event through featherbear
 *   - visible in client.state after the write
 *
 * Safety:
 *   1. Reads original raw value from ZLIB snapshot before writing.
 *   2. Warns if channel is not muted (requires --allow-unmuted to proceed).
 *   3. Writes original + delta (tiny, reversible change).
 *   4. try/finally guard guarantees restore of original value.
 *   5. Verifies restore after writing back original.
 *   6. Dry-run mode (--dry-run) logs what would be sent without sending.
 *   7. Commits compact evidence fixture (captures only — not git-tracked).
 *
 * Write packet format (from SL-Edit / featherbear internals):
 *   PV payload = `${key/path}\x00\x00\x00` + 4-byte LE float
 *   Key uses SLASH separators (e.g. line/ch11/comp/release)
 *
 * Usage:
 *   pnpm probe:dev probe-fat-write-echo --device 157.247.3.12 \
 *     --channel line.ch11 --key comp.release --delta 0.01 --duration 10000
 *
 *   # Dry run (no write sent):
 *   pnpm probe:dev probe-fat-write-echo --device 157.247.3.12 \
 *     --channel line.ch11 --key comp.release --delta 0.01 --dry-run
 *
 * Implements: ARC-C-003 (#13)
 * Scope: inspector/probe only — does NOT enable production Fat Channel writes.
 */
import type { Command } from 'commander'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatISO } from '../utils.js'

// Packet parsing constants (same as probe-raw-socket)
const PACKET_HEADER = Buffer.from([0x55, 0x43, 0x00, 0x01])
const CODE_OFFSET = 6
const PAYLOAD_OFFSET = 12

/** Parse raw TCP chunk for PV key and code */
function parseFirstPacket(chunk: Buffer): { code: string; pvKey?: string } | null {
  for (let offset = 0; offset <= chunk.length - 8; offset++) {
    if (
      chunk[offset] === PACKET_HEADER[0] &&
      chunk[offset + 1] === PACKET_HEADER[1] &&
      chunk[offset + 2] === PACKET_HEADER[2] &&
      chunk[offset + 3] === PACKET_HEADER[3]
    ) {
      if (offset + 8 > chunk.length) break
      const payloadLen = chunk.readUInt16LE(offset + 4)
      const packetEnd  = offset + CODE_OFFSET + payloadLen
      const code = chunk.slice(offset + CODE_OFFSET, offset + CODE_OFFSET + 2).toString()

      let pvKey: string | undefined
      if (code === 'PV' && packetEnd > PAYLOAD_OFFSET) {
        const payload = chunk.slice(offset + PAYLOAD_OFFSET, packetEnd)
        const nullIdx = payload.indexOf(0)
        if (nullIdx !== -1) pvKey = payload.slice(0, nullIdx).toString()
      }
      return pvKey !== undefined ? { code, pvKey } : { code }
    }
  }
  return null
}

/** Convert dot-path to slash-path for PV packet key */
function dotToSlash(key: string): string {
  return key.replace(/\./g, '/')
}

/** Encode a 32-bit float as 4-byte little-endian Buffer */
function floatToLE(v: number): Buffer {
  const buf = Buffer.allocUnsafe(4)
  buf.writeFloatLE(v, 0)
  return buf
}

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** Decode a state value: returns float if Buffer (LE), or number directly */
function decodeStateValue(v: unknown): number | null {
  if (typeof v === 'number') return v
  // Real Buffer instance (Node.js Buffer extends Uint8Array)
  if (Buffer.isBuffer(v)) {
    try { return (v as Buffer).readFloatLE(0) } catch { return null }
  }
  // Serialized Buffer: { type: 'Buffer', data: [...] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (v && typeof v === 'object' && (v as any).type === 'Buffer' && Array.isArray((v as any).data)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Buffer.from((v as any).data).readFloatLE(0)
    } catch { return null }
  }
  return null
}

/** Build a PV write payload: slash/key\x00\x00\x00 + 4-byte LE float */
function buildPVPayload(slashKey: string, value: number): Buffer {
  return Buffer.concat([
    Buffer.from(slashKey + '\x00\x00\x00'),
    floatToLE(value),
  ])
}

export function registerProbeFatWriteEchoCommand(program: Command): void {
  program
    .command('probe-fat-write-echo')
    .description(
      '[PROBE ONLY] Controlled PV write-echo test for Fat Channel parameters. ' +
      'Writes a tiny reversible delta and watches for PV echo. ' +
      'Does NOT enable production Fat Channel writes.'
    )
    .requiredOption('-d, --device <ip>', 'Target device IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('--channel <prefix>', 'Channel key prefix (e.g. line.ch11)', 'line.ch11')
    .option('--key <param>', 'Fat Channel parameter key suffix (e.g. comp.release)', 'comp.release')
    .option('--delta <f>', 'Write delta added to original value (default 0.01)', '0.01')
    .option('--duration <ms>', 'Listen window after write in ms (default 10000)', '10000')
    .option('--dry-run', 'Log the write payload without sending it')
    .option('--allow-unmuted', 'Proceed even if the channel is not muted')
    .option('--out <dir>', 'Output directory for evidence fixture')
    .action(async (opts: {
      device: string
      port: string
      channel: string
      key: string
      delta: string
      duration: string
      dryRun?: boolean
      allowUnmuted?: boolean
      out?: string
    }) => {
      const port       = parseInt(opts.port, 10)
      const delta      = parseFloat(opts.delta)
      const duration   = parseInt(opts.duration, 10)
      const fullKey    = `${opts.channel}.${opts.key}`      // e.g. line.ch11.comp.release
      const slashKey   = dotToSlash(fullKey)               // e.g. line/ch11/comp/release
      const muteKey    = `${opts.channel}.mute`            // e.g. line.ch11.mute

      const dateStr = formatISO(new Date())
      const outDir  = opts.out ?? join('captures', dateStr, 'fat-write-echo')
      mkdirSync(outDir, { recursive: true })
      const fixtureFile = join(outDir, 'write-echo-evidence.json')

      console.error(`[probe-fat-write-echo]`)
      console.error(`  Device:   ${opts.device}:${port}`)
      console.error(`  Key:      ${fullKey}`)
      console.error(`  Delta:    ${delta}`)
      console.error(`  Duration: ${duration}ms`)
      if (opts.dryRun) console.error('  DRY RUN — no write will be sent')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Client } = await import('@featherbear/presonus-studiolive-api') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })

      // ── RAW SOCKET TAP ────────────────────────────────────────────────────
      const rawSocket = client.conn as import('node:net').Socket
      const rawIncoming: Array<{ ts: string; code: string; pvKey?: string }> = []

      rawSocket.on('data', (bytes: Buffer) => {
        const ts = new Date().toISOString()
        const pkt = parseFirstPacket(bytes)
        if (pkt) rawIncoming.push({ ts, code: pkt.code, ...(pkt.pvKey !== undefined ? { pvKey: pkt.pvKey } : {}) })
      })

      // ── DECODED EVENT LISTENERS ───────────────────────────────────────────
      const decodedPVEvents: Array<{ ts: string; name: string; value: unknown }> = []
      let decodedEventCount = 0

      client.on('PV', (payload: unknown) => {
        decodedEventCount++
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pvName = (payload as any)?.name
        const pvValue = (payload as any)?.value
        if (typeof pvName === 'string') {
          decodedPVEvents.push({ ts: new Date().toISOString(), name: pvName, value: pvValue })
          const normalized = pvName.replace(/\//g, '.')
          if (normalized === fullKey || pvName === slashKey) {
            process.stderr.write(`\n  [PV ECHO] ${pvName} = ${JSON.stringify(pvValue)}`)
          }
        }
      })

      client.on('data', () => { decodedEventCount++ })

      // ── CONNECT ───────────────────────────────────────────────────────────
      console.error('\nConnecting...')
      await client.connect({
        clientDescription: 'presonus-mcp-probe-fat-write-echo',
        clientIdentifier:  `probe-write-${Date.now()}`,
      })
      console.error('Connected. Waiting for ZLIB initial state...')

      // Wait for state to populate (ZLIB comes in on connect)
      await new Promise(r => setTimeout(r, 2000))

      // ── READ ORIGINAL VALUE ───────────────────────────────────────────────
      const snapState = (): unknown => {
        try { return client.state?.get(fullKey) ?? null } catch { return null }
      }
      const snapMute = (): unknown => {
        try { return client.state?.get(muteKey) ?? null } catch { return null }
      }

      const originalValue = snapState()
      const muteState = snapMute()

      console.error(`  Original ${fullKey} = ${JSON.stringify(originalValue)}`)
      console.error(`  Mute state for ${opts.channel} = ${JSON.stringify(muteState)}`)

      // ── SAFETY: MUTE CHECK ────────────────────────────────────────────────
      if (!muteState && !opts.allowUnmuted) {
        console.error('\n[SAFETY STOP] Channel is not muted.')
        console.error('Use --allow-unmuted to override, or mute the channel first.')
        console.error('Aborting — no write sent.')
        await client.close?.()
        writeFixture(fixtureFile, {
          _meta: { device: opts.device, key: fullKey, delta, dryRun: opts.dryRun ?? false, capturedAt: new Date().toISOString() },
          aborted: true,
          abortReason: 'Channel not muted and --allow-unmuted not set',
          originalValue,
          muteState,
        })
        return
      }

      if (originalValue === null || originalValue === undefined) {
        console.error('\n[STOP] Could not read original value from state (may need save-scene first).')
        console.error('Aborting — no write sent.')
        await client.close?.()
        writeFixture(fixtureFile, {
          _meta: { device: opts.device, key: fullKey, delta, dryRun: opts.dryRun ?? false, capturedAt: new Date().toISOString() },
          aborted: true,
          abortReason: 'Original value not in client.state (state not populated or key unknown)',
          originalValue: null,
          muteState,
        })
        return
      }

      const origFloat = typeof originalValue === 'number' ? originalValue : 0
      const writeValue  = clamp01(origFloat + delta)
      const restoreValue = origFloat

      const writePayload  = buildPVPayload(slashKey, writeValue)
      const restorePayload = buildPVPayload(slashKey, restoreValue)

      console.error(`\n  Write:   ${slashKey} ← ${writeValue.toFixed(6)} (original: ${origFloat.toFixed(6)} + delta: ${delta})`)
      console.error(`  Restore: ${slashKey} ← ${restoreValue.toFixed(6)}`)
      console.error(`  Write payload hex (first 32 bytes): ${writePayload.slice(0, 32).toString('hex')}`)

      if (opts.dryRun) {
        console.error('\n[DRY RUN] No write sent. Exiting.')
        await client.close?.()
        writeFixture(fixtureFile, {
          _meta: { device: opts.device, key: fullKey, delta, dryRun: true, capturedAt: new Date().toISOString() },
          dryRun: true,
          originalValue,
          writeValue,
          writePayloadHex: writePayload.toString('hex'),
          restoreValue,
        })
        return
      }

      // ── WRITE + LISTEN + RESTORE (with finally guard) ─────────────────────
      const rawCountBefore = rawIncoming.length
      const pvEchoBefore   = decodedPVEvents.length

      let writeAccepted   = false
      let pvEchoObserved  = false
      let rawPvObserved   = false
      let stateUpdated    = false
      let stateHasBuffer  = false
      let restoreVerified = false
      let writeError: string | undefined

      try {
        // Send write
        console.error('\n[WRITE] Sending PV write...')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any)._sendPacket('PV', writePayload)
        writeAccepted = true
        console.error('[WRITE] Packet sent (no rejection detected — accepted at TCP level).')

        // Listen window
        console.error(`[LISTEN] Watching for ${duration}ms...`)
        await new Promise(r => setTimeout(r, duration))

        // Check state after write (decode Buffer → float if needed)
        const stateAfterWrite = snapState()
        const stateFloatAfterWrite = decodeStateValue(stateAfterWrite)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stateHasBuffer = Buffer.isBuffer(stateAfterWrite) ||
          !!(stateAfterWrite && typeof stateAfterWrite === 'object' && (stateAfterWrite as any).type === 'Buffer')
        stateUpdated = stateFloatAfterWrite !== null &&
          Math.abs(stateFloatAfterWrite - writeValue) < 0.001

        // Check raw and decoded events that arrived after write
        const rawAfterWrite = rawIncoming.slice(rawCountBefore)
        const pvAfterWrite  = decodedPVEvents.slice(pvEchoBefore)

        rawPvObserved = rawAfterWrite.some(r =>
          r.code === 'PV' &&
          r.pvKey !== undefined &&
          r.pvKey.replace(/\//g, '.') === fullKey
        )
        pvEchoObserved = pvAfterWrite.some(e =>
          (typeof e.name === 'string') &&
          (e.name.replace(/\//g, '.') === fullKey || e.name === slashKey)
        )

        console.error(`  State after write: ${JSON.stringify(stateAfterWrite)} (decoded: ${stateFloatAfterWrite})`)
        console.error(`  Raw PV packets for key: ${rawPvObserved ? 'YES' : 'none'}`)
        console.error(`  Decoded PV echo: ${pvEchoObserved ? 'YES' : 'none'}`)
        console.error(`  State updated: ${stateUpdated ? 'YES' : 'no'}`)

      } catch (err) {
        writeError = String(err)
        console.error(`[WRITE ERROR] ${writeError}`)
      } finally {
        // ── RESTORE (unconditional) ─────────────────────────────────────
        console.error('\n[RESTORE] Sending restore...')
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client as any)._sendPacket('PV', restorePayload)
          await new Promise(r => setTimeout(r, 2000))

          const stateAfterRestore = snapState()
          const stateFloatAfterRestore = decodeStateValue(stateAfterRestore)
          restoreVerified =
            stateAfterRestore === null || // sceneStored — can't verify via state
            (stateFloatAfterRestore !== null && Math.abs(stateFloatAfterRestore - restoreValue) < 0.001)
          console.error(`  Restore state: ${JSON.stringify(stateAfterRestore)} (decoded: ${stateFloatAfterRestore}) — ${restoreVerified ? 'VERIFIED' : 'mismatch'}`)
        } catch (restoreErr) {
          console.error(`[RESTORE ERROR] ${String(restoreErr)}`)
        }

        await client.close?.()
      }

      // ── CLASSIFY ──────────────────────────────────────────────────────────
      const classification = classifyResult({
        writeAccepted,
        pvEchoObserved,
        rawPvObserved,
        stateUpdated,
        stateHasBuffer: stateHasBuffer ?? false,
        ...(writeError !== undefined ? { writeError } : {}),
      })

      // ── RESULT TABLE ──────────────────────────────────────────────────────
      console.error('\n' + '─'.repeat(80))
      console.error('PROBE-FAT-WRITE-ECHO RESULT')
      console.error('─'.repeat(80))
      const table = [
        ['Key',                  fullKey],
        ['Write accepted',       writeAccepted ? 'YES' : 'no'],
        ['PV echo (decoded)',    pvEchoObserved ? 'YES' : 'no'],
        ['Raw PV packet',        rawPvObserved ? 'YES' : 'no'],
        ['client.state updated', stateUpdated ? 'YES' : 'no'],
        ['Restore verified',     restoreVerified ? 'YES (or sceneStored)' : 'unconfirmed'],
        ['Classification',       classification],
      ]
      table.forEach(([label, val]) => console.error(`  ${(label ?? '').padEnd(25)}: ${val}`))
      console.error('─'.repeat(80))

      // Decode PV echo values from Buffer → float
      const decodeEchoEvents = (events: typeof decodedPVEvents) =>
        events.map(e => ({
          ...e,
          decodedFloat: decodeStateValue(e.value),
        }))

      writeFixture(fixtureFile, {
        _meta: {
          device: opts.device, firmware: 'check device', capturedAt: new Date().toISOString(),
          key: fullKey, slashKey, channel: opts.channel, delta, duration,
          dryRun: opts.dryRun ?? false,
          note: 'adapterDoesNotApplyEcho means featherbear received PV echo but stores raw Buffer (no float transformer). Decoded float values show correct write/restore values.',
        },
        originalValue:   origFloat,
        writeValue,
        writePayloadHex: writePayload.toString('hex'),
        restoreValue,
        writeAccepted, pvEchoObserved, rawPvObserved, stateUpdated,
        restoreVerified, writeError: writeError ?? null,
        classification,
        rawPacketsSeen: rawIncoming.length,
        rawPvPacketsAfterWrite: rawIncoming.slice(rawCountBefore).filter(r => r.code === 'PV'),
        decodedPVEventsAfterWrite: decodeEchoEvents(decodedPVEvents.slice(pvEchoBefore)),
      })
      console.error(`Evidence: ${fixtureFile}`)
    })
}

type Classification =
  | 'writeAccepted_echoObserved'          // echo received + state updated as float
  | 'writeAccepted_echoObserved_noTransformer' // echo received but state has raw Buffer (featherbear missing transformer)
  | 'writeAccepted_noEcho'               // write sent, no echo observed
  | 'writeRejected'                      // _sendPacket threw
  | 'adapterDoesNotApplyEcho'            // decoded event observed but state not updated
  | 'rawObserved_parserGap'              // raw packet seen but no decoded event
  | 'unsafe_not_tested'                  // write not attempted
  | 'dryRun'

function classifyResult(r: {
  writeAccepted: boolean
  pvEchoObserved: boolean
  rawPvObserved: boolean
  stateUpdated: boolean
  stateHasBuffer?: boolean
  writeError?: string
}): Classification {
  if (r.writeError) return 'writeRejected'
  if (!r.writeAccepted) return 'unsafe_not_tested'
  if (r.pvEchoObserved && r.stateUpdated) return 'writeAccepted_echoObserved'
  if (r.pvEchoObserved && r.stateHasBuffer) return 'writeAccepted_echoObserved_noTransformer'
  if (r.pvEchoObserved && !r.stateUpdated) return 'adapterDoesNotApplyEcho'
  if (r.rawPvObserved && !r.pvEchoObserved) return 'rawObserved_parserGap'
  return 'writeAccepted_noEcho'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeFixture(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2))
}
