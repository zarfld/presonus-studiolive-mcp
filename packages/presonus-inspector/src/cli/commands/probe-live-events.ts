/**
 * `presonus-probe probe-live-events` command
 *
 * Subscribe to featherbear PV/JM/data events and watch specific Fat Channel key paths
 * to determine whether the mixer emits live events for those controls, and whether
 * client.state updates in response.
 *
 * This resolves the open question: are comp.release / gate.range scene-stored or
 * do they emit live PV events that our snapshot workflow missed?
 *
 * Classification outcome per key:
 *   liveObserved          — PV/JM event arrived AND client.state updated
 *   adapterMissingHandler — PV/JM event arrived but client.state did NOT update
 *   eventObserved_mappingRequired — event arrived but key path unclear
 *   noLiveEventObserved   — no event arrived during controlled knob movement
 *   unknown               — no movement performed / inconclusive
 *
 * Usage:
 *   pnpm probe:dev probe-live-events --device 157.247.3.12 --duration 60000 \
 *     --filter "line.ch11.comp.release,line.ch11.gate.range,line.ch11.comp.ratio,line.ch11.limit.threshold"
 *
 * Implements: ARC-C-003 (#13)
 */
import type { Command } from 'commander'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatISO } from '../utils.js'

// MessageCode constants from featherbear API (raw string values)
const MC = {
  ParamValue: 'PV',   // MessageCode.Setting / MessageCode.ParamValue
  JSON:       'JM',   // MessageCode.JSON
  ParamChars: 'PC',   // MessageCode.ParamChars
  ParamString:'PS',   // MessageCode.ParamString
  ZLIB:       'ZB',   // MessageCode.ZLIB (initial state snapshot)
} as const

interface EventRecord {
  ts: string
  event: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
  watchedKeysBefore: Record<string, unknown>
  watchedKeysAfter: Record<string, unknown>
  changedKeys: string[]
}

interface KeyStatus {
  key: string
  pvEventArrived: boolean
  stateUpdatedLive: boolean
  observedValues: Array<{ ts: string; value: unknown }>
  classification: 'liveObserved' | 'adapterMissingHandler' | 'noLiveEventObserved' | 'unknown'
}

