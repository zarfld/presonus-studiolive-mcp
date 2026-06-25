/**
 * `presonus-probe probe-routing` command
 *
 * Two subcommands for routing state discovery:
 *   dump  — connect to mixer and dump full state (same workflow as dump-state, for routing)
 *   diff  — compare two state dumps with routing-specific grep filtering
 *
 * The --kind flag maps to RoutingKind values and applies a targeted grep pattern,
 * so engineers can quickly find changed routing keys without wading through 22,000 state keys.
 *
 * @module probe-routing-command
 * @implements #46 REQ-F-PROBE-002: probe-routing CLI command
 * @architecture #47 ADR-008: Two-layer routing model — Layer B discovery workflow
 */
import type { Command } from 'commander'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { flattenFeatherbearState } from '@presonus-mcp/adapter'

// ---------------------------------------------------------------------------
// RoutingKind → grep pattern mapping
// ---------------------------------------------------------------------------

export type RoutingKindFilter =
  | 'channel-to-aux'
  | 'channel-to-fx'
  | 'fx-return-to-aux'
  | 'talkback-to-aux'
  | 'input-source'
  | 'bus-to-output'
  | 'avb-stream'
  | 'stagebox'

const KIND_GREP_MAP: Record<RoutingKindFilter, string[]> = {
  'channel-to-aux':   ['aux', 'assign_aux'],
  'channel-to-fx':    ['FX', 'assign_FX'],
  'fx-return-to-aux': ['fxreturn', 'aux', 'assign_aux'],
  'talkback-to-aux':  ['talkback', 'aux', 'assign_aux'],
  'input-source':     ['source', 'input', 'digital', 'patch', 'network'],
  'bus-to-output':    ['mix', 'output', 'outputpatchrouter'],
  'avb-stream':       ['avb', 'stream', 'network'],
  'stagebox':         ['stagebox', 'avb'],
}

const DEFAULT_ROUTING_PATTERNS = ['source', 'input', 'route', 'avb', 'digital', 'patch', 'network', 'assign', 'FX', 'aux']

export const VALID_KINDS = Object.keys(KIND_GREP_MAP) as RoutingKindFilter[]

/** Returns the effective grep patterns for a given kind (or default if no kind). */
export function getGrepPatterns(kind: string | undefined, extraGrep: string | undefined): string[] {
  const extra = extraGrep ? extraGrep.split(',').map((s) => s.trim()).filter(Boolean) : []
  if (kind === undefined) return [...DEFAULT_ROUTING_PATTERNS, ...extra]
  if (!VALID_KINDS.includes(kind as RoutingKindFilter)) {
    throw new Error(`Unknown --kind value: "${kind}". Valid values: ${VALID_KINDS.join(', ')}`)
  }
  return [...KIND_GREP_MAP[kind as RoutingKindFilter], ...extra]
}

/** Infer RoutingKind from a changed state key path (best-effort annotation). */
function inferKindFromKey(key: string): string {
  if (/^(line|return|fxreturn|talkback)\.ch\d+\.aux\d+$/.test(key)) return 'channel-to-aux'
  if (/^(line|return)\.ch\d+\.assign_aux\d+$/.test(key)) return 'channel-to-aux'
  if (/^line\.ch\d+\.(FX[A-H]|assign_FX[A-H])$/.test(key)) return 'channel-to-fx'
  if (/^fxreturn\./.test(key)) return 'fx-return-to-aux'
  if (/^talkback\./.test(key)) return 'talkback-to-aux'
  if (/^outputpatchrouter\./.test(key)) return 'bus-to-output'
  if (/\bavb\b/.test(key)) return 'avb-stream'
  if (/\bstagebox\b/.test(key)) return 'stagebox'
  if (/\b(source|input|digital|patch|network)\b/.test(key)) return 'input-source'
  return 'unknown'
}

