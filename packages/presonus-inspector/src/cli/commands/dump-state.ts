/**
 * `presonus-probe dump-state` command
 *
 * Connects to a mixer, dumps the full raw state tree, and saves it as JSON.
 * This is the PRIMARY tool for building docs/generated/state-key-map.md.
 *
 * Satisfies: REQ-F-006 (#20)
 * Implements: ARC-C-003 (#13)
 */
import type { Command } from 'commander'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { formatISO } from '../utils.js'

export function registerDumpStateCommand(program: Command): void {
  program
    .command('dump-state')
    .description('Connect to a mixer and dump the full raw state tree to JSON')
    .requiredOption('-d, --device <serial|ip>', 'Target device: serial number or IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('--out <file>', 'Output file path (default: captures/<date>/<serial>/state-full.json)')
    .option('--print-keys', 'Print all state keys to stdout (in addition to saving file)')
    .action(async (opts: { device: string; port: string; out?: string; printKeys?: boolean }) => {
      const port = parseInt(opts.port, 10)

      console.error(`Connecting to ${opts.device}:${port}...`)

      const { Client } = await import('@featherbear/presonus-studiolive-api')

      // Resolve IP: if device looks like a serial, we'd need discovery first
      // For now, treat anything that looks like an IP directly
      const host = opts.device

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host, port })

      await client.connect()
      console.error('Connected.')

      // Wait briefly for initial state to populate
      await new Promise((r) => setTimeout(r, 2000))

      // Read raw nested state tree from featherbear
      let rawState: Record<string, unknown> = {}
      try {
        const dumped = await client.dumpState?.()
        if (dumped && typeof dumped === 'object') {
          rawState = dumped as Record<string, unknown>
        }
      } catch {
        // dumpState may not exist; try reading internal state
      }

      const internalState = client.state?._data
      if (internalState && typeof internalState === 'object') {
        rawState = { ...(internalState as Record<string, unknown>), ...rawState }
      }

      // Flatten nested featherbear tree (internal.children.*.children.*) into dot-notation
      const { flattenFeatherbearState } = await import('@presonus-mcp/adapter')
      const flatState = flattenFeatherbearState(rawState)

      const keyCount = Object.keys(flatState).length

      // Extract metadata from flattened state (OBSERVED on 32SC fw 3.3.0.109659)
      const mixerName = flatState['global.mixer_name'] ?? 'Unknown'
      const serial = String(flatState['global.mixer_serial'] ?? flatState['global.serial'] ?? opts.device)
      const firmware = String(flatState['global.mixer_version'] ?? flatState['global.firmware'] ?? 'Unknown')

      const output = {
        mixer: {
          name: mixerName,
          serial,
          firmware,
          host,
          port,
        },
        capturedAt: new Date().toISOString(),
        stateKeyCount: keyCount,
        /** Flattened dot-notation state (e.g. "line.ch1.mute": false). Ready for state mapper. */
        state: flatState,
        /** Raw nested tree for diagnostic reference */
        rawNestedState: rawState,
      }

      console.error(`\nMixer:    ${mixerName}`)
      console.error(`Serial:   ${serial}`)
      console.error(`Firmware: ${firmware}`)
      console.error(`Keys:     ${keyCount}`)

      if (keyCount < 50) {
        console.error(`\n⚠ WARNING: Only ${keyCount} state keys found. Expected 50+.`)
        console.error('  State may not have fully populated yet, or dumpState() is unavailable.')
        console.error('  Consider running watch-events for 10s to capture more state.')
      }

      if (opts.printKeys) {
        console.log('\nState keys:')
        for (const key of Object.keys(rawState).sort()) {
          console.log(`  ${key}: ${JSON.stringify(rawState[key])}`)
        }
      }

      // Determine output path
      const dateStr = formatISO(new Date())
      const safeSerial = String(serial).replace(/[^a-zA-Z0-9_-]/g, '_')
      const outPath = opts.out ?? join('captures', dateStr, safeSerial, 'state-full.json')

      const dir = join(outPath, '..')
      await mkdir(dir, { recursive: true })
      await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8')

      console.error(`\nSaved to: ${outPath}`)
      console.log(outPath)  // Print path to stdout for scripting

      await client.close?.()
    })
}
