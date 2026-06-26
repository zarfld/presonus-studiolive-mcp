/**
 * Hardware-in-Loop (HIL) tests for the probe session lifecycle.
 *
 * Verifies against real StudioLive 32SC (serial SD7E21010066):
 *   REQ-F-PROBE-001 (#68) — start_routing_probe captures real mixer baseline
 *   REQ-F-PROBE-002 (#46) — complete_routing_probe diffs real state
 *   QA-SC-PROBE-001 (#50) — probe session error guidance (invalid kind)
 *   EPIC-PROBE-HIL (#68)  — hardware-in-loop probe workflow
 *
 * DESIGN: The probe session lifecycle test does NOT require a human to manually
 * change routing in UC Surface. Instead, we call start_routing_probe, wait briefly
 * on a stable state, then call complete_routing_probe — the expected result is
 * changedKeys = [] because nothing changed. This confirms:
 *   1. The baseline is correctly captured from real flatState
 *   2. The diff algorithm correctly identifies no changes
 *   3. The probe session is consumed (one-shot) after complete
 *   4. The UUID and timestamps are correctly generated
 *
 * Run: pnpm test:hil   (sets HIL_PRESONUS=1, uses vitest.hil.config.ts)
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

// ─── Mock server infrastructure (mirrors routing-probe.test.ts pattern) ───────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

function makeMockServer(): { server: McpServer; tools: Map<string, ToolHandler> } {
  const tools = new Map<string, ToolHandler>()
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler)
    },
  } as unknown as McpServer
  return { server, tools }
}

async function callTool(
  tools: Map<string, ToolHandler>, name: string, args: Record<string, unknown>,
) {
  const handler = tools.get(name)
  if (!handler) throw new Error(`Tool '${name}' not registered`)
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
  expect(result.devices.length, HIL_IP ? `No mixer — is ${HIL_IP} reachable?` : 'No mixer via UDP').toBeGreaterThan(0)
  identity = result.devices[0]!
  manager = new PresonusClientManager()
  await manager.connect(identity)
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const snap = manager.getSnapshot(identity.deviceId)
    if (snap && snap.channels.length > 0) break
    await new Promise((r) => setTimeout(r, 500))
  }
}

if (HIL) {
  beforeAll(connectOnce, 30_000)
  afterAll(async () => {
    await manager?.disconnect(identity?.deviceId).catch(() => {})
  }, 10_000)
}

// ─── REQ-F-PROBE-001: start_routing_probe on real hardware ────────────────────

describe.skipIf(!HIL)('probe-session HIL — start_routing_probe (REQ-F-PROBE-001)', () => {
  /**
   * Verifies: REQ-F-PROBE-001 (#68) — probe baseline capture on real hardware
   * Traces to: EPIC-PROBE-HIL (#68)
   */

  it('start_routing_probe returns a UUID probeId on real state', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId,
      kind: 'input-source',
    })
    expect(result.isError).toBeFalsy()
    const data = body(result)
    expect(data.probeId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('start_routing_probe echoes kind and returns ISO capturedAt', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId,
      kind: 'output-patch',
    })
    const data = body(result)
    expect(data.kind).toBe('output-patch')
    expect(typeof data.capturedAt).toBe('string')
    expect(() => new Date(data.capturedAt as string)).not.toThrow()
    expect(new Date(data.capturedAt as string).getFullYear()).toBeGreaterThanOrEqual(2026)
  })

  it('start_routing_probe returns non-empty instruction string', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId,
      kind: 'avb-stream',
    })
    const data = body(result)
    expect(typeof data.instruction).toBe('string')
    expect((data.instruction as string).length).toBeGreaterThan(20)
    // Instruction must mention the kind to guide the operator
    expect((data.instruction as string).toLowerCase()).toContain('avb')
  })

  it('accepts all 4 valid MCP probe kinds on real hardware', async () => {
    const kinds = ['input-source', 'avb-stream', 'output-patch', 'stagebox'] as const
    for (const kind of kinds) {
      const { server, tools } = makeMockServer()
      registerTools(server, manager, { writeEnabled: false })
      const result = await callTool(tools, 'start_routing_probe', { deviceId: identity.deviceId, kind })
      expect(result.isError, `kind "${kind}" returned isError`).toBeFalsy()
      expect(body(result).kind).toBe(kind)
    }
  })
})