export function registerProbeRoutingCommand(program: Command): void {
  const probeRoutingCmd = program
    .command('probe-routing')
    .description(
      'Routing-focused state probe commands. Use "dump" to capture state, "diff" to find changed routing keys.\n' +
      'The --kind flag narrows grep to routing-specific patterns per ADR-008.',
    )

  probeRoutingCmd
    .command('dump')
    .description('Connect to mixer and dump full state to JSON (for routing diff workflow)')
    .requiredOption('-d, --device <serial|ip>', 'Target device: serial number or IP address')
    .option('-p, --port <port>', 'Control port (default 53000)', '53000')
    .option('--out <file>', 'Output file path (default: routing-dump-<timestamp>.json)')
    .action(async (opts: { device: string; port: string; out?: string }) => {
      const port = parseInt(opts.port, 10)
      const outFile = opts.out ?? `routing-dump-${Date.now()}.json`
      console.error(`Connecting to ${opts.device}:${port}...`)
      const { Client } = await import('@featherbear/presonus-studiolive-api')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = new (Client as any)({ host: opts.device, port })
      await client.connect()
      console.error('Connected. Waiting for state to populate...')
      await new Promise((r) => setTimeout(r, 2000))
      let rawState: Record<string, unknown> = {}
      try {
        const dumped = await client.dumpState?.()
        if (dumped && typeof dumped === 'object') rawState = dumped as Record<string, unknown>
      } catch { /* dumpState may not exist */ }
      const internalState = client.state?._data
      if (internalState && typeof internalState === 'object') {
        rawState = { ...(internalState as Record<string, unknown>), ...rawState }
      }
      const flatState = flattenFeatherbearState(rawState)
      const keyCount = Object.keys(flatState).length
      const output = {
        mixer: {
          name: flatState['global.mixer_name'] ?? 'Unknown',
          serial: String(flatState['global.mixer_serial'] ?? flatState['global.serial'] ?? opts.device),
        },
        capturedAt: new Date().toISOString(),
        stateKeyCount: keyCount,
        state: flatState,
      }
      await mkdir(dirname(outFile), { recursive: true }).catch(() => undefined)
      await writeFile(outFile, JSON.stringify(output, null, 2), 'utf8')
      await client.disconnect?.()
      console.error(`Dumped ${keyCount} state keys → ${outFile}`)
    })

  probeRoutingCmd
    .command('diff')
    .description('Compare two state dumps and show only routing-relevant changed keys.')
    .requiredOption('--before <file>', 'Before state dump JSON file')
    .requiredOption('--after <file>', 'After state dump JSON file')
    .option('--kind <kind>', `Filter by routing kind. Valid: ${VALID_KINDS.join(', ')}`)
    .option('--grep <patterns>', 'Additional comma-separated grep patterns (added on top of --kind)')
    .action(async (opts: { before: string; after: string; kind?: string; grep?: string }) => {
      let patterns: string[]
      try {
        patterns = getGrepPatterns(opts.kind, opts.grep)
      } catch (err) {
        console.error((err as Error).message)
        process.exit(1)
      }
      const extract = (json: unknown): Record<string, unknown> =>
        json !== null && typeof json === 'object' && 'state' in json
          ? (json as { state: Record<string, unknown> }).state
          : (json as Record<string, unknown>)
      const before = extract(JSON.parse(await readFile(opts.before, 'utf8')))
      const after  = extract(JSON.parse(await readFile(opts.after, 'utf8')))
      const patternRegex = new RegExp(
        patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i',
      )
      const changed: Array<{ key: string; before: unknown; after: unknown }> = []
      const added: string[] = []
      const removed: string[] = []
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (!patternRegex.test(key)) continue
        if (!(key in before))     added.push(key)
        else if (!(key in after)) removed.push(key)
        else if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
          changed.push({ key, before: before[key], after: after[key] })
      }
      const filterDesc = opts.kind ? `--kind ${opts.kind}` : 'default routing patterns'
      if (added.length === 0 && removed.length === 0 && changed.length === 0) {
        console.log(`No routing-relevant differences found (${filterDesc}).`)
        console.log(`Patterns applied: ${patterns.join(', ')}`)
        return
      }
      console.log(`\nRouting diff (${filterDesc})\nPatterns: ${patterns.join(', ')}\n`)
      if (changed.length > 0) {
        console.log(`Changed (${changed.length}):`)
        for (const c of changed.sort((a, b) => a.key.localeCompare(b.key)))
          console.log(`  ${c.key}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}  [kind: ${inferKindFromKey(c.key)}]`)
      }
      if (added.length > 0) {
        console.log(`\nAdded (${added.length}):`)
        for (const k of added.sort()) console.log(`  + ${k}: ${JSON.stringify(after[k])}  [kind: ${inferKindFromKey(k)}]`)
      }
      if (removed.length > 0) {
        console.log(`\nRemoved (${removed.length}):`)
        for (const k of removed.sort()) console.log(`  - ${k}: ${JSON.stringify(before[k])}  [kind: ${inferKindFromKey(k)}]`)
      }
      console.log(`\nTotal: ${changed.length} changed, ${added.length} added, ${removed.length} removed`)
    })
}
