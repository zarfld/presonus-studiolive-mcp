/**
 * `presonus-probe probe-raw-socket` command
 *
 * Instruments the TCP receive path BELOW featherbear's decoded event emission.
 * Taps client.conn (the raw net.Socket) to log ALL packets that arrive from the
 * mixer before featherbear parses, transforms, or possibly ignores them.
 *
 * Also intercepts client.conn.write to capture outgoing packets (subscription
 * payload etc.) for comparison with UC Surface's subscription.
 *
 * This resolves: the earlier probe-live-events only showed no decoded featherbear
 * events. It could not distinguish between:
 *   A) Mixer never sent a raw packet           → noRawPacketObserved
 *   B) Featherbear received raw packet but      → rawPacketObservedParserGap
 *      failed to decode or emit it
 *   C) Featherbear decoded the event but        → adapterStateApplicationGap
 *      client.state was not updated
 *   D) Both decoded and state updated           → liveObserved
 *
 * Packet format (featherbear internals):
 *   Bytes  0-3:  PacketHeader [0x55, 0x43, 0x00, 0x01] = "UC\x00\x01"
 *   Bytes  4-5:  Payload length (uint16 LE), counts from byte 6 onward
 *   Bytes  6-7:  MessageCode (2 ASCII chars: "PV", "JM", "ZB", "MS", etc.)
 *   Bytes  8-11: Connection identity (4 bytes)
 *   Bytes 12+:   Decoded payload
 *   For PV (ParamValue) packets, payload = <key>\0<partA:2><value:N>
 *
 * Usage:
 *   pnpm probe:dev probe-raw-socket --device 157.247.3.12 --duration 60000 \
 *     --filter "line.ch11.comp.release,line.ch11.gate.range" \
 *     --out captures/probe-fat-cal/raw-socket
 *
 * Implements: ARC-C-003 (#13)
 */
import type { Command } from 'commander'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatISO } from '../utils.js'

const PACKET_HEADER = Buffer.from([0x55, 0x43, 0x00, 0x01]) // "UC\x00\x01"
const HEADER_LEN = 4   // PacketHeader length
const LEN_OFFSET = 4   // uint16 LE payload length at bytes 4-5
const CODE_OFFSET = 6  // 2-char MessageCode at bytes 6-7
const ID_OFFSET   = 8  // 4-byte connection identity at bytes 8-11
const PAYLOAD_OFFSET = 12 // actual payload starts at byte 12

interface RawPacketRecord {
  ts: string
  dir: 'in' | 'out'
  code: string
  payloadLen: number
  pvKey?: string     // PV packets: null-terminated key path
  pvKeyNormalized?: string // dot-separated version of slash-separated key
  hexPrefix: string  // first 48 bytes as hex
}

interface ClassificationEntry {
  key: string
  rawPvPacketArrived: boolean      // saw a raw PV packet for this key path
  decodedEventEmitted: boolean     // featherbear emitted a decoded 'PV' event
  stateUpdated: boolean            // client.state changed
  classification: Classification
}

type Classification =
  | 'liveObserved'               // decoded event + state updated
  | 'decodedEventNotObserved'    // no decoded event arrived through featherbear
  | 'rawPacketObservedParserGap' // raw packet arrived but no decoded event emitted
  | 'noRawPacketObserved'        // no raw packet from mixer during probe
  | 'unknown'                    // inconclusive (knob may not have been moved)

