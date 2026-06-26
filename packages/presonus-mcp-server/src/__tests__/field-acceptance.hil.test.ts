/**
 * Field acceptance test — v1.0 "Field-testable sound engineer backend"
 *
 * This is the MASTER acceptance test for the entire v0.1–v1.0 delivery.
 * It exercises every major feature area against real StudioLive 32SC hardware
 * in a single test run, proving the server is field-ready.
 *
 * Pass criteria for v1.0 milestone closure:
 *   - All groups pass on real StudioLive III hardware
 *   - No test depends on a specific show/scene/channel name
 *   - All tests are structural (shape) assertions only
 *
 * Coverage mapping:
 *   Group 1 — v0.1: Core read-only MCP surface  (REQ-F-001..005, REQ-NF-002..004)
 *   Group 2 — v0.2: Soundcheck diagnostics        (REQ-F-DIAG-001..004)
 *   Group 3 — v0.3: AUX/monitor routing            (REQ-F-AUX-001..005, REQ-F-ROUT-010)
 *   Group 4 — v0.4: Routing confidence model       (QA-SC-ROUT-001, ADR-008)
 *   Group 5 — v0.5: Probe session lifecycle        (REQ-F-PROBE-001..002)
 *   Group 6 — v1.0: Field-readiness invariants     (REQ-NF-002, REQ-NF-004)
 *
 * Run: pnpm test:hil   (HIL_PRESONUS=1 HIL_PRESONUS_IP=<ip> HIL_PRESONUS_SERIAL=<serial>)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  discoverMixers, PresonusClientManager,
  diagnoseChannel, analyzeLineCheckStep,
  extractAuxMixes, extractOutputPatchRouter, extractChannelSendRouting,
} from '@presonus-mcp/adapter'
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

// ─── Minimal MCP mock server (same pattern as routing-probe.test.ts) ──────────

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>, isError?: boolean
}>

function makeMockServer() {
  const tools = new Map<string, ToolHandler>()
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => tools.set(name, handler),
  } as unknown as McpServer
  return { server, tools }
}

async function callTool(tools: Map<string, ToolHandler>, name: string, args: Record<string, unknown>) {
  const handler = tools.get(name)
  if (!handler) throw new Error(`Tool '${name}' not registered`)
  return handler(args)
}

function body(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>
}

// ─── Shared connection (all groups reuse one connection) ──────────────────────

let manager: PresonusClientManager
let identity: MixerIdentity

async function connectOnce(): Promise<void> {
  if (manager && identity && manager.getConnectedDeviceIds().includes(identity.deviceId)) return
  const result = await discoverMixers(discoveryConfig())
  expect(
    result.devices.length,
    HIL_IP ? `No mixer at ${HIL_IP}:53000` : 'No mixer via UDP — set HIL_PRESONUS_IP',
  ).toBeGreaterThan(0)
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

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — v0.1: Core read-only MCP surface
// REQ-F-001 (#15) discovery, REQ-F-002 (#16) serial, REQ-F-003 (#17) channels,
// REQ-F-004 (#18) meters, REQ-F-005 (#19) scene, REQ-NF-002 (#22) zero writes,
// REQ-NF-003 (#23) freshness, REQ-NF-004 (#24) startup timing
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HIL)('field-acceptance v0.1 — core read-only MCP surface', () => {
  it('discovery returns at least one mixer (REQ-F-001 #15)', () => {
    expect(manager.getConnectedDeviceIds().length).toBeGreaterThan(0)
  })

  it('deviceId uses serial: prefix — stable identity (REQ-F-002 #16)', () => {
    expect(identity.deviceId).toMatch(/^serial:/)
  })

  it('serial matches environment variable (REQ-F-002 #16)', () => {
    if (HIL_SN) expect(identity.serial).toBe(HIL_SN)
    else expect(identity.serial).toBeTruthy()
  })

  it('snapshot has at least 32 channels (StudioLive 32SC — REQ-F-003 #17)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.channels.length).toBeGreaterThanOrEqual(32)
  })

  it('all channel IDs match line.chN pattern (REQ-F-003 #17)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    for (const ch of snap.channels) {
      expect(ch.id).toMatch(/^line\.ch\d+$/)
    }
  })

  it('snapshot.capturedAt is a valid ISO 8601 timestamp (REQ-NF-003 #23)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(() => new Date(snap.capturedAt)).not.toThrow()
    expect(new Date(snap.capturedAt).getFullYear()).toBeGreaterThanOrEqual(2026)
  })

  it('snapshot.isStale is false immediately after connect (REQ-NF-004 #24)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.isStale).toBe(false)
  })

  it('getSummarizer returns non-null — meter subscription active (REQ-F-004 #18)', () => {
    const summarizer = manager.getSummarizer(identity.deviceId)
    expect(summarizer).toBeDefined()
    expect(typeof summarizer?.getSummary).toBe('function')
  })

  it('snapshot has currentProject and currentScene fields (REQ-F-005 #19)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    // Fields exist (may be null/undefined if no show loaded — that is valid)
    expect('currentProject' in snap).toBe(true)
    expect('currentScene' in snap).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — v0.2: Soundcheck diagnostics
// REQ-F-DIAG-001 (#78) diagnose_channel, REQ-F-DIAG-002 (#74) analyze_line_check,
// REQ-F-DIAG-003 (#76) check_required_setup, REQ-F-DIAG-004 (#79) get_capabilities
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HIL)('field-acceptance v0.2 — soundcheck diagnostics', () => {
  it('getCapabilities returns lineInputs === 32 for StudioLive 32SC (REQ-F-DIAG-004 #79)', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    expect(caps.lineInputs).toBe(32)
    expect(caps.fatChannel).toBe(true)
    expect(caps.auxMixes).toBeGreaterThanOrEqual(16)
  })

  it('diagnoseChannel(snap, 1) returns valid DiagnoseChannelResult (REQ-F-DIAG-001 #78)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const result = diagnoseChannel(snap, 1, null, undefined)
    expect(['ok', 'warning', 'problem']).toContain(result.status)
    expect(result.channel).toBe(1)
    const checkNames = result.checks.map((c) => c.check)
    expect(checkNames).toContain('mute')
    expect(checkNames).toContain('fader')
  })

  it('analyzeLineCheckStep returns valid structure (REQ-F-DIAG-002 #74)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const meter = manager.getSummarizer(identity.deviceId)?.getSummary(5_000) ?? {
      activeChannels: [], silentChannels: [], hotChannels: [], clippingChannels: [], noSignalButExpected: [],
    }
    const result = analyzeLineCheckStep(snap, [{ channel: 1, name: 'CH1' }], [], meter)
    expect(result).toBeDefined()
    expect(Array.isArray(result.expectedActive)).toBe(true)
    expect(Array.isArray(result.unexpectedActive)).toBe(true)
    expect(Array.isArray(result.suspicions)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — v0.3: AUX/monitor routing
// REQ-F-AUX-001 (#55) mix extraction, REQ-F-AUX-002..004 audit,
// REQ-F-ROUT-010 (#54) non-LINE channels
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HIL)('field-acceptance v0.3 — AUX/monitor routing', () => {
  it('extractAuxMixes returns at least 8 buses (32SC has 16) (REQ-F-AUX-001 #55)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    expect(mixes.length).toBeGreaterThanOrEqual(8)
  })

  it('all masterLevel values are in 0–1 range (v0.3 fix: was clipping to 1.0)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    for (const mix of mixes) {
      expect(mix.masterLevel, `AUX ${mix.auxMixNumber} masterLevel ${mix.masterLevel} out of range`).toBeLessThanOrEqual(1.0)
      expect(mix.masterLevel).toBeGreaterThanOrEqual(0)
    }
  })

  it('all AUX send levels are in 0–1 range (send levels are NOT 0-100 scale)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const mixes = extractAuxMixes(snap.flatState)
    for (const mix of mixes) {
      for (const send of mix.sends) {
        expect(send.level).toBeGreaterThanOrEqual(0)
        expect(send.level).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — v0.4: Routing confidence model
// QA-SC-ROUT-001 (#49): unverified routes NEVER misrepresented
// ADR-008 (#47): Layer A 'inferred', Layer B 'not_verifiable'
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HIL)('field-acceptance v0.4 — routing confidence model', () => {
  it('extractOutputPatchRouter returns non-null on real hardware (REQ-F-ROUT-007 #37)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)
    expect(patchRouter, 'No outputpatchrouter.* keys in real state').toBeDefined()
  })

  it('QA-SC-ROUT-001: output patch confidence is always not_verifiable (#49)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    expect(patchRouter.globalConfidence).toBe('not_verifiable_with_current_adapter')
    for (const o of patchRouter.analogOutputs) {
      expect(o.confidence).toBe('not_verifiable_with_current_adapter')
      expect(o.sourceName).toBeNull()
    }
  })

  it('QA-SC-ROUT-001: channel send parameterConfidence is "inferred" — never "observed" (#49)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const routing = extractChannelSendRouting(snap.flatState, 'line.ch1')
    expect(routing, 'No routing keys for line.ch1').toBeDefined()
    expect(routing!.parameterConfidence).toBe('inferred')
    expect(routing!.parameterConfidence).not.toBe('observed')
    expect(routing!.parameterConfidence).not.toBe('not_verifiable_with_current_adapter')
  })

  it('output patch sourceIndex formula is integer-valued on real hardware', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    const patchRouter = extractOutputPatchRouter(snap.flatState, identity.deviceId)!
    for (const o of patchRouter.analogOutputs) {
      expect(Number.isInteger(o.sourceIndex)).toBe(true)
      expect(o.sourceIndex).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — v0.5: Probe session lifecycle
// REQ-F-PROBE-001 (#68) start_routing_probe, REQ-F-PROBE-002 (#46) complete_routing_probe
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HIL)('field-acceptance v0.5 — probe session lifecycle', () => {
  it('start_routing_probe returns UUID and instruction on real state (REQ-F-PROBE-001)', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const result = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId, kind: 'input-source',
    })
    expect(result.isError).toBeFalsy()
    const data = body(result)
    expect(data.probeId).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof data.instruction).toBe('string')
    expect((data.instruction as string).length).toBeGreaterThan(10)
  })

  it('complete_routing_probe on stable state returns changedKeys=[] (REQ-F-PROBE-002)', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const startResult = await callTool(tools, 'start_routing_probe', {
      deviceId: identity.deviceId, kind: 'output-patch',
    })
    const { probeId } = body(startResult) as { probeId: string }

    await new Promise((r) => setTimeout(r, 200))

    const completeResult = await callTool(tools, 'complete_routing_probe', {
      deviceId: identity.deviceId, probeId,
    })
    expect(completeResult.isError).toBeFalsy()
    const data = body(completeResult)
    expect(data.changedKeys).toHaveLength(0)
    expect(data.probeId).toBe(probeId)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 6 — v1.0: Field-readiness invariants
// REQ-NF-002 (#22) zero write tools by default, safety gate enforced
// REQ-NF-004 (#24) server operational with real hardware
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!HIL)('field-acceptance v1.0 — field-readiness invariants', () => {
  it('applyChange() rejects when writeEnabled=false (REQ-NF-002 #22 safety gate)', async () => {
    await expect(
      manager.applyChange(identity.deviceId, 'line.ch1.volume', 0.5),
    ).rejects.toThrow()
  })

  it('all 33 read-only tools registered — no write tools by default (REQ-NF-002 #22)', () => {
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })
    expect(tools.size).toBe(33)
    expect(tools.has('propose_eq_change')).toBe(false)
    expect(tools.has('apply_change_set')).toBe(false)
  })

  it('getConnectedDeviceIds() includes the real mixer deviceId (REQ-NF-004 #24)', () => {
    expect(manager.getConnectedDeviceIds()).toContain(identity.deviceId)
  })

  it('snapshot flatState has >1000 keys — real full state received (REQ-NF-003 #23)', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(Object.keys(snap.flatState).length).toBeGreaterThan(1000)
  })

  it('identity.name = "StudioLive 32SC" — correct model recognized from state', () => {
    const snap = manager.getSnapshot(identity.deviceId)!
    expect(snap.identity.name).toBe('StudioLive 32SC')
  })

  it('getCapabilities returns full model-table entry — not the zero fallback', () => {
    const caps = manager.getCapabilities(identity.deviceId)
    // All these must be > 0 — confirms model lookup works (fixed in v0.4)
    expect(caps.lineInputs).toBeGreaterThan(0)
    expect(caps.auxMixes).toBeGreaterThan(0)
    expect(caps.fxBuses).toBeGreaterThan(0)
  })
})