// ─── REQ-F-PROBE-002: complete_routing_probe on stable real state ─────────────

describe.skipIf(!HIL)('probe-session HIL — complete_routing_probe stable state (REQ-F-PROBE-002)', () => {
  /**
   * Verifies: REQ-F-PROBE-002 (#46) — probe diff on real hardware
   *
   * Strategy: start probe, wait 200ms (no manual changes), complete probe.
   * Real mixer state is stable during this window → changedKeys = []
   * This confirms the diff algorithm correctly reads real flatState.
   */

  it('complete_routing_probe returns changedKeys=[] on stable mixer state', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId, kind: 'input-source',
    })
    const { probeId } = body(startResult) as { probeId: string }

    // Wait briefly — no routing changes made in UC Surface
    await new Promise((r) => setTimeout(r, 200))

    const completeResult = await callTool(tools, 'complete_routing_probe', {
      deviceId: identity.deviceId, probeId,
    })
    expect(completeResult.isError).toBeFalsy()
    const data = body(completeResult)
    const changedKeys = data.changedKeys as Array<{ key: string }>
    expect(Array.isArray(changedKeys)).toBe(true)
    expect(changedKeys).toHaveLength(0)
  })

  it('complete_routing_probe echoes probeId and kind back', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId, kind: 'stagebox',
    })
    const { probeId } = body(startResult) as { probeId: string }

    const completeResult = await callTool(tools, 'complete_routing_probe', {
      deviceId: identity.deviceId, probeId,
    })
    const data = body(completeResult)
    expect(data.probeId).toBe(probeId)
    expect(data.kind).toBe('stagebox')
  })

  it('complete_routing_probe returns completedAt ISO timestamp', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId, kind: 'output-patch',
    })
    const { probeId } = body(startResult) as { probeId: string }

    const completeResult = await callTool(tools, 'complete_routing_probe', {
      deviceId: identity.deviceId, probeId,
    })
    const data = body(completeResult)
    expect(typeof data.completedAt).toBe('string')
    expect(() => new Date(data.completedAt as string)).not.toThrow()
  })

  it('complete_routing_probe returns summary string', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId, kind: 'input-source',
    })
    const { probeId } = body(startResult) as { probeId: string }

    const completeResult = await callTool(tools, 'complete_routing_probe', {
      deviceId: identity.deviceId, probeId,
    })
    const data = body(completeResult)
    expect(typeof data.summary).toBe('string')
    expect(data.summary).toContain('0')  // "Found 0 changed key(s)"
  })
})

// ─── Probe session error cases on real hardware ────────────────────────────────

describe.skipIf(!HIL)('probe-session HIL — error handling', () => {
  it('complete_routing_probe with unknown probeId returns isError:true', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const result = await callTool(tools, 'complete_routing_probe', {
      deviceId: identity.deviceId,
      probeId: '00000000-0000-0000-0000-000000000000',
    })
    expect(result.isError).toBe(true)
    expect(String(body(result).error)).toMatch(/not found|expired/i)
  })

  it('complete_routing_probe is one-shot: calling twice with same probeId → second call fails', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId, kind: 'input-source',
    })
    const { probeId } = body(startResult) as { probeId: string }

    // First complete → success
    const first = await callTool(tools, 'complete_routing_probe', { deviceId: identity.deviceId, probeId })
    expect(first.isError).toBeFalsy()

    // Second complete with same probeId → session consumed → error
    const second = await callTool(tools, 'complete_routing_probe', { deviceId: identity.deviceId, probeId })
    expect(second.isError).toBe(true)
    expect(String(body(second).error)).toMatch(/not found|expired/i)
  })
})
