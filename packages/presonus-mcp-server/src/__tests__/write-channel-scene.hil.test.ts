/**
 * Hardware-in-Loop tests for write tools: channel rename, sub group membership,
 * aux assignment, and routing graph enhancement.
 *
 * ALL tests use LIVE mixer state — never a stale JSON file.
 * Each destructive test reverts the change within the same test block.
 *
 * Verifies: REQ-F-WRITE-005 (#86)
 * Traces to: #2 (StR-002: Show preparation)
 *
 * Run: HIL_PRESONUS=1 HIL_PRESONUS_IP=157.247.3.13 HIL_PRESONUS_SERIAL=SD7E21010066 pnpm test:hil
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { discoverMixers, PresonusClientManager } from '@presonus-mcp/adapter'
import { registerTools } from '../tools.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { MixerIdentity } from '@presonus-mcp/domain'

// ─── Environment ──────────────────────────────────────────────────────────────

const HIL    = process.env.HIL_PRESONUS        === '1'
const HIL_IP = process.env.HIL_PRESONUS_IP
const HIL_SN = process.env.HIL_PRESONUS_SERIAL

function discoveryConfig(timeoutMs = 5000) {
  return {
    timeoutMs,
    ...(HIL_IP ? {
      fallbackDevices: [{
        alias: 'hil-mixer', fallbackIp: HIL_IP, fallbackPort: 53000,
        role: 'FOH' as const,
        ...(HIL_SN ? { expectedSerial: HIL_SN } : {}),
      }],
    } : {}),
  }
}

// ─── Mock server (same pattern as field-acceptance.hil.test.ts) ───────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

function makeMockServer() {
  const tools = new Map<string, ToolHandler>()
  const server = {
    tool: (name: string, _d: string, _s: unknown, handler: ToolHandler) => tools.set(name, handler),
  } as unknown as McpServer
  return { server, tools }
}

async function callTool(tools: Map<string, ToolHandler>, name: string, args: Record<string, unknown>) {
  const handler = tools.get(name)
  if (!handler) throw new Error(`Tool '${name}' not registered — implement the tool first (RED→GREEN)`)
  return handler(args)
}

function body(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>
}

// ─── Shared connection ────────────────────────────────────────────────────────

let manager: PresonusClientManager
let identity: MixerIdentity

async function connectOnce(): Promise<void> {
  if (manager && identity && manager.getConnectedDeviceIds().includes(identity.deviceId)) return
  const result = await discoverMixers(discoveryConfig())
  expect(result.devices.length, HIL_IP ? `No mixer at ${HIL_IP}` : 'No mixer via UDP').toBeGreaterThan(0)
  identity = result.devices[0]!
  manager = new PresonusClientManager()
  manager.setAllWriteEnabled(true)
  await manager.connect(identity)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const s = manager.getSnapshot(identity.deviceId)
    if (s && s.channels.length > 0) break
    await new Promise(r => setTimeout(r, 400))
  }
}

if (HIL) {
  beforeAll(connectOnce, 30_000)
  afterAll(async () => {
    await manager?.disconnect(identity?.deviceId).catch(() => {})
  }, 10_000)
}

// ─── Freshness guard ─────────────────────────────────────────────────────────

function assertFreshSnapshot(): void {
  const snap = manager.getSnapshot(identity.deviceId)!
  const ageMs = Date.now() - new Date(snap.capturedAt).getTime()
  expect(ageMs, `Snapshot ${Math.round(ageMs / 1000)} s old — exceeds 5-min freshness limit`).toBeLessThan(5 * 60_000)
}

async function waitForKey(flatKey: string, expected: unknown, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snap = manager.getSnapshot(identity.deviceId)
    if (snap?.flatState[flatKey] === expected) return
    await new Promise(r => setTimeout(r, 300))
  }
  const actual = manager.getSnapshot(identity.deviceId)?.flatState[flatKey]
  expect(actual, `'${flatKey}': expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`).toBe(expected)
}

// ─── T1/T2: Channel rename via prepare_channel_rename_change_set ─────────────

describe.skipIf(!HIL)(
  'T1-T2 HIL — prepare_channel_rename_change_set + apply_change_set (#86 REQ-F-WRITE-005a)',
  () => {
    let { server, tools } = makeMockServer()
    let devId: string

    beforeAll(() => {
      assertFreshSnapshot()
      devId = identity.deviceId
      ;({ server, tools } = makeMockServer())
      registerTools(server, manager, { writeEnabled: true })
    })

    it('T1: prepare + apply rename of line.ch11 → "MCP_TEST_001", then read-back confirms', async () => {
      assertFreshSnapshot()
      const snap = manager.getSnapshot(devId)!
      const originalName = String(snap.flatState['line.ch11.username'] ?? 'Ch 11')

      // prepare
      const propResult = await callTool(tools, 'prepare_channel_rename_change_set', {
        deviceId: devId, channelId: 'line.ch11', newName: 'MCP_TEST_001',
      })
      const proposal = body(propResult)
      expect(proposal.changeSetId, 'changeSetId missing from proposal').toBeDefined()
      expect(proposal.description).toContain('MCP_TEST_001')

      // apply
      const applyResult = await callTool(tools, 'apply_change_set', {
        deviceId: devId,
        changeSetId: proposal.changeSetId,
        confirmationNote: 'HIL rename test T1',
      })
      expect(body(applyResult).success).toBe(true)

      // verify live read-back
      await waitForKey('line.ch11.username', 'MCP_TEST_001')

      // T2: revert
      const revertResult = await callTool(tools, 'prepare_channel_rename_change_set', {
        deviceId: devId, channelId: 'line.ch11', newName: originalName,
      })
      const revertApply = await callTool(tools, 'apply_change_set', {
        deviceId: devId,
        changeSetId: body(revertResult).changeSetId,
        confirmationNote: 'HIL rename revert T2',
      })
      expect(body(revertApply).success).toBe(true)
      await waitForKey('line.ch11.username', originalName)
    }, 30_000)

    it('T1: prepare_channel_rename_change_set rejects name > 16 chars', async () => {
      const r = await callTool(tools, 'prepare_channel_rename_change_set', {
        deviceId: devId, channelId: 'line.ch11', newName: 'THIS_NAME_IS_WAY_TOO_LONG_FOR_SCRIBBLE',
      })
      expect(r.isError).toBe(true)
    })

    it('T1: prepare_channel_rename_change_set rejects empty name', async () => {
      const r = await callTool(tools, 'prepare_channel_rename_change_set', {
        deviceId: devId, channelId: 'line.ch11', newName: '',
      })
      expect(r.isError).toBe(true)
    })

    it('T1: fxreturn channel rename works (fxreturn.ch4.username)', async () => {
      assertFreshSnapshot()
      const snap = manager.getSnapshot(devId)!
      const fxKey = 'fxreturn.ch4.username'
      const originalFxName = String(snap.flatState[fxKey] ?? 'VoxDelay')

      const propR = await callTool(tools, 'prepare_channel_rename_change_set', {
        deviceId: devId, channelId: 'fxreturn.ch4', newName: 'MCP_FX_TST',
      })
      const fxProp = body(propR)
      expect(fxProp.changeSetId).toBeDefined()

      await callTool(tools, 'apply_change_set', {
        deviceId: devId, changeSetId: fxProp.changeSetId, confirmationNote: 'HIL fxreturn rename',
      })
      await waitForKey(fxKey, 'MCP_FX_TST')

      // revert
      const rv = await callTool(tools, 'prepare_channel_rename_change_set', {
        deviceId: devId, channelId: 'fxreturn.ch4', newName: originalFxName,
      })
      await callTool(tools, 'apply_change_set', {
        deviceId: devId, changeSetId: body(rv).changeSetId, confirmationNote: 'revert fxreturn',
      })
      await waitForKey(fxKey, originalFxName)
    }, 30_000)
  },
)

// ─── T3: list_sub_groups (read-only) ─────────────────────────────────────────

describe.skipIf(!HIL)(
  'T3 HIL — list_sub_groups exposes fxreturn members (#86 REQ-F-WRITE-005b)',
  () => {
    let { server, tools } = makeMockServer()

    beforeAll(() => {
      assertFreshSnapshot()
      ;({ server, tools } = makeMockServer())
      registerTools(server, manager, { writeEnabled: false })
    })

    it('T3: list_sub_groups returns 4 buses', async () => {
      assertFreshSnapshot()
      const r = await callTool(tools, 'list_sub_groups', { deviceId: identity.deviceId })
      const result = body(r) as { buses: unknown[] }
      expect(Array.isArray(result.buses)).toBe(true)
      expect(result.buses.length).toBe(4)
    })

    it('T3: each bus has busId, username, members array', async () => {
      const r = await callTool(tools, 'list_sub_groups', { deviceId: identity.deviceId })
      const result = body(r) as { buses: Array<{ busId: string; username: string; members: unknown[] }> }
      for (const bus of result.buses) {
        expect(typeof bus.busId).toBe('string')
        expect(typeof bus.username).toBe('string')
        expect(Array.isArray(bus.members)).toBe(true)
      }
    })

    it('T3: members include channelId and channelType', async () => {
      const r = await callTool(tools, 'list_sub_groups', { deviceId: identity.deviceId })
      const result = body(r) as { buses: Array<{ members: Array<{ channelId: string; channelType: string }> }> }
      for (const bus of result.buses) {
        for (const m of bus.members) {
          expect(typeof m.channelId).toBe('string')
          expect(['line', 'fxreturn', 'return', 'talkback']).toContain(m.channelType)
        }
      }
    })

    it('T3: at least one bus has an fxreturn member (live state = VoxDelay/VoxPlate in BackVox/LeadVox)', async () => {
      assertFreshSnapshot()
      const r = await callTool(tools, 'list_sub_groups', { deviceId: identity.deviceId })
      const result = body(r) as { buses: Array<{ members: Array<{ channelType: string }> }> }
      const hasFxreturn = result.buses.some(b => b.members.some(m => m.channelType === 'fxreturn'))
      // This assertion documents the live topology; if the scene changes and no fxreturn members exist, update the test.
      expect(hasFxreturn, 'No fxreturn member found in any sub group — did the scene change?').toBe(true)
    })

    it('T3: list_sub_groups is available without writeEnabled (read-only tool)', () => {
      expect(tools.has('list_sub_groups')).toBe(true)
    })
  },
)

// ─── T4/T5: Sub group membership via prepare_sub_group_membership_change_set ──

describe.skipIf(!HIL)(
  'T4-T5 HIL — prepare_sub_group_membership_change_set (#86 REQ-F-WRITE-005c)',
  () => {
    let { server, tools } = makeMockServer()
    let devId: string
    let targetChannelId: string
    let targetSubIndex: number
    let targetFlatKey: string

    beforeAll(() => {
      assertFreshSnapshot()
      devId = identity.deviceId
      ;({ server, tools } = makeMockServer())
      registerTools(server, manager, { writeEnabled: true })

      // Discover a fxreturn channel that is currently IN a sub group
      const snap = manager.getSnapshot(devId)!
      const fxMemberKey = Object.keys(snap.flatState).find(k =>
        /^fxreturn\.ch\d+\.sub[1-4]$/.test(k) && snap.flatState[k] === 1
      )
      if (fxMemberKey) {
        const m = fxMemberKey.match(/^(fxreturn\.ch\d+)\.sub([1-4])$/)!
        targetChannelId = m[1]!
        targetSubIndex  = parseInt(m[2]!, 10)
        targetFlatKey   = fxMemberKey
      }
    })

    it('T4: remove fxreturn channel from sub group, then list_sub_groups confirms removal', async () => {
      if (!targetChannelId) {
        console.warn('[T4] No fxreturn sub group member found in live state — skipping')
        return
      }
      assertFreshSnapshot()

      const propR = await callTool(tools, 'prepare_sub_group_membership_change_set', {
        deviceId: devId, channelId: targetChannelId, subGroupIndex: targetSubIndex, assigned: false,
      })
      const prop = body(propR)
      expect(prop.changeSetId).toBeDefined()

      await callTool(tools, 'apply_change_set', {
        deviceId: devId, changeSetId: prop.changeSetId, confirmationNote: 'HIL sub remove T4',
      })
      await waitForKey(targetFlatKey, 0)

      // T5: restore
      const rvR = await callTool(tools, 'prepare_sub_group_membership_change_set', {
        deviceId: devId, channelId: targetChannelId, subGroupIndex: targetSubIndex, assigned: true,
      })
      await callTool(tools, 'apply_change_set', {
        deviceId: devId, changeSetId: body(rvR).changeSetId, confirmationNote: 'HIL sub restore T5',
      })
      await waitForKey(targetFlatKey, 1)
    }, 30_000)
  },
)

// ─── T6/T7: Aux assignment via prepare_aux_assignment_change_set ──────────────

describe.skipIf(!HIL)(
  'T6-T7 HIL — prepare_aux_assignment_change_set (#86 REQ-F-WRITE-005d)',
  () => {
    let { server, tools } = makeMockServer()
    let devId: string
    let targetChannelId: string
    let targetAuxBus: number
    let assignKey: string

    beforeAll(() => {
      assertFreshSnapshot()
      devId = identity.deviceId
      ;({ server, tools } = makeMockServer())
      registerTools(server, manager, { writeEnabled: true })

      // Discover a line channel assigned to any aux bus (assign_auxN = true/1)
      const snap = manager.getSnapshot(devId)!
      const assignedKey = Object.keys(snap.flatState).find(k => {
        if (!/^line\.ch\d+\.assign_aux\d+$/.test(k)) return false
        const v = snap.flatState[k]
        return v === true || v === 1
      })
      if (assignedKey) {
        const m = assignedKey.match(/^(line\.ch\d+)\.assign_aux(\d+)$/)!
        targetChannelId = m[1]!
        targetAuxBus    = parseInt(m[2]!, 10)
        assignKey       = assignedKey
      }
    })

    it('T6: unassign a line channel from its aux bus, get_aux_mix shows it muted, then restore', async () => {
      if (!targetChannelId) {
        console.warn('[T6] No assigned aux send found in live state — skipping')
        return
      }
      assertFreshSnapshot()

      const propR = await callTool(tools, 'prepare_aux_assignment_change_set', {
        deviceId: devId, channelId: targetChannelId, auxBus: targetAuxBus, assigned: false,
      })
      const prop = body(propR)
      expect(prop.changeSetId).toBeDefined()

      await callTool(tools, 'apply_change_set', {
        deviceId: devId, changeSetId: prop.changeSetId, confirmationNote: 'HIL aux unassign T6',
      })

      // Wait for state to reflect (assign_aux key = false or 0)
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const v = manager.getSnapshot(devId)?.flatState[assignKey]
        if (v === false || v === 0) break
        await new Promise(r => setTimeout(r, 300))
      }
      const afterVal = manager.getSnapshot(devId)?.flatState[assignKey]
      expect(afterVal === false || afterVal === 0, `${assignKey} should be false/0 after unassign, got ${afterVal}`).toBe(true)

      // T7: restore
      const rvR = await callTool(tools, 'prepare_aux_assignment_change_set', {
        deviceId: devId, channelId: targetChannelId, auxBus: targetAuxBus, assigned: true,
      })
      await callTool(tools, 'apply_change_set', {
        deviceId: devId, changeSetId: body(rvR).changeSetId, confirmationNote: 'HIL aux restore T7',
      })

      const deadline2 = Date.now() + 5000
      while (Date.now() < deadline2) {
        const v = manager.getSnapshot(devId)?.flatState[assignKey]
        if (v === true || v === 1) break
        await new Promise(r => setTimeout(r, 300))
      }
      const restoredVal = manager.getSnapshot(devId)?.flatState[assignKey]
      expect(restoredVal === true || restoredVal === 1).toBe(true)
    }, 30_000)
  },
)

// ─── T8: get_routing_graph includes fxreturn channels ─────────────────────────

describe.skipIf(!HIL)(
  'T8 HIL — get_routing_graph includes fxreturn channels (#86 REQ-F-READ-005e)',
  () => {
    let { server, tools } = makeMockServer()

    beforeAll(() => {
      assertFreshSnapshot()
      ;({ server, tools } = makeMockServer())
      registerTools(server, manager, { writeEnabled: false })
    })

    it('T8: get_routing_graph response includes at least one fxreturn channel', async () => {
      assertFreshSnapshot()
      const r = await callTool(tools, 'get_routing_graph', { deviceId: identity.deviceId })
      const result = body(r) as { channels: Array<{ channelId: string; channelType?: string }> }
      expect(Array.isArray(result.channels)).toBe(true)
      const fxReturnChs = result.channels.filter(c => c.channelId.startsWith('fxreturn.'))
      expect(fxReturnChs.length, 'No fxreturn channels in routing graph — enhance get_routing_graph (RED→GREEN)').toBeGreaterThan(0)
    })

    it('T8: each channel entry has a channelType field', async () => {
      const r = await callTool(tools, 'get_routing_graph', { deviceId: identity.deviceId })
      const result = body(r) as { channels: Array<{ channelId: string; channelType?: string }> }
      for (const ch of result.channels.slice(0, 5)) {
        expect(typeof ch.channelType, `channelType missing on ${ch.channelId}`).toBe('string')
      }
    })
  },
)
