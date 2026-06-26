/**
 * One-shot live state probe — dumps username, FX, DCA, and sub-group membership keys
 * from the live StudioLive 32SC at 157.247.3.13.
 *
 * Usage: npx tsx scripts/probe-live-state.ts
 */
import { discoverMixers, PresonusClientManager } from '../packages/presonus-adapter/src/index.ts'
import { writeFileSync } from 'fs'

const IP     = process.env.PRESONUS_IP     ?? '157.247.3.13'
const SERIAL = process.env.PRESONUS_SERIAL ?? 'SD7E21010066'
const OUT    = process.env.PROBE_OUT       ?? 'scripts/probe-live-state-out.txt'

const result = await discoverMixers({
  timeoutMs: 5000,
  fallbackDevices: [{ alias: 'live', fallbackIp: IP, fallbackPort: 53000, role: 'FOH', expectedSerial: SERIAL }],
})

if (result.devices.length === 0) { console.error('No mixer found'); process.exit(1) }
const id = result.devices[0]!
const mgr = new PresonusClientManager()
await mgr.connect(id)

const deadline = Date.now() + 15_000
while (Date.now() < deadline) {
  const s = mgr.getSnapshot(id.deviceId)
  if (s && s.channels.length > 0) break
  await new Promise(r => setTimeout(r, 400))
}

const snap = mgr.getSnapshot(id.deviceId)
if (!snap) { console.error('No snapshot'); process.exit(1) }
const flat = snap.flatState

const lines: string[] = []
const emit = (s: string) => { lines.push(s); process.stdout.write(s + '\n') }

emit('\n=== USERNAME KEYS (live) ===')
Object.entries(flat).filter(([k]) => k.endsWith('.username'))
  .forEach(([k, v]) => emit(`${k} = ${JSON.stringify(v)}`))

emit('\n=== FX BUS / RETURN (live) ===')
Object.entries(flat)
  .filter(([k]) => /^(fxbus|fxreturn)\./.test(k) && /username|name/.test(k))
  .forEach(([k, v]) => emit(`${k} = ${JSON.stringify(v)}`))

emit('\n=== DCA KEYS (live) ===')
Object.entries(flat).filter(([k]) => /dca/i.test(k))
  .forEach(([k, v]) => emit(`${k} = ${JSON.stringify(v)}`))

emit('\n=== SUB MEMBERSHIP = 1 (live) ===')
Object.entries(flat).filter(([k, v]) => /\.sub[1-4]$/.test(k) && v === 1)
  .forEach(([k, v]) => emit(`${k} = ${v}`))

emit('\n=== AUTOFILTERGROUP NAMES + MEMBERSHIP (live) ===')
// Group name lines
Object.entries(flat).filter(([k]) => /^autofiltergroup\.ch[0-9]+\.name$/.test(k))
  .forEach(([k, v]) => {
    const ch = k.split('.')[1]!
    emit(`${k} = ${JSON.stringify(v)}`)
    // members
    Object.entries(flat)
      .filter(([mk, mv]) => mk.startsWith(`autofiltergroup.${ch}.`) && !mk.endsWith('.name') && !mk.endsWith('.groupnum') && !mk.endsWith('.solo') && !mk.endsWith('.iconid') && mv === 1)
      .forEach(([mk, mv]) => emit(`  ${mk} = ${mv}`))
  })

await mgr.disconnect(id.deviceId)
writeFileSync(OUT, lines.join('\n'), 'utf8')
console.error(`Written to ${OUT}`)
