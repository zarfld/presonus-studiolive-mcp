/**
 * `presonus-probe watch-meters` command
 * Implements: ARC-C-003 (#13)
 */
import type { Command } from 'commander'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { formatISO } from '../utils.js'

export function registerWatchMetersCommand(program: Command): void {
  program
    .command('watch-meters')
    .description('Subscribe to mixer meter stream and save as NDJSON')
    .requiredOption('-d, --device <serial|ip>', 'Target device: serial number or IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('-s, --seconds <N>', 'Capture duration in seconds (0 = run until Ctrl+C)', '30')
    .option('--out <file>', 'Output NDJSON file path')
    .action(async (opts: { device: string; port: string; seconds: string; out?: string }) => {
      const port = parseInt(opts.port, 10)
      const duration = parseInt(opts.seconds, 10)

      console.error(`Connecting to ${opts.device}:${port}...`)

      const { Client } = await import('@featherbear/presonus-studiolive-api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })
      await client.connect()

      if (typeof client.meterSubscribe === 'function') {
        client.meterSubscribe()
        console.error('Meter subscription started.')
      } else {
        console.error('⚠ client.meterSubscribe() not available — check API version.')
      }

      const dateStr = formatISO(new Date())
      const outPath = opts.out ?? join('captures', dateStr, opts.device.replace(/\./g, '_'), 'meters.jsonl')
      await mkdir(join(outPath, '..'), { recursive: true })

      const stream = createWriteStream(outPath, { flags: 'a' })
      let packetCount = 0

      client.on('meter', (data: unknown) => {
        const line = JSON.stringify({ ts: new Date().toISOString(), meter: data })
        stream.write(line + '\n')
        packetCount++
        process.stderr.write(`\r  Meter packets: ${packetCount}`)
      })

      if (duration > 0) {
        await new Promise((r) => setTimeout(r, duration * 1000))
      } else {
        await new Promise<void>((r) => {
          process.on('SIGINT', () => r())
        })
      }

      stream.end()
      await client.close?.()
      console.error(`\n\n${packetCount} meter packets → ${outPath}`)
    })
}
