/**
 * `presonus-probe discover` command
 * Satisfies: REQ-F-001 (#15), REQ-F-006 (#20)
 */
import type { Command } from 'commander'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { discoverMixers } from '@presonus-mcp/adapter'

export function registerDiscoverCommand(program: Command): void {
  program
    .command('discover')
    .description('Auto-discover StudioLive III mixers on the local network')
    .option('-t, --timeout <ms>', 'Discovery timeout in milliseconds', '5000')
    .option('--json', 'Output as JSON to stdout')
    .option('--out <file>', 'Save discovery result to file (JSON)')
    .action(async (opts: { timeout: string; json?: boolean; out?: string }) => {
      const timeoutMs = parseInt(opts.timeout, 10)

      if (!opts.json) {
        console.error(`Discovering StudioLive mixers (timeout: ${timeoutMs}ms)...`)
      }

      const result = await discoverMixers({ timeoutMs })

      if (opts.json) {
        process.stdout.write(JSON.stringify(result.devices, null, 2) + '\n')
        return
      }

      if (result.devices.length === 0) {
        console.log('No mixers discovered.')
      } else {
        console.log(`\nDiscovered ${result.devices.length} mixer(s):\n`)
        for (const d of result.devices) {
          console.log(`  • ${d.configuredAlias ?? d.name ?? d.deviceId}`)
          console.log(`    Serial:  ${d.serial ?? '(unknown)'}`)
          console.log(`    Model:   ${d.model ?? '(unknown)'}`)
          console.log(`    IP:      ${d.ip}:${d.port}`)
          console.log(`    Role:    ${d.role}`)
          console.log(`    Control: ${d.controllable ? 'enabled' : 'read-only'}`)
          console.log(`    Confidence: ${d.confidence}`)
          console.log('')
        }
      }

      if (result.missingConfigured.length > 0) {
        console.warn(`⚠ Configured device(s) not discovered:`)
        for (const cfg of result.missingConfigured) {
          console.warn(`  • ${cfg.alias} (expected serial: ${cfg.expectedSerial ?? 'any'})`)
          if (cfg.fallbackIp) {
            console.warn(`    Will use fallback IP: ${cfg.fallbackIp}`)
          }
        }
      }

      if (opts.out) {
        const dir = join(opts.out, '..')
        await mkdir(dir, { recursive: true })
        await writeFile(opts.out, JSON.stringify(result.devices, null, 2), 'utf8')
        console.log(`\nSaved to: ${opts.out}`)
      }
    })
}
