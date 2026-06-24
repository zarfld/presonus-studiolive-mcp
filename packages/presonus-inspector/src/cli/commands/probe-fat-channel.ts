/**
 * `presonus-probe probe-fat-channel` command
 *
 * Dumps all Fat Channel-related state keys for a specific mixer channel.
 * Workflow: select compressor/EQ model in UC Surface → run this command → record raw model ID.
 * Used to build docs/generated/fat-channel-enum-map.md.
 *
 * @module probe-fat-channel-command
 * @architecture #13 ARC-C-003: presonus-inspector probe CLI
 */
import type { Command } from 'commander'

const FAT_KEY_PATTERNS = ['fat', 'comp', 'eq', 'dyn', 'gate', 'lim', 'model', 'type', 'strip']

export function registerProbeFatChannelCommand(program: Command): void {
  program
    .command('probe-fat-channel')
    .description(
      'Dump Fat Channel state keys for a specific channel. ' +
      'Workflow: select compressor/EQ model in UC Surface, then run this command.',
    )
    .requiredOption('-d, --device <ip>', 'Target device IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('-c, --channel <type:number>', 'Channel to probe (e.g. LINE:1)', 'LINE:1')
    .action(async (opts: { device: string; port: string; channel: string }) => {
      const port = parseInt(opts.port, 10)
      const [typeStr, numStr] = opts.channel.split(':')
      const channelNum = parseInt(numStr ?? '1', 10)
      const channelType = (typeStr ?? 'line').toLowerCase()
      const prefix = `${channelType}.ch${channelNum}`

      console.error(`Connecting to ${opts.device}:${port}...`)

      const { Client } = await import('@featherbear/presonus-studiolive-api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })
      await client.connect()
      console.error(`Connected. Waiting 2s for state to populate...`)
      await new Promise((r) => setTimeout(r, 2000))

      // Collect state
      const state: Record<string, unknown> = {}
      const internalState = client.state?._data
      if (internalState && typeof internalState === 'object') {
        Object.assign(state, internalState)
      }

      // Filter Fat Channel keys
      const fatKeys: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(state)) {
        if (key.startsWith(prefix)) {
          const suffix = key.slice(prefix.length)
          if (FAT_KEY_PATTERNS.some((p) => suffix.includes(p))) {
            fatKeys[key] = val
          }
        }
      }

      if (Object.keys(fatKeys).length === 0) {
        console.log(`No Fat Channel keys found for ${opts.channel} (prefix: ${prefix})`)
        console.log(`Total state keys available: ${Object.keys(state).length}`)
        console.log(`Keys starting with ${prefix}:`)
        Object.keys(state)
          .filter((k) => k.startsWith(prefix))
          .sort()
          .forEach((k) => console.log(`  ${k}: ${JSON.stringify(state[k])}`))
      } else {
        console.log(`\nFat Channel keys for ${opts.channel} (${Object.keys(fatKeys).length} found):\n`)
        for (const [key, val] of Object.entries(fatKeys).sort()) {
          console.log(`  ${key}: ${JSON.stringify(val)}`)
        }
        console.log(
          '\nTIP: Change compressor/EQ model in UC Surface, then run this command again to see which key changes.',
        )
      }

      await client.close?.()
    })
}
