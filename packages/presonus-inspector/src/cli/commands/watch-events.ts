/**
 * `presonus-probe watch-events` command
 *
 * Subscribe to all featherbear data events and stream them as NDJSON.
 * Used to discover state keys as they change (make a change in UC Surface, observe the event).
 *
 * Implements: ARC-C-003 (#13)
 */
import type { Command } from 'commander'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { formatISO } from '../utils.js'

export function registerWatchEventsCommand(program: Command): void {
  program
    .command('watch-events')
    .description('Subscribe to all mixer state-change events and stream as NDJSON')
    .requiredOption('-d, --device <serial|ip>', 'Target device: serial number or IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('-s, --seconds <N>', 'Capture duration in seconds (0 = run until Ctrl+C)', '60')
    .option('--out <file>', 'Output NDJSON file path (default: captures/<date>/<serial>/events.jsonl)')
    .action(async (opts: { device: string; port: string; seconds: string; out?: string }) => {
      const port = parseInt(opts.port, 10)
      const duration = parseInt(opts.seconds, 10)

      console.error(`Connecting to ${opts.device}:${port}...`)

      const { Client } = await import('@featherbear/presonus-studiolive-api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })
      // Pass explicit subscription options so the mixer knows this is a legitimate client.
      // Without options, featherbear uses default clientIdentifier "133d066a919ea0ea";
      // after many repeated connects the mixer may stop responding to that identifier.
      await client.connect({
        clientDescription: 'presonus-mcp-probe',
        clientIdentifier: `presonus-mcp-probe-${Date.now()}`,
      })
      console.error(`Connected. Watching events${duration > 0 ? ` for ${duration}s` : ' (Ctrl+C to stop)'}...`)

      const dateStr = formatISO(new Date())
      const outPath = opts.out ?? join('captures', dateStr, opts.device.replace(/\./g, '_'), 'events.jsonl')
      await mkdir(join(outPath, '..'), { recursive: true })

      const stream = createWriteStream(outPath, { flags: 'a' })
      let eventCount = 0

      const writeEvent = (eventType: string, data: unknown): void => {
        const line = JSON.stringify({ ts: new Date().toISOString(), event: eventType, data })
        stream.write(line + '\n')
        eventCount++
        process.stderr.write(`\r  Events captured: ${eventCount}`)
      }

      // Subscribe to generic data event
      client.on('data', (data: unknown) => writeEvent('data', data))

      // Subscribe to specific known event types
      for (const evt of ['setting', 'meter', 'connect', 'disconnect', 'error']) {
        client.on(evt, (data: unknown) => writeEvent(evt, data))
      }

      if (duration > 0) {
        await new Promise((r) => setTimeout(r, duration * 1000))
      } else {
        await new Promise<void>((r) => {
          process.on('SIGINT', () => r())
          process.on('SIGTERM', () => r())
        })
      }

      stream.end()
      await client.close?.()
      console.error(`\n\nCapture complete. ${eventCount} events → ${outPath}`)
    })
}
