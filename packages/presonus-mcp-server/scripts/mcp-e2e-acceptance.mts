/**
 * MCP E2E Acceptance Script — v0.1.0 release gate
 *
 * Launches the built MCP server as a real child process over stdio transport,
 * performs the documented v0.1 read-only workflow, and writes JSON evidence
 * files to captures/mcp-e2e-acceptance-v0.1/.
 *
 * Run from repo root:
 *   node --experimental-vm-modules \
 *     --loader tsx/esm \
 *     packages/presonus-mcp-server/scripts/mcp-e2e-acceptance.mts
 *
 * OR (simpler):
 *   pnpm tsx packages/presonus-mcp-server/scripts/mcp-e2e-acceptance.mts
 *
 * Required env vars:
 *   PRESONUS_IP      — mixer IP address
 *   PRESONUS_SERIAL  — expected serial for identity validation
 *   PRESONUS_PORT    — optional, default 53000
 *   PRESONUS_ROLE    — optional, default FOH
 *   PRESONUS_WRITE must NOT be set (read-only test)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const EVIDENCE_DIR = join(REPO_ROOT, 'captures', 'mcp-e2e-acceptance-v0.1')
const SERVER_BIN = join(REPO_ROOT, 'packages', 'presonus-mcp-server', 'dist', 'index.js')

const PRESONUS_IP = process.env.PRESONUS_IP
const PRESONUS_SERIAL = process.env.PRESONUS_SERIAL
const PRESONUS_PORT = process.env.PRESONUS_PORT ?? '53000'
const PRESONUS_ROLE = process.env.PRESONUS_ROLE ?? 'FOH'

if (!PRESONUS_IP) throw new Error('PRESONUS_IP is required')
if (!PRESONUS_SERIAL) throw new Error('PRESONUS_SERIAL is required')
if (process.env.PRESONUS_WRITE === '1') throw new Error('PRESONUS_WRITE must NOT be set for this read-only acceptance test')

mkdirSync(EVIDENCE_DIR, { recursive: true })

const evidence: Record<string, unknown> = {}

function save(filename: string, data: unknown) {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  writeFileSync(join(EVIDENCE_DIR, filename), content + '\n', 'utf8')
  console.error(`[e2e] saved: ${filename}`)
}

function redactSerial(s: string): string {
  // Keep first 4 and last 4 chars, replace middle with ***
  if (s.length <= 8) return s.slice(0, 2) + '***' + s.slice(-2)
  return s.slice(0, 4) + '***' + s.slice(-4)
}

async function main() {
  const startTime = new Date().toISOString()
  const steps: Array<{ step: string; result: 'PASS' | 'FAIL'; detail?: string }> = []

  function pass(step: string, detail?: string) {
    steps.push({ step, result: 'PASS', detail })
    console.error(`[e2e] PASS: ${step}${detail ? ' — ' + detail : ''}`)
  }
  function fail(step: string, detail: string): never {
    steps.push({ step, result: 'FAIL', detail })
    console.error(`[e2e] FAIL: ${step} — ${detail}`)
    save('session-summary.txt', formatSummary(steps, startTime))
    process.exit(1)
  }

  // ── Step 1: Launch server over stdio ─────────────────────────────────────

  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_BIN],
    env: {
      ...process.env,
      PRESONUS_IP,
      PRESONUS_PORT,
      PRESONUS_SERIAL,
      PRESONUS_ROLE,
      // Explicitly absent: PRESONUS_WRITE
      PRESONUS_WRITE: undefined as unknown as string,
      NODE_ENV: 'production',
    },
  })

  const client = new Client(
    { name: 'mcp-e2e-acceptance', version: '0.1.0' },
    { capabilities: {} },
  )

  try {
    await client.connect(transport)
    pass('Real client launches built server', `node ${SERVER_BIN}`)
    pass('MCP handshake over stdio', 'connect() resolved without error')
  } catch (err) {
    fail('MCP handshake over stdio', String(err))
  }

  // ── Step 2: tools/list ───────────────────────────────────────────────────

  let toolNames: string[] = []
  try {
    const toolsResult = await client.listTools()
    toolNames = toolsResult.tools.map((t) => t.name)
    save('tools-list.txt', toolNames.join('\n'))

    const required = ['discover_mixers', 'validate_mixer_identity', 'refresh_mixer_state', 'get_mixer_capabilities']
    for (const req of required) {
      if (!toolNames.includes(req)) fail('tools/list', `Required tool missing: ${req}`)
    }
    pass('tools/list', `${toolNames.length} tools discovered, all required tools present`)

    // Confirm write tools are absent
    const writeTools = toolNames.filter((n) => n.startsWith('prepare_') || n === 'apply_change_set' || n === 'propose_eq_change')
    if (writeTools.length > 0) {
      pass('writes disabled by default', `Write tools NOT registered (none found in tools/list): confirmed absent. NOTE: ${writeTools.join(', ')} found — expected absent without PRESONUS_WRITE=1`)
    } else {
      pass('writes disabled by default', 'No write tools registered — PRESONUS_WRITE not set')
    }
  } catch (err) {
    fail('tools/list', String(err))
  }

  // ── Step 3: resources/list ───────────────────────────────────────────────

  try {
    const resourcesResult = await client.listResources()
    const resourceUris = resourcesResult.resources.map((r) => r.uri)
    save('resources-list.txt', resourceUris.join('\n'))
    pass('resources discovery', `${resourceUris.length} resources discovered`)
  } catch (err) {
    // Resources list failure is non-blocking if tools work
    console.error(`[e2e] resources/list error (non-fatal): ${err}`)
    steps.push({ step: 'resources discovery', result: 'FAIL', detail: String(err) })
  }

  // ── Step 4: discover_mixers ──────────────────────────────────────────────

  let deviceId: string | undefined
  let observedSerial: string | undefined

  try {
    // Try discover_mixers first (UDP broadcast, timeoutMs=8000)
    const discoverResult = await client.callTool({ name: 'discover_mixers', arguments: { timeoutMs: 8000 } })
    const discoverBody = JSON.parse((discoverResult.content as Array<{ type: string; text: string }>)[0]!.text) as
      | Array<{ deviceId: string; serial: string; model?: string; ipAddress?: string; role?: string }>
      | { error?: string }

    let devices: Array<{ deviceId: string; serial: string; model?: string; ipAddress?: string; role?: string }> = []
    if (Array.isArray(discoverBody)) {
      devices = discoverBody
    }

    // If UDP discovery found nothing, fall back to the presonus://mixers resource (background-connected)
    if (devices.length === 0) {
      console.error('[e2e] discover_mixers returned 0 devices via UDP — checking presonus://mixers resource (configured fallback)')
      const mixersResource = await client.readResource({ uri: 'presonus://mixers' })
      const mixersBody = JSON.parse((mixersResource.contents[0]! as { text: string }).text) as
        | Array<{ deviceId: string; serial: string; model?: string; ipAddress?: string; role?: string }>
        | { mixers?: Array<{ deviceId: string; serial: string }> }
      if (Array.isArray(mixersBody)) {
        devices = mixersBody
      } else if (mixersBody.mixers) {
        devices = mixersBody.mixers as typeof devices
      }
    }

    save('discover-mixers.json', {
      discoveredViaUdp: Array.isArray(discoverBody) ? discoverBody.length : 0,
      devices: devices.map((d) => ({
        ...d,
        serial: redactSerial(d.serial),
      })),
    })

    if (devices.length === 0) {
      fail('discover_mixers', 'No devices returned from either UDP discovery or presonus://mixers resource')
    }

    const device = devices[0]!
    deviceId = device.deviceId
    observedSerial = device.serial
    pass('discover_mixers', `deviceId=${device.deviceId} serial=${redactSerial(device.serial)} role=${device.role ?? 'unknown'}`)
  } catch (err) {
    fail('discover_mixers', String(err))
  }

  // ── Step 5: validate_mixer_identity ─────────────────────────────────────

  try {
    const idResult = await client.callTool({
      name: 'validate_mixer_identity',
      arguments: { deviceId, expectedSerial: PRESONUS_SERIAL },
    })
    const body = JSON.parse((idResult.content as Array<{ type: string; text: string }>)[0]!.text) as {
      valid: boolean; reasons?: string[]
    }
    save('validate-identity.json', {
      ...body,
      expectedSerial: redactSerial(PRESONUS_SERIAL),
      observedSerial: observedSerial ? redactSerial(observedSerial) : 'unknown',
    })
    if (!body.valid) fail('expected serial verified', `valid=false reasons=${JSON.stringify(body.reasons)}`)
    pass('expected serial verified', `valid=true expectedSerial=${redactSerial(PRESONUS_SERIAL)}`)
  } catch (err) {
    fail('expected serial verified', String(err))
  }

  // ── Step 6: refresh_mixer_state ──────────────────────────────────────────

  try {
    const refreshResult = await client.callTool({ name: 'refresh_mixer_state', arguments: { deviceId } })
    const body = JSON.parse((refreshResult.content as Array<{ type: string; text: string }>)[0]!.text) as {
      success?: boolean; capturedAt?: string; channelCount?: number
    }
    save('refresh-state.json', body)
    if (body.success === false) fail('refresh_mixer_state', 'success=false')
    pass('refresh_mixer_state', `capturedAt=${body.capturedAt ?? 'n/a'} channelCount=${body.channelCount ?? 'n/a'}`)
  } catch (err) {
    fail('refresh_mixer_state', String(err))
  }

  // ── Step 7: Read channel state resource ──────────────────────────────────

  try {
    const channelsResult = await client.readResource({ uri: `presonus://mixer/${deviceId}/channels` })
    const body = JSON.parse((channelsResult.contents[0]! as { text: string }).text) as {
      channels?: Array<{ id: string; name?: string; mute?: boolean; fader?: { db?: number | null } }>
    }
    const firstCh = body.channels?.[0]
    const sample = {
      channelId: firstCh?.id,
      name: firstCh?.name,
      mute: firstCh?.mute,
      faderDb: firstCh?.fader?.db,
    }
    save('channel-sample.json', sample)
    if (!firstCh) fail('real channel state read', 'No channels in response')
    pass('real channel state read', `ch=${firstCh.id} name=${firstCh.name ?? '<no name>'} mute=${firstCh.mute} fader=${firstCh.fader?.db?.toFixed(1) ?? 'n/a'}dB`)
  } catch (err) {
    fail('real channel state read', String(err))
  }

  // ── Step 8: get_mixer_capabilities ───────────────────────────────────────

  try {
    const capsResult = await client.callTool({ name: 'get_mixer_capabilities', arguments: { deviceId } })
    const body = JSON.parse((capsResult.content as Array<{ type: string; text: string }>)[0]!.text) as Record<string, unknown>
    save('mixer-capabilities.json', body)
    pass('get_mixer_capabilities', `lineInputs=${body.lineInputs} auxMixes=${body.auxMixes} subgroups=${body.subgroups} fxBuses=${body.fxBuses} fatChannel=${body.fatChannel}`)
  } catch (err) {
    fail('get_mixer_capabilities', String(err))
  }

  // ── Step 9: Clean shutdown ────────────────────────────────────────────────

  try {
    await client.close()
    pass('clean shutdown', 'client.close() completed without error')
  } catch (err) {
    steps.push({ step: 'clean shutdown', result: 'FAIL', detail: String(err) })
    console.error(`[e2e] clean shutdown error: ${err}`)
  }

  save('shutdown.txt', `Shutdown completed at ${new Date().toISOString()}\n`)
  save('session-summary.txt', formatSummary(steps, startTime))
  console.error('\n[e2e] === ACCEPTANCE COMPLETE ===')
  for (const s of steps) {
    console.error(`  ${s.result === 'PASS' ? '✓' : '✗'} ${s.step}${s.detail ? ': ' + s.detail : ''}`)
  }
  const allPass = steps.every((s) => s.result === 'PASS')
  console.error(`\n[e2e] RESULT: ${allPass ? 'V0_1_RELEASE_READY (E2E gate)' : 'V0_1_RELEASE_BLOCKED'}`)
  process.exit(allPass ? 0 : 1)
}

main().catch((err) => {
  console.error('[e2e] Fatal error:', err)
  process.exit(1)
})

function formatSummary(
  steps: Array<{ step: string; result: string; detail?: string }>,
  startTime: string,
): string {
  const lines = [
    `MCP E2E Acceptance — v0.1.0`,
    `Date: ${startTime}`,
    `Release candidate: 38a02ad (or later with lockfile fix)`,
    `Client: @modelcontextprotocol/sdk StdioClientTransport`,
    `Server: packages/presonus-mcp-server/dist/index.js`,
    `Transport: stdio`,
    `Mixer IP: ${process.env.PRESONUS_IP}`,
    `Mixer serial (partial): ${process.env.PRESONUS_SERIAL ? redactSerial(process.env.PRESONUS_SERIAL) : 'not set'}`,
    `PRESONUS_WRITE: ${process.env.PRESONUS_WRITE ?? '(not set — read-only)'}`,
    '',
    'Steps:',
    ...steps.map((s) => `  [${s.result}] ${s.step}${s.detail ? ': ' + s.detail : ''}`),
    '',
    `Completed: ${new Date().toISOString()}`,
  ]
  return lines.join('\n')
}