export function registerProbeLiveEventsCommand(program: Command): void {
  program
    .command('probe-live-events')
    .description(
      'Watch live PV/JM/data events from the mixer to determine if Fat Channel controls ' +
      'emit live updates or are only visible in scene snapshots'
    )
    .requiredOption('-d, --device <ip>', 'Target device IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('--duration <ms>', 'Capture duration in ms (default 60000)', '60000')
    .option(
      '--filter <keys>',
      'Comma-separated key paths to watch (default: Fat Channel keys on ch11)',
      'line.ch11.comp.release,line.ch11.gate.range,line.ch11.comp.ratio,line.ch11.limit.threshold,line.ch11.comp.attack,line.ch11.gate.release'
    )
    .option('--out <dir>', 'Output directory for evidence files')
    .action(async (opts: {
      device: string
      port: string
      duration: string
      filter: string
      out?: string
    }) => {
      const port = parseInt(opts.port, 10)
      const duration = parseInt(opts.duration, 10)
      const watchKeys = opts.filter.split(',').map(k => k.trim()).filter(Boolean)

      const dateStr = formatISO(new Date())
      const outDir = opts.out ?? join('captures', dateStr, 'live-events')
      mkdirSync(outDir, { recursive: true })
      const eventsFile = join(outDir, 'events.ndjson')
      const summaryFile = join(outDir, 'summary.json')

      console.error(`Connecting to ${opts.device}:${port}...`)
      console.error(`Watching keys: ${watchKeys.join(', ')}`)
      console.error(`Duration: ${duration}ms`)
      console.error(`Output: ${eventsFile}`)
      console.error('')
      console.error('>>> Move the knobs in UC Surface now. <<<')
      console.error('')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Client } = await import('@featherbear/presonus-studiolive-api') as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })

      // Per-key tracking state
      const keyStatus: Record<string, KeyStatus> = {}
      for (const key of watchKeys) {
        keyStatus[key] = {
          key,
          pvEventArrived: false,
          stateUpdatedLive: false,
          observedValues: [],
          classification: 'unknown',
        }
      }

      const eventLog: EventRecord[] = []
      let totalEvents = 0
      let zlibReceived = false

      // Snapshot watched key values from client.state
      const snapshotWatchedKeys = (): Record<string, unknown> => {
        const snap: Record<string, unknown> = {}
        for (const key of watchKeys) {
          try {
            snap[key] = client.state?.get(key) ?? null
          } catch {
            snap[key] = null
          }
        }
        return snap
      }

      // Generic event handler that records before/after for watched keys
      const handleEvent = (eventName: string, payload: unknown): void => {
        totalEvents++
        const before = snapshotWatchedKeys()

        // Brief delay to allow featherbear's own PV handler to update state
        // (the internal handler runs synchronously before 'data' is emitted,
        //  so for PV events the state should already be updated by the time
        //  'data' fires — but we record both PV-specific and data events)
        const after = snapshotWatchedKeys()

        const changedKeys = watchKeys.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))

        const record: EventRecord = {
          ts: new Date().toISOString(),
          event: eventName,
          payload,
          watchedKeysBefore: before,
          watchedKeysAfter: after,
          changedKeys,
        }
        eventLog.push(record)

        // Update per-key status
        if (eventName === MC.ParamValue) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pvName = (payload as any)?.name
          if (typeof pvName === 'string' || Array.isArray(pvName)) {
            const normalized = Array.isArray(pvName) ? (pvName as string[]).join('.') : String(pvName)
            const matchedKey = watchKeys.find(k =>
              normalized === k || normalized.endsWith('.' + k.split('.').slice(-1)[0])
            )
            if (matchedKey) {
              const ks = keyStatus[matchedKey]
              if (ks) ks.pvEventArrived = true
              process.stderr.write(`\r  [${new Date().toISOString()}] PV event for ${matchedKey}`)
            }
          }
        }

        for (const key of changedKeys) {
          const ks = keyStatus[key]
          if (ks) {
            ks.stateUpdatedLive = true
            ks.observedValues.push({
              ts: record.ts,
              value: after[key],
            })
            process.stderr.write(`\r  [${record.ts}] STATE CHANGE: ${key} = ${JSON.stringify(after[key])}`)
          }
        }

        // Write event to NDJSON log
        const line = JSON.stringify({ ts: record.ts, event: eventName, payload, changedKeys, watchedKeysAfter: after })
        writeFileSync(eventsFile, line + '\n', { flag: 'a' })

        if (totalEvents % 50 === 0) {
          process.stderr.write(`\r  Total events: ${totalEvents}, watched key changes: ${eventLog.filter(e => e.changedKeys.length > 0).length}`)
        }
      }

      // Attach event listeners BEFORE connecting
      // 1. PV = ParamValue/Setting events (Fat Channel knob movements)
      client.on(MC.ParamValue, (data: unknown) => handleEvent(MC.ParamValue, data))
      // 2. JM = JSON events (scene loads, bulk state)
      client.on(MC.JSON, (data: unknown) => handleEvent(MC.JSON, data))
      // 3. PC = ParamChars
      client.on(MC.ParamChars, (data: unknown) => handleEvent(MC.ParamChars, data))
      // 4. PS = ParamString
      client.on(MC.ParamString, (data: unknown) => handleEvent(MC.ParamString, data))
      // 5. ZB = ZLIB initial state snapshot
      client.on(MC.ZLIB, (data: unknown) => {
        zlibReceived = true
        const after = snapshotWatchedKeys()
        const line = JSON.stringify({ ts: new Date().toISOString(), event: 'ZB_initial_snapshot', watchedKeysAfter: after })
        writeFileSync(eventsFile, line + '\n', { flag: 'a' })
        process.stderr.write(`\r  ZLIB snapshot received. Watched keys: ${JSON.stringify(after)}`)
        process.stderr.write('\n')
      })
      // 6. data = generic event (fires after specific event, includes all)
      client.on('data', (data: unknown) => handleEvent('data', data))
      // 7. Connection lifecycle events
      for (const lifecycle of ['connected', 'closed', 'reconnecting', 'error']) {
        client.on(lifecycle, (data: unknown) => {
          const line = JSON.stringify({ ts: new Date().toISOString(), event: lifecycle, data })
          writeFileSync(eventsFile, line + '\n', { flag: 'a' })
          process.stderr.write(`\n  [${lifecycle}]\n`)
        })
      }

      await client.connect({
        clientDescription: 'presonus-mcp-probe-live-events',
        clientIdentifier: `probe-live-${Date.now()}`,
      })

      console.error(`Connected. Watching for ${duration}ms...`)
      console.error('Move each Fat Channel knob: comp.release, gate.range, comp.ratio, limiter threshold')
      console.error('Move each to: minimum, maximum, middle position')

      await new Promise(r => setTimeout(r, duration))

      await client.close?.()

      // Classify each key
      for (const key of watchKeys) {
        const s = keyStatus[key]
        if (!s) continue
        if (s.stateUpdatedLive) {
          s.classification = 'liveObserved'
        } else if (s.pvEventArrived) {
          s.classification = 'adapterMissingHandler'
        } else {
          s.classification = 'noLiveEventObserved'
        }
      }

      // Build summary
      const summary = {
        _meta: {
          device: opts.device,
          firmware: 'unknown — check device',
          capturedAt: new Date().toISOString(),
          duration_ms: duration,
          totalEvents,
          zlibReceived,
          watchedKeys: watchKeys,
        },
        results: Object.values(keyStatus).map(s => ({
          key: s.key,
          pvEventArrived: s.pvEventArrived,
          stateUpdatedLive: s.stateUpdatedLive,
          classification: s.classification,
          observedValueCount: s.observedValues.length,
          observedValues: s.observedValues,
        })),
        resultTable: buildResultTable(Object.values(keyStatus)),
        interpretation: Object.fromEntries(
          Object.values(keyStatus).map(s => [
            s.key,
            s.classification === 'liveObserved'
              ? 'LIVE — remove sceneStored claim; use event-backed calibration'
              : s.classification === 'adapterMissingHandler'
              ? 'EVENT arrives but state not updated — adapter needs event handler fix'
              : 'noLiveEventObserved — sceneSnapshot classification may be correct; verify by moving knob during window',
          ])
        ),
      }

      writeFileSync(summaryFile, JSON.stringify(summary, null, 2))

      // Print summary table
      console.error('\n\n' + '─'.repeat(80))
      console.error('PROBE-LIVE-EVENTS RESULT')
      console.error('─'.repeat(80))
      console.error(summary.resultTable)
      console.error('─'.repeat(80))
      console.error(`Events log:  ${eventsFile}`)
      console.error(`Summary:     ${summaryFile}`)
    })
}

function buildResultTable(results: KeyStatus[]): string {
  const rows = results.map(s => {
    const pv = s.pvEventArrived ? 'yes' : 'no '
    const st = s.stateUpdatedLive ? 'yes' : 'no '
    const cls = s.classification.padEnd(24)
    return `  ${s.key.padEnd(40)} | PV=${pv} | stateUpdate=${st} | ${cls}`
  })
  const header = `  ${'Key'.padEnd(40)} | PV    | stateUpdate   | Classification         `
  const sep    = `  ${'-'.repeat(40)}-+-${'-'.repeat(7)}-+-${'-'.repeat(15)}-+-${'-'.repeat(24)}`
  return [header, sep, ...rows].join('\n')
}