/** Parse as many complete featherbear packets as possible from a raw TCP chunk */
function parsePackets(chunk: Buffer): Array<{ code: string; payloadLen: number; pvKey?: string; hexPrefix: string }> {
  const results: Array<{ code: string; payloadLen: number; pvKey?: string; hexPrefix: string }> = []
  let offset = 0

  while (offset <= chunk.length - HEADER_LEN - 2) {
    // Scan for packet header
    if (
      chunk[offset] === PACKET_HEADER[0] &&
      chunk[offset + 1] === PACKET_HEADER[1] &&
      chunk[offset + 2] === PACKET_HEADER[2] &&
      chunk[offset + 3] === PACKET_HEADER[3]
    ) {
      if (offset + 6 > chunk.length) break

      const payloadLen = chunk.readUInt16LE(offset + LEN_OFFSET)
      const packetEnd  = offset + CODE_OFFSET + payloadLen

      if (packetEnd > chunk.length) {
        // Packet spans multiple chunks; log what we have and stop
        const code = chunk.slice(offset + CODE_OFFSET, offset + CODE_OFFSET + 2).toString()
        results.push({ code, payloadLen, hexPrefix: chunk.slice(offset, Math.min(offset + 48, chunk.length)).toString('hex') })
        break
      }

      const code = chunk.slice(offset + CODE_OFFSET, offset + CODE_OFFSET + 2).toString()
      let pvKey: string | undefined
      if (code === 'PV' && packetEnd > PAYLOAD_OFFSET) {
        const payload = chunk.slice(offset + PAYLOAD_OFFSET, packetEnd)
        const nullIdx = payload.indexOf(0)
        if (nullIdx !== -1) pvKey = payload.slice(0, nullIdx).toString()
      }

      results.push({ code, payloadLen, ...(pvKey !== undefined ? { pvKey } : {}), hexPrefix: chunk.slice(offset, Math.min(offset + 48, packetEnd)).toString('hex') })
      offset = packetEnd
    } else {
      offset++
    }
  }
  return results
}

/** Normalize slash-separated key to dot-separated for matching against watched keys */
function normalizeKey(raw: string): string {
  return raw.replace(/\//g, '.')
}

export function registerProbeRawSocketCommand(program: Command): void {
  program
    .command('probe-raw-socket')
    .description(
      'Tap the raw TCP socket below featherbear decoding to detect whether the mixer sends ' +
      'Fat Channel parameter packets that featherbear fails to decode or emit'
    )
    .requiredOption('-d, --device <ip>', 'Target device IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('--duration <ms>', 'Capture duration in ms (default 60000)', '60000')
    .option(
      '--filter <keys>',
      'Comma-separated dot-path key prefixes to watch',
      'line.ch11.comp.release,line.ch11.gate.range,line.ch11.comp.ratio,line.ch11.limit.threshold,line.ch11.comp.attack,line.ch11.gate.release'
    )
    .option('--out <dir>', 'Output directory for evidence files')
    .action(async (opts: { device: string; port: string; duration: string; filter: string; out?: string }) => {
      const port = parseInt(opts.port, 10)
      const duration = parseInt(opts.duration, 10)
      const watchKeys = opts.filter.split(',').map(k => k.trim()).filter(Boolean)

      const dateStr = formatISO(new Date())
      const outDir = opts.out ?? join('captures', dateStr, 'raw-socket')
      mkdirSync(outDir, { recursive: true })
      const rawInFile  = join(outDir, 'raw-incoming.ndjson')
      const rawOutFile = join(outDir, 'raw-outgoing.ndjson')
      const eventsFile = join(outDir, 'decoded-events.ndjson')
      const summaryFile = join(outDir, 'summary.json')

      console.error(`Connecting to ${opts.device}:${port}...`)
      console.error(`Watching keys: ${watchKeys.join(', ')}`)
      console.error(`Duration: ${duration}ms  |  Output: ${outDir}`)
      console.error('')
      console.error('>>> Move the Fat Channel knobs in UC Surface now. <<<')
      console.error('')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Client } = await import('@featherbear/presonus-studiolive-api') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })

      // ── 1. TAP RAW INCOMING SOCKET ────────────────────────────────────────
      // client.conn is the raw net.Socket, populated in the Client constructor
      // BEFORE connect() is called. Adding a 'data' listener here gives us
      // the same raw TCP bytes that featherbear's DataClient_default receives,
      // allowing comparison between raw packets and decoded events.
      const rawSocket = client.conn as import('node:net').Socket

      const rawPackets: RawPacketRecord[] = []
      const rawCodeCounts: Record<string, number> = {}
      const rawPvKeysForWatched = new Set<string>() // normalized dot-paths seen in raw PV
      let totalRawChunks = 0

      rawSocket.on('data', (bytes: Buffer) => {
        totalRawChunks++
        const ts = new Date().toISOString()
        const parsed = parsePackets(bytes)

        for (const pkt of parsed) {
          rawCodeCounts[pkt.code] = (rawCodeCounts[pkt.code] ?? 0) + 1

          const norm = pkt.pvKey ? normalizeKey(pkt.pvKey) : undefined
          if (norm) {
            const matchesWatched = watchKeys.some(k => norm === k || norm.startsWith(k + '.') || k.startsWith(norm + '.'))
            if (matchesWatched) rawPvKeysForWatched.add(norm)
          }

          const record: RawPacketRecord = {
            ts, dir: 'in' as const, code: pkt.code, payloadLen: pkt.payloadLen,
            ...(pkt.pvKey !== undefined ? { pvKey: pkt.pvKey } : {}),
            ...(norm !== undefined ? { pvKeyNormalized: norm } : {}),
            hexPrefix: pkt.hexPrefix,
          }
          rawPackets.push(record)
          writeFileSync(rawInFile, JSON.stringify(record) + '\n', { flag: 'a' })

          if (pkt.code === 'PV' && norm && rawPvKeysForWatched.has(norm)) {
            process.stderr.write(`\n  [RAW IN] PV key=${norm}`)
          }
        }
      })

      // ── 2. INTERCEPT OUTGOING WRITES (subscription payload capture) ──────
      const origWrite = rawSocket.write.bind(rawSocket)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(rawSocket as any).write = function(data: unknown, ...args: unknown[]): boolean {
        const ts = new Date().toISOString()
        if (Buffer.isBuffer(data) || typeof data === 'string') {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as string)
          const pkt = parsePackets(buf)[0]
          const record: RawPacketRecord = {
            ts, dir: 'out',
            code: pkt?.code ?? '??',
            payloadLen: pkt?.payloadLen ?? buf.length,
            hexPrefix: buf.slice(0, 64).toString('hex'),
          }
          writeFileSync(rawOutFile, JSON.stringify(record) + '\n', { flag: 'a' })
          if (pkt?.code === 'JM') {
            process.stderr.write(`\n  [RAW OUT] JM subscribe/request packet sent (${buf.length} bytes)`)
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (origWrite as any)(data, ...args)
      }

      // ── 3. DECODED EVENT LISTENERS (featherbear layer) ────────────────────
      const decodedEventCodes: Record<string, number> = {}
      const decodedPvKeys = new Set<string>()
      const decodedStateChanges: Array<{ ts: string; key: string; value: unknown }> = []

      const snapWatched = (): Record<string, unknown> => {
        const snap: Record<string, unknown> = {}
        for (const k of watchKeys) {
          try { snap[k] = client.state?.get(k) ?? null } catch { snap[k] = null }
        }
        return snap
      }

      for (const code of ['PV', 'JM', 'PC', 'PS', 'ZB', 'MS', 'PL', 'BO', 'MB', 'CK', 'data', 'connected', 'closed', 'reconnecting']) {
        client.on(code, (payload: unknown) => {
          const ts = new Date().toISOString()
          decodedEventCodes[code] = (decodedEventCodes[code] ?? 0) + 1

          const after = snapWatched()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pvKey = (payload as any)?.name
          if (code === 'PV' && typeof pvKey === 'string') {
            const norm = normalizeKey(pvKey)
            decodedPvKeys.add(norm)
            if (watchKeys.some(k => norm === k)) {
              process.stderr.write(`\n  [DECODED] PV event for ${norm}`)
            }
          }

          writeFileSync(eventsFile, JSON.stringify({ ts, code, payload, watchedKeysAfter: after }) + '\n', { flag: 'a' })
        })
      }

      // Track state changes for watched keys
      let prevState = snapWatched()
      const stateChangeInterval = setInterval(() => {
        const cur = snapWatched()
        for (const k of watchKeys) {
          if (JSON.stringify(cur[k]) !== JSON.stringify(prevState[k])) {
            const record = { ts: new Date().toISOString(), key: k, before: prevState[k], after: cur[k] }
            decodedStateChanges.push({ ts: record.ts, key: k, value: cur[k] })
            process.stderr.write(`\n  [STATE] ${k} changed: ${JSON.stringify(prevState[k])} → ${JSON.stringify(cur[k])}`)
          }
        }
        prevState = cur
      }, 100)

      await client.connect({
        clientDescription: 'presonus-mcp-probe-raw-socket',
        clientIdentifier: `probe-raw-${Date.now()}`,
      })
      console.error(`Connected. Watching for ${duration}ms...`)

      await new Promise(r => setTimeout(r, duration))
      clearInterval(stateChangeInterval)
      await client.close?.()

      // ── 4. CLASSIFICATION ─────────────────────────────────────────────────
      const classifications: ClassificationEntry[] = watchKeys.map(key => {
        const rawSeen = rawPvKeysForWatched.has(key)
        const decodedSeen = [...decodedPvKeys].some(k => normalizeKey(k) === key)
        const stateSeen = decodedStateChanges.some(c => c.key === key)

        let classification: Classification
        if (stateSeen) {
          classification = 'liveObserved'
        } else if (decodedSeen) {
          classification = 'decodedEventNotObserved' // decoded but state not updated
        } else if (rawSeen) {
          classification = 'rawPacketObservedParserGap'
        } else if (rawCodeCounts['PV']) {
          // PV packets arrived but not for this key
          classification = 'noRawPacketObserved'
        } else {
          classification = 'unknown'
        }

        return { key, rawPvPacketArrived: rawSeen, decodedEventEmitted: decodedSeen, stateUpdated: stateSeen, classification }
      })

      const summary = {
        _meta: {
          device: opts.device, capturedAt: new Date().toISOString(),
          duration_ms: duration, watchedKeys: watchKeys,
          totalRawChunks, rawCodeCounts, decodedEventCodes,
        },
        interpretationGuide: {
          liveObserved:               'Decoded event AND state update seen — fully live through featherbear',
          decodedEventNotObserved:    'No decoded featherbear event observed during probe (raw packet status unknown without raw tap evidence)',
          rawPacketObservedParserGap: 'Raw PV packet arrived from mixer BUT featherbear did not emit a decoded event — parser/handler gap',
          noRawPacketObserved:        'PV packets arrived for OTHER keys but NOT for this key — mixer likely did not send PV for this control',
          unknown:                    'No PV packets at all during probe — knob may not have been moved, or mixer uses different protocol',
        },
        classifications,
        rawPvKeysObserved: [...rawPvKeysForWatched],
        decodedPvKeysObserved: [...decodedPvKeys],
        stateChanges: decodedStateChanges,
        nextSteps: [
          'If rawPacketObservedParserGap: inspect the raw packet hex and compare with featherbear handlePVPacket; check if key path format differs',
          'If noRawPacketObserved: mixer confirmed not sending PV for this control via UC Surface; test physical knob movement separately',
          'If unknown: re-run probe with confirmed knob movement; try pnpm probe:dev probe-raw-socket and physically move knobs during the window',
          'For UC Surface subscription comparison: capture Wireshark traffic on tcp.port==53000 during UC Surface connect and compare JM subscribe payload with raw-outgoing.ndjson',
        ],
        files: { rawIncoming: rawInFile, rawOutgoing: rawOutFile, decodedEvents: eventsFile },
      }

      writeFileSync(summaryFile, JSON.stringify(summary, null, 2))

      // Print result table
      const TABLE_HEADER = `  ${'Key'.padEnd(38)} | raw_PV | decoded | state | ${'Classification'.padEnd(26)}`
      const TABLE_SEP    = `  ${'-'.repeat(38)}-+--------+---------+-------+-${'-'.repeat(26)}`
      const TABLE_ROWS   = classifications.map(c =>
        `  ${c.key.padEnd(38)} | ${c.rawPvPacketArrived ? 'YES   ' : 'no    '} | ${c.decodedEventEmitted ? 'YES    ' : 'no     '} | ${c.stateUpdated ? 'YES  ' : 'no   '} | ${c.classification}`
      )

      console.error('\n\n' + '─'.repeat(90))
      console.error('PROBE-RAW-SOCKET RESULT')
      console.error('─'.repeat(90))
      console.error(`Raw packet codes seen: ${JSON.stringify(rawCodeCounts)}`)
      console.error(`Decoded event codes:   ${JSON.stringify(decodedEventCodes)}`)
      console.error(TABLE_HEADER)
      console.error(TABLE_SEP)
      TABLE_ROWS.forEach(r => console.error(r))
      console.error('─'.repeat(90))
      console.error(`Summary: ${summaryFile}`)
    })
}
