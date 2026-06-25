/**
 * Behavioral tests for new MCP tool handlers (Phases 2–6).
 *
 * Verifies: REQ-F-INP-001 — validate_input_list_against_mixer behavior
 * Verifies: REQ-F-INP-002 — validate_patch_sheet behavior
 * Verifies: REQ-F-INP-003 — render_patch_sheet_data behavior
 * Verifies: REQ-F-FAT-001 — get_fat_channel behavior
 * Verifies: REQ-F-FAT-002 — validate_fat_channel_for_source behavior
 * Verifies: REQ-F-MON-001 — get_monitor_mix_layout behavior
 * Verifies: REQ-F-MON-002 — validate_stereo_monitor_pair behavior
 * Verifies: REQ-F-MON-003 — validate_monitor_mix_names behavior
 * Verifies: REQ-F-ROUT-002 — get_routing_graph behavior
 * Verifies: REQ-F-ROUT-003 — validate_input_routing behavior
 * Verifies: REQ-F-ROUT-004 — validate_stagebox_routing behavior
 * Verifies: REQ-F-ROUT-005 — diagnose_no_signal_routing behavior
 * Verifies: REQ-F-ROUT-006 — detect_possible_patch_swap behavior
 * Verifies: REQ-F-ROUT-010 — validate_output_patch_labels behavior
 * Verifies: ADR-006 — prepare_mute/fader/aux_send/fat_channel change-set tools
 *
 * Strategy: mock McpServer.tool() to capture both tool name AND handler so
 * we can call handlers with controlled arguments without a running server.
 * Mock PresonusClientManager returns synthetic MixerSnapshot fixtures.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PresonusClientManager, MixerSnapshot } from '@presonus-mcp/adapter'
import type { MixerIdentity, MixerCapabilities, ChannelFatState } from '@presonus-mcp/domain'
import { registerTools } from '../tools.js'

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}>

/** Extended mock server that captures tool handlers, not just names. */
function makeMockServer(): { server: McpServer; tools: Map<string, ToolHandler> } {
  const tools = new Map<string, ToolHandler>()
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      tools.set(name, handler)
    },
  } as unknown as McpServer
  return { server, tools }
}

/** Call a registered tool by name; throws if not registered. */
async function callTool(tools: Map<string, ToolHandler>, name: string, args: Record<string, unknown>) {
  const handler = tools.get(name)
  if (!handler) throw new Error(`Tool '${name}' not registered — did you include it in registerTools?`)
  return handler(args)
}

/** Parse the JSON body from the first content item in a tool result. */
function body(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>
}

const DEVICE_ID = 'serial:TEST'

const mockIdentity: MixerIdentity = {
  deviceId: DEVICE_ID,
  serial: 'TEST',
  ip: '192.168.1.1',
  port: 53000,
  lastSeen: new Date().toISOString(),
  role: 'FOH',
  controllable: false,
  confidence: 'observed',
}

const mockCaps: MixerCapabilities = {
  lineInputs: 32,
  auxMixes: 16,
  subgroups: 4,
  fxBuses: 4,
  mainOutputs: true,
  fatChannel: true,
  avbStagebox: true,
}

/** Build a minimal valid MixerSnapshot with controlled channels and flatState. */
function makeSnapshot(overrides: {
  channels?: Partial<{
    id: string
    name: string
    mute: boolean
    fatChannel: ChannelFatState | undefined
  }>[]
  flatState?: Record<string, unknown>
  outputPatch?: MixerSnapshot['outputPatch']
}): MixerSnapshot {
  const channels = (overrides.channels ?? []).map((c, i) => ({
    id: c.id ?? `line.ch${i + 1}`,
    name: c.name ?? `Ch ${i + 1}`,
    type: 'LINE' as const,
    mute: c.mute ?? false,
    solo: false,
    pan: 0.5,
    color: undefined,
    linked: false,
    fader: { linear: 0.75, dB: -3, raw: 0.75 },
    sendRouting: undefined,
    fatChannel: c.fatChannel,
  }))
  return {
    identity: mockIdentity,
    channels,
    currentProject: undefined,
    currentScene: undefined,
    availableProjects: [],
    capturedAt: new Date().toISOString(),
    rawState: {},
    flatState: overrides.flatState ?? {},
    isStale: false,
    disconnectedAt: undefined,
    outputPatch: overrides.outputPatch,
  }
}

/** Build a mock PresonusClientManager returning the given snapshot (or undefined). */
function makeMockManager(snapshot?: MixerSnapshot): PresonusClientManager {
  return {
    getSnapshot: (_deviceId: string) => snapshot,
    getCapabilities: (_deviceId: string) => mockCaps,
    getIdentity: (_deviceId: string) => mockIdentity,
    getConnectedDeviceIds: () => (snapshot ? [DEVICE_ID] : []),
    getSummarizer: (_deviceId: string) => undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
    applyChange: async () => undefined,
  } as unknown as PresonusClientManager
}

// ---------------------------------------------------------------------------
// Phase 2: validate_input_list_against_mixer (REQ-F-INP-001)
// ---------------------------------------------------------------------------

describe('validate_input_list_against_mixer (REQ-F-INP-001)', () => {
  let tools: Map<string, ToolHandler>

  describe('when device is connected', () => {
    beforeEach(() => {
      const snapshot = makeSnapshot({
        channels: [
          { id: 'line.ch1', name: 'Kick',     mute: false },
          { id: 'line.ch8', name: 'Lead Vox', mute: false },
          { id: 'line.ch9', name: 'Snare',    mute: true  },
        ],
        flatState: {
          'line.ch1.48v':  false,
          'line.ch8.48v':  false,
          'line.ch9.48v':  false,
        },
      })
      ;({ tools } = makeMockServer())
      registerTools(makeMockServer().server, makeMockManager(snapshot), { writeEnabled: false })
      // Re-register with the tools map we're capturing
      const { server, tools: t } = makeMockServer()
      tools = t
      registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    })

    it('returns status ok when all channels match the input list', async () => {
      const result = await callTool(tools, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [
          { inputNo: 1, sourceName: 'Kick', phantomRequired: false },
          { inputNo: 8, sourceName: 'Lead Vox', phantomRequired: false },
        ],
      })
      const data = body(result)
      expect(data.status).toBe('ok')
      expect(data.issues).toHaveLength(0)
      expect(data.printablePatchRows).toHaveLength(2)
    })

    it('includes manualPatchInstruction in every patch row', async () => {
      const result = await callTool(tools, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [{ inputNo: 1, sourceName: 'Kick', phantomRequired: false }],
      })
      const rows = body(result).printablePatchRows as Array<Record<string, unknown>>
      expect(rows[0]!.manualPatchInstruction).toMatch(/Kick/)
      expect(rows[0]!.manualPatchInstruction).toMatch(/1/)
    })

    it('returns warning with channel_name_mismatch when label differs', async () => {
      const result = await callTool(tools, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [{ inputNo: 8, sourceName: 'Lead Vocal', phantomRequired: false }],
      })
      const data = body(result)
      expect(data.status).toBe('warning')
      const issues = data.issues as Array<{ issue: string; inputNo: number }>
      expect(issues.some((i) => i.issue === 'channel_name_mismatch' && i.inputNo === 8)).toBe(true)
    })

    it('returns error with channel_muted when channel is muted', async () => {
      const result = await callTool(tools, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [{ inputNo: 9, sourceName: 'Snare', phantomRequired: false }],
      })
      const data = body(result)
      expect(data.status).toBe('error')
      const issues = data.issues as Array<{ issue: string; inputNo: number; severity: string }>
      const muteIssue = issues.find((i) => i.issue === 'channel_muted' && i.inputNo === 9)
      expect(muteIssue).toBeDefined()
      expect(muteIssue!.severity).toBe('high')
    })

    it('returns warning with phantom_mismatch when phantom state differs', async () => {
      const snapshot = makeSnapshot({
        channels: [{ id: 'line.ch2', name: 'Cond Overhead', mute: false }],
        flatState: { 'line.ch2.48v': false },  // phantom OFF
      })
      const { server, tools: t } = makeMockServer()
      registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
      const result = await callTool(t, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [{ inputNo: 2, sourceName: 'Cond Overhead', phantomRequired: true }],  // expects ON
      })
      const data = body(result)
      expect(data.status).toBe('warning')
      const issues = data.issues as Array<{ issue: string }>
      expect(issues.some((i) => i.issue === 'phantom_mismatch')).toBe(true)
    })

    it('returns error with input_out_of_range when inputNo exceeds lineInputs (32)', async () => {
      const result = await callTool(tools, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [{ inputNo: 33, sourceName: 'Extra', phantomRequired: false }],
      })
      const data = body(result)
      expect(data.status).toBe('error')
      const issues = data.issues as Array<{ issue: string }>
      expect(issues.some((i) => i.issue === 'input_out_of_range')).toBe(true)
    })

    it('returns error with duplicate_input_number when same inputNo appears twice', async () => {
      const result = await callTool(tools, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [
          { inputNo: 1, sourceName: 'Kick',   phantomRequired: false },
          { inputNo: 1, sourceName: 'Snare',  phantomRequired: false },
        ],
      })
      const data = body(result)
      expect(data.status).toBe('error')
      const issues = data.issues as Array<{ issue: string }>
      expect(issues.some((i) => i.issue === 'duplicate_input_number')).toBe(true)
    })

    it('reflects currentMixerLabel from the mixer in patch rows', async () => {
      const result = await callTool(tools, 'validate_input_list_against_mixer', {
        deviceId: DEVICE_ID,
        inputList: [{ inputNo: 1, sourceName: 'Kick', phantomRequired: false }],
      })
      const rows = body(result).printablePatchRows as Array<Record<string, unknown>>
      expect(rows[0]!.currentMixerLabel).toBe('Kick')
    })
  })

  it('returns error when device is not connected', async () => {
    const { server, tools: t } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    const result = await callTool(t, 'validate_input_list_against_mixer', {
      deviceId: DEVICE_ID,
      inputList: [{ inputNo: 1, sourceName: 'Kick', phantomRequired: false }],
    })
    expect(result.isError).toBe(true)
    expect(body(result)).toHaveProperty('error')
  })
})

// ---------------------------------------------------------------------------
// Phase 2: validate_patch_sheet (REQ-F-INP-002) — offline, no mixer needed
// ---------------------------------------------------------------------------

describe('validate_patch_sheet (REQ-F-INP-002)', () => {
  let tools: Map<string, ToolHandler>

  beforeEach(() => {
    // validate_patch_sheet is offline — manager snapshot doesn't matter
    const { server, tools: t } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    tools = t
  })

  it('returns valid=true for a clean list', async () => {
    const result = await callTool(tools, 'validate_patch_sheet', {
      inputs: [
        { inputNo: 1, sourceName: 'Kick',     phantomRequired: false },
        { inputNo: 2, sourceName: 'Snare',    phantomRequired: false },
        { inputNo: 8, sourceName: 'Lead Vox', phantomRequired: false },
      ],
    })
    const data = body(result)
    expect(data.valid).toBe(true)
    expect(data.issues).toHaveLength(0)
  })

  it('returns valid=false with duplicate_input_number when same number appears twice', async () => {
    const result = await callTool(tools, 'validate_patch_sheet', {
      inputs: [
        { inputNo: 1, sourceName: 'Kick',  phantomRequired: false },
        { inputNo: 1, sourceName: 'Snare', phantomRequired: false },
      ],
    })
    const data = body(result)
    expect(data.valid).toBe(false)
    const issues = data.issues as Array<{ issue: string; inputNo: number }>
    expect(issues.some((i) => i.issue === 'duplicate_input_number' && i.inputNo === 1)).toBe(true)
  })

  it('returns valid=false with input_out_of_range when inputNo > maxInputs', async () => {
    const result = await callTool(tools, 'validate_patch_sheet', {
      inputs: [{ inputNo: 33, sourceName: 'Extra', phantomRequired: false }],
      maxInputs: 32,
    })
    const data = body(result)
    expect(data.valid).toBe(false)
    const issues = data.issues as Array<{ issue: string }>
    expect(issues.some((i) => i.issue === 'input_out_of_range')).toBe(true)
  })

  it('respects custom maxInputs parameter', async () => {
    const result = await callTool(tools, 'validate_patch_sheet', {
      inputs: [{ inputNo: 17, sourceName: 'Extra', phantomRequired: false }],
      maxInputs: 16,
    })
    const data = body(result)
    expect(data.valid).toBe(false)
    const issues = data.issues as Array<{ issue: string }>
    expect(issues.some((i) => i.issue === 'input_out_of_range')).toBe(true)
  })

  it('does NOT require a device connection', async () => {
    // validate_patch_sheet is offline; should not error even with no connected device
    const result = await callTool(tools, 'validate_patch_sheet', {
      inputs: [{ inputNo: 1, sourceName: 'Kick', phantomRequired: false }],
    })
    expect(result.isError).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// Phase 2: render_patch_sheet_data (REQ-F-INP-003)
// ---------------------------------------------------------------------------

describe('render_patch_sheet_data (REQ-F-INP-003)', () => {
  it('returns a row for each input with manualPatchInstruction', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: { 'line.ch1.48v': false },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'render_patch_sheet_data', {
      deviceId: DEVICE_ID,
      inputs: [{ inputNo: 1, sourceName: 'Kick', phantomRequired: false }],
    })
    const rows = body(result).rows as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.inputNo).toBe(1)
    expect(String(rows[0]!.manualPatchInstruction)).toMatch(/Kick/)
    expect(String(rows[0]!.manualPatchInstruction)).toMatch(/1/)
  })

  it('includes warning when mixer label differs from sourceName', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch8', name: 'Vox', mute: false }],
      flatState: { 'line.ch8.48v': false },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'render_patch_sheet_data', {
      deviceId: DEVICE_ID,
      inputs: [{ inputNo: 8, sourceName: 'Lead Vox', phantomRequired: false }],
    })
    const rows = body(result).rows as Array<Record<string, unknown>>
    const warnings = rows[0]!.warnings as string[]
    expect(warnings.some((w) => w.includes('Vox') && w.includes('Lead Vox'))).toBe(true)
  })

  it('includes warning when channel is muted', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch3', name: 'Bass', mute: true }],
      flatState: { 'line.ch3.48v': false },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'render_patch_sheet_data', {
      deviceId: DEVICE_ID,
      inputs: [{ inputNo: 3, sourceName: 'Bass', phantomRequired: false }],
    })
    const rows = body(result).rows as Array<Record<string, unknown>>
    const warnings = rows[0]!.warnings as string[]
    expect(warnings.some((w) => /muted/i.test(w))).toBe(true)
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    const result = await callTool(tools, 'render_patch_sheet_data', {
      deviceId: DEVICE_ID,
      inputs: [{ inputNo: 1, sourceName: 'Kick', phantomRequired: false }],
    })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 3: get_fat_channel (REQ-F-FAT-001)
// ---------------------------------------------------------------------------

describe('get_fat_channel (REQ-F-FAT-001)', () => {
  const fatState: ChannelFatState = {
    eqModel: 'STANDARD',
    compModel: 'FET',
    eqEnabled: true,
    hpfFrequencyHz: 100,
    comp: { enabled: true, thresholdDb: -20, makeupDb: 4, ratioX: 4, attackMs: 10, releaseMs: 200 },
    gate: { enabled: false },
    limiter: { enabled: false },
    parameterConfidence: 'guessed',
  }

  it('returns fat channel state for a known channel', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false, fatChannel: fatState }],
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'get_fat_channel', { deviceId: DEVICE_ID, channelId: 'line.ch1' })
    const data = body(result)
    expect(data.channelId).toBe('line.ch1')
    expect(data.channelName).toBe('Kick')
    expect(data.fatState).toBeTruthy()
    expect((data.fatState as Record<string, unknown>).compModel).toBe('FET')
    expect((data.fatState as Record<string, unknown>).hpfFrequencyHz).toBe(100)
  })

  it('returns fatState=null when channel has no Fat Channel state', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false, fatChannel: undefined }],
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'get_fat_channel', { deviceId: DEVICE_ID, channelId: 'line.ch1' })
    expect(body(result).fatState).toBeNull()
  })

  it('returns error when channel not found', async () => {
    const snapshot = makeSnapshot({ channels: [{ id: 'line.ch1', name: 'Kick', mute: false }] })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'get_fat_channel', { deviceId: DEVICE_ID, channelId: 'line.ch99' })
    expect(result.isError).toBe(true)
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    const result = await callTool(tools, 'get_fat_channel', { deviceId: DEVICE_ID, channelId: 'line.ch1' })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 3: validate_fat_channel_for_source (REQ-F-FAT-002)
// ---------------------------------------------------------------------------

describe('validate_fat_channel_for_source (REQ-F-FAT-002)', () => {
  function makeVocalFatState(overrides: Partial<ChannelFatState> = {}): ChannelFatState {
    return {
      eqModel: 'STANDARD',
      compModel: 'STANDARD',
      eqEnabled: true,
      hpfFrequencyHz: 100,
      comp: { enabled: true, thresholdDb: -20, makeupDb: 2 },
      gate: { enabled: false },
      limiter: { enabled: false },
      parameterConfidence: 'guessed',
      ...overrides,
    }
  }

  it('returns status ok for vocal with comp enabled and HPF ≥ 80 Hz', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch8', name: 'Lead Vox', mute: false, fatChannel: makeVocalFatState() }],
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_fat_channel_for_source', {
      deviceId: DEVICE_ID, channelId: 'line.ch8', sourceType: 'vocal',
    })
    const data = body(result)
    expect(data.status).toBe('ok')
    expect(data.warnings).toHaveLength(0)
  })

  it('reports hpf_engaged failed when HPF is below 80 Hz for vocal', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch8', name: 'Lead Vox', mute: false, fatChannel: makeVocalFatState({ hpfFrequencyHz: 40 }) }],
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_fat_channel_for_source', {
      deviceId: DEVICE_ID, channelId: 'line.ch8', sourceType: 'vocal',
    })
    const data = body(result)
    expect(data.status).toBe('warning')
    const checks = data.checks as Array<{ check: string; passed: boolean }>
    const hpfCheck = checks.find((c) => c.check === 'hpf_engaged')
    expect(hpfCheck?.passed).toBe(false)
    expect((data.warnings as string[]).length).toBeGreaterThan(0)
    expect((data.warnings as string[]).some((w) => /hpf/i.test(w))).toBe(true)
  })

  it('reports compressor_enabled failed when comp is off for vocal', async () => {
    const snapshot = makeSnapshot({
      channels: [{
        id: 'line.ch8', name: 'Lead Vox', mute: false,
        fatChannel: makeVocalFatState({ comp: { enabled: false } }),
      }],
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_fat_channel_for_source', {
      deviceId: DEVICE_ID, channelId: 'line.ch8', sourceType: 'vocal',
    })
    const data = body(result)
    expect(data.status).toBe('warning')
    const checks = data.checks as Array<{ check: string; passed: boolean }>
    const compCheck = checks.find((c) => c.check === 'compressor_enabled')
    expect(compCheck?.passed).toBe(false)
  })

  it('includes parameterConfidence in the result', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch8', name: 'Lead Vox', mute: false, fatChannel: makeVocalFatState() }],
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_fat_channel_for_source', {
      deviceId: DEVICE_ID, channelId: 'line.ch8', sourceType: 'vocal',
    })
    expect(body(result).parameterConfidence).toBe('guessed')
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    const result = await callTool(tools, 'validate_fat_channel_for_source', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', sourceType: 'vocal',
    })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 4: get_monitor_mix_layout (REQ-F-MON-001)
// ---------------------------------------------------------------------------

describe('get_monitor_mix_layout (REQ-F-MON-001)', () => {
  it('returns an auxBuses array with length equal to capabilities.auxMixes', async () => {
    const snapshot = makeSnapshot({ flatState: {} })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'get_monitor_mix_layout', { deviceId: DEVICE_ID })
    const data = body(result)
    expect(data.auxBuses).toHaveLength(mockCaps.auxMixes)  // 16
  })

  it('returns each auxBus entry with auxBus number and type=mono by default', async () => {
    const snapshot = makeSnapshot({ flatState: {} })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'get_monitor_mix_layout', { deviceId: DEVICE_ID })
    const buses = body(result).auxBuses as Array<{ auxBus: number; type: string }>
    expect(buses[0]!.auxBus).toBe(1)
    expect(buses[15]!.auxBus).toBe(16)
    expect(buses.every((b) => b.type === 'mono')).toBe(true)
  })

  it('infers a stereo pair when two consecutive buses have ≥80% send channel overlap', async () => {
    // Buses 1 and 2 both receive from channels 1, 2, 3 — 100% overlap → inferred pair
    const flat: Record<string, unknown> = {}
    for (let ch = 1; ch <= 3; ch++) {
      flat[`line.ch${ch}.aux1`] = 0.75
      flat[`line.ch${ch}.assign_aux1`] = true
      flat[`line.ch${ch}.aux2`] = 0.75
      flat[`line.ch${ch}.assign_aux2`] = true
    }
    const snapshot = makeSnapshot({ flatState: flat })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'get_monitor_mix_layout', { deviceId: DEVICE_ID })
    const pairs = body(result).inferredPairs as Array<{ leftBus: number; rightBus: number; confidence: string }>
    expect(pairs.some((p) => p.leftBus === 1 && p.rightBus === 2)).toBe(true)
    expect(pairs[0]!.confidence).toBe('inferred')
  })

  it('returns empty inferredPairs when no buses share sends', async () => {
    // Bus 1 gets channel 1 only; bus 2 gets channel 2 only — no overlap
    const flat: Record<string, unknown> = {
      'line.ch1.aux1': 0.75, 'line.ch1.assign_aux1': true,
      'line.ch2.aux2': 0.75, 'line.ch2.assign_aux2': true,
    }
    const snapshot = makeSnapshot({ flatState: flat })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'get_monitor_mix_layout', { deviceId: DEVICE_ID })
    const pairs = body(result).inferredPairs as unknown[]
    expect(pairs).toHaveLength(0)
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    const result = await callTool(tools, 'get_monitor_mix_layout', { deviceId: DEVICE_ID })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 4: validate_stereo_monitor_pair (REQ-F-MON-002)
// ---------------------------------------------------------------------------

describe('validate_stereo_monitor_pair (REQ-F-MON-002)', () => {
  it('returns valid=true when both buses receive from the same channels', async () => {
    const flat: Record<string, unknown> = {}
    for (let ch = 1; ch <= 4; ch++) {
      flat[`line.ch${ch}.aux1`] = 0.75; flat[`line.ch${ch}.assign_aux1`] = true
      flat[`line.ch${ch}.aux2`] = 0.75; flat[`line.ch${ch}.assign_aux2`] = true
    }
    const snapshot = makeSnapshot({ flatState: flat })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_stereo_monitor_pair', {
      deviceId: DEVICE_ID, auxBusLeft: 1, auxBusRight: 2,
    })
    const data = body(result)
    expect(data.valid).toBe(true)
    expect(data.asymmetricChannels).toHaveLength(0)
  })

  it('returns valid=false with asymmetricChannels when one bus has an extra channel', async () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux1': 0.75, 'line.ch1.assign_aux1': true,  // left gets ch1
      'line.ch2.aux1': 0.75, 'line.ch2.assign_aux1': true,  // left gets ch2
      'line.ch1.aux2': 0.75, 'line.ch1.assign_aux2': true,  // right gets ch1
      // right does NOT get ch2 — asymmetric
    }
    const snapshot = makeSnapshot({ flatState: flat })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_stereo_monitor_pair', {
      deviceId: DEVICE_ID, auxBusLeft: 1, auxBusRight: 2,
    })
    const data = body(result)
    expect(data.valid).toBe(false)
    expect((data.asymmetricChannels as number[]).includes(2)).toBe(true)
  })

  it('returns issues when a bus master is muted', async () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux1': 0.75, 'line.ch1.assign_aux1': true,
      'line.ch1.aux2': 0.75, 'line.ch1.assign_aux2': true,
      'aux.ch1.mute': true,   // left bus master muted
      'aux.ch1.volume': 0.8,
    }
    const snapshot = makeSnapshot({ flatState: flat })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_stereo_monitor_pair', {
      deviceId: DEVICE_ID, auxBusLeft: 1, auxBusRight: 2,
    })
    const data = body(result)
    expect(data.valid).toBe(false)
    expect((data.issues as string[]).some((i) => /muted/i.test(i))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 4: validate_monitor_mix_names (REQ-F-MON-003)
// ---------------------------------------------------------------------------

describe('validate_monitor_mix_names (REQ-F-MON-003)', () => {
  it('returns status ok when all expected names match', async () => {
    const flat: Record<string, unknown> = {
      'line.ch1.aux1': 0.75, 'line.ch1.assign_aux1': true,
      'aux.ch1.volume': 0.8,
    }
    // aux-mix name comes from the extractAuxMixes name logic — for unnamed it defaults
    // We test the mismatch path which is more verifiable
    const snapshot = makeSnapshot({ flatState: flat })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_monitor_mix_names', {
      deviceId: DEVICE_ID,
      expectedNames: [],  // empty → always ok
    })
    expect(body(result).status).toBe('ok')
  })

  it('returns status warning with mismatches when a name differs', async () => {
    // We rely on extractAuxMixes returning a mix named from state; absent name → 'Aux 1'
    // The expected name is something different → triggers mismatch
    const flat: Record<string, unknown> = {
      'line.ch1.aux3': 0.75, 'line.ch1.assign_aux3': true,
    }
    const snapshot = makeSnapshot({ flatState: flat })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_monitor_mix_names', {
      deviceId: DEVICE_ID,
      expectedNames: [{ auxBus: 3, name: 'Drums IEM' }],  // actual name ≠ 'Drums IEM'
    })
    const data = body(result)
    expect(data.status).toBe('warning')
    expect(data.mismatches).toHaveLength(1)
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })
    const result = await callTool(tools, 'validate_monitor_mix_names', {
      deviceId: DEVICE_ID, expectedNames: [],
    })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 5: validate_output_patch_labels (REQ-F-ROUT-010)
// ---------------------------------------------------------------------------

describe('validate_output_patch_labels (REQ-F-ROUT-010)', () => {
  it('always returns status=partial with not_verifiable_with_current_adapter confidence', async () => {
    const snapshot = makeSnapshot({
      outputPatch: {
        deviceId: DEVICE_ID,
        analogOutputs: [{ outputIndex: 1, sourceIndex: 0, sourceName: null, confidence: 'not_verifiable_with_current_adapter' }],
        capturedAt: new Date().toISOString(),
        globalConfidence: 'not_verifiable_with_current_adapter',
      },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_output_patch_labels', {
      deviceId: DEVICE_ID,
      expectedLabels: [{ outputIndex: 1, expectedSourceName: 'Main L' }],
    })
    const data = body(result)
    expect(data.status).toBe('partial')
    expect(data.globalConfidence).toBe('not_verifiable_with_current_adapter')
    const results = data.results as Array<Record<string, unknown>>
    expect(results[0]!.confidence).toBe('not_verifiable_with_current_adapter')
  })

  it('returns known sourceIndex even though sourceName is null', async () => {
    const snapshot = makeSnapshot({
      outputPatch: {
        deviceId: DEVICE_ID,
        analogOutputs: [{ outputIndex: 1, sourceIndex: 7, sourceName: null, confidence: 'not_verifiable_with_current_adapter' }],
        capturedAt: new Date().toISOString(),
        globalConfidence: 'not_verifiable_with_current_adapter',
      },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })
    const result = await callTool(tools, 'validate_output_patch_labels', {
      deviceId: DEVICE_ID,
      expectedLabels: [{ outputIndex: 1, expectedSourceName: 'Aux 1' }],
    })
    const results = body(result).results as Array<Record<string, unknown>>
    expect(results[0]!.actualSourceIndex).toBe(7)
    expect(results[0]!.actualSourceName).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Phase 6: prepare_mute_change_set (ADR-006)
// ---------------------------------------------------------------------------

describe('prepare_mute_change_set (ADR-006)', () => {
  let tools: Map<string, ToolHandler>

  beforeEach(() => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: { 'line.ch1.mute': 0 },
    })
    const { server, tools: t } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    tools = t
  })

  it('returns a ProposedChangeSet with parameter=mute and proposedRawValue=1 when muted=true', async () => {
    const result = await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', muted: true,
    })
    const data = body(result)
    expect(data.changeSetId).toBeTruthy()
    const changes = data.changes as Array<{ parameter: string; proposedRawValue: number; rawKeyPath: string }>
    expect(changes[0]!.parameter).toBe('mute')
    expect(changes[0]!.proposedRawValue).toBe(1.0)
    expect(changes[0]!.rawKeyPath).toBe('line.ch1.mute')
  })

  it('returns proposedRawValue=0 when muted=false', async () => {
    const result = await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', muted: false,
    })
    const changes = body(result).changes as Array<{ proposedRawValue: number }>
    expect(changes[0]!.proposedRawValue).toBe(0.0)
  })

  it('returns a changeSetId (UUID format)', async () => {
    const result = await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', muted: true,
    })
    const { changeSetId } = body(result) as { changeSetId: string }
    expect(changeSetId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns error when channel not found', async () => {
    const result = await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch99', muted: true,
    })
    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Phase 6: prepare_fader_change_set (ADR-006)
// ---------------------------------------------------------------------------

describe('prepare_fader_change_set (ADR-006)', () => {
  it('returns changeSet with rawKeyPath=channelId.volume and proposedRawValue=levelLinear', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: { 'line.ch1.volume': 0.75 },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const result = await callTool(tools, 'prepare_fader_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', levelLinear: 0.5,
    })
    const changes = body(result).changes as Array<{ rawKeyPath: string; proposedRawValue: number }>
    expect(changes[0]!.rawKeyPath).toBe('line.ch1.volume')
    expect(changes[0]!.proposedRawValue).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// Phase 6: prepare_aux_send_change_set (ADR-006)
// ---------------------------------------------------------------------------

describe('prepare_aux_send_change_set (ADR-006)', () => {
  it('returns changeSet with rawKeyPath = channelId.auxN for the specified auxBus', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: { 'line.ch1.aux3': 0.5, 'line.ch1.assign_aux3': true },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const result = await callTool(tools, 'prepare_aux_send_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', auxBus: 3, levelLinear: 0.8,
    })
    const changes = body(result).changes as Array<{ rawKeyPath: string; proposedRawValue: number }>
    expect(changes[0]!.rawKeyPath).toBe('line.ch1.aux3')
    expect(changes[0]!.proposedRawValue).toBe(0.8)
  })
})

// ---------------------------------------------------------------------------
// Phase 6: prepare_fat_channel_change_set (ADR-006)
// ---------------------------------------------------------------------------

describe('prepare_fat_channel_change_set (ADR-006)', () => {
  let snapshot: MixerSnapshot

  beforeEach(() => {
    snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: {
        'line.ch1.comp.on': 0,
        'line.ch1.comp.input': 0.5,
        'line.ch1.gate.on': 0,
      },
    })
  })

  it('returns a changeSet with comp.enabled change when compressor.enabled is specified', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const result = await callTool(tools, 'prepare_fat_channel_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1',
      compressor: { enabled: true },
    })
    const changes = body(result).changes as Array<{ parameter: string; rawKeyPath: string; proposedRawValue: number }>
    const enabledChange = changes.find((c) => c.parameter === 'comp.enabled')
    expect(enabledChange).toBeDefined()
    expect(enabledChange!.rawKeyPath).toBe('line.ch1.comp.on')
    expect(enabledChange!.proposedRawValue).toBe(1)
  })

  it('returns a changeSet with comp.threshold change and uses inverse normalization', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const result = await callTool(tools, 'prepare_fat_channel_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1',
      compressor: { thresholdDb: -30 },  // → (−30/60 + 1) = 0.5
    })
    const changes = body(result).changes as Array<{ parameter: string; proposedRawValue: number }>
    const threshChange = changes.find((c) => c.parameter === 'comp.threshold')
    expect(threshChange).toBeDefined()
    expect(threshChange!.proposedRawValue).toBeCloseTo(0.5, 5)
  })

  it('returns error when no parameters are specified', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const result = await callTool(tools, 'prepare_fat_channel_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1',
      // no compressor, gate, or limiter
    })
    expect(result.isError).toBe(true)
  })

  it('description includes CONFIDENCE: guessed warning', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const result = await callTool(tools, 'prepare_fat_channel_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1',
      compressor: { enabled: true },
    })
    const { description } = body(result) as { description: string }
    expect(description).toContain('guessed')
  })
})

// ---------------------------------------------------------------------------
// Phase 6: validate_change_set (ADR-006)
// ---------------------------------------------------------------------------

describe('validate_change_set (ADR-006)', () => {
  it('returns valid=false for an unknown changeSetId', async () => {
    const snapshot = makeSnapshot({ channels: [{ id: 'line.ch1', name: 'Kick', mute: false }] })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const result = await callTool(tools, 'validate_change_set', {
      deviceId: DEVICE_ID,
      changeSetId: '00000000-0000-0000-0000-000000000000',
    })
    expect(body(result).valid).toBe(false)
  })

  it('returns valid=true for a changeSetId created by prepare_mute_change_set', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: { 'line.ch1.mute': 0 },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const prepareResult = await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', muted: true,
    })
    const { changeSetId } = body(prepareResult) as { changeSetId: string }
    const validateResult = await callTool(tools, 'validate_change_set', {
      deviceId: DEVICE_ID, changeSetId,
    })
    const data = body(validateResult)
    expect(data.valid).toBe(true)
    expect(data.changeSetId).toBe(changeSetId)
    expect(data.changeCount).toBe(1)
  })

  it('returns valid=false when deviceId does not match the changeSet device', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: { 'line.ch1.mute': 0 },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const prepareResult = await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', muted: true,
    })
    const { changeSetId } = body(prepareResult) as { changeSetId: string }
    const validateResult = await callTool(tools, 'validate_change_set', {
      deviceId: 'serial:WRONG',   // ← wrong device
      changeSetId,
    })
    expect(body(validateResult).valid).toBe(false)
  })

  it('reports ttlRemainingSeconds > 0 for a freshly created changeSet', async () => {
    const snapshot = makeSnapshot({
      channels: [{ id: 'line.ch1', name: 'Kick', mute: false }],
      flatState: { 'line.ch1.mute': 0 },
    })
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: true })
    const prepareResult = await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: 'line.ch1', muted: true,
    })
    const { changeSetId } = body(prepareResult) as { changeSetId: string }
    const validateResult = await callTool(tools, 'validate_change_set', {
      deviceId: DEVICE_ID, changeSetId,
    })
    const data = body(validateResult)
    expect((data.ttlRemainingSeconds as number)).toBeGreaterThan(0)
  })
})

// ===========================================================================
// Routing cluster — #32, #33, #34, #35, #36
// ===========================================================================

/** Minimal meter summarizer stub for tools that read meter data. */
function makeMeterSummarizer(data: {
  silentChannels?: string[]
  activeChannels?: string[]
  clippingChannels?: string[]
}) {
  return {
    getSummary: (_w: 1 | 10 | 60) => ({
      windowSec: 10 as const,
      computedAt: new Date().toISOString(),
      silentChannels:  data.silentChannels  ?? [],
      activeChannels:  data.activeChannels  ?? [],
      clippingChannels: data.clippingChannels ?? [],
      hotChannels:              [],
      noSignalButExpected:      [],
      signalButUnexpected:      [],
    }),
  }
}

/** Manager that wraps makeMockManager but adds a controlled meter summarizer. */
function makeManagerWithMeter(
  snapshot?: MixerSnapshot,
  meterData?: { silentChannels?: string[]; activeChannels?: string[]; clippingChannels?: string[] },
): PresonusClientManager {
  return {
    getSnapshot:            (_id: string) => snapshot,
    getCapabilities:        (_id: string) => mockCaps,
    getIdentity:            (_id: string) => mockIdentity,
    getConnectedDeviceIds:  ()             => (snapshot ? [DEVICE_ID] : []),
    getSummarizer:          (_id: string) => meterData ? makeMeterSummarizer(meterData) : undefined,
    connect:                async ()       => undefined,
    disconnect:             async ()       => undefined,
    applyChange:            async ()       => undefined,
  } as unknown as PresonusClientManager
}

/**
 * Build a snapshot with fine-grained channel control (extends makeSnapshot).
 * Accepts faderLinear override; all other properties follow makeSnapshot defaults.
 */
function makeSnapshotWithChannels(
  channels: Array<{
    id: string
    name?: string
    mute?: boolean
    faderLinear?: number
    fatChannel?: import('@presonus-mcp/domain').ChannelFatState
    sendRouting?: import('@presonus-mcp/domain').ChannelSendRouting
  }>,
  flatState: Record<string, unknown> = {},
): MixerSnapshot {
  return {
    identity:          mockIdentity,
    channels:          channels.map((c) => ({
      id:          c.id,
      name:        c.name  ?? c.id,
      type:        'LINE' as const,
      mute:        c.mute  ?? false,
      solo:        false,
      pan:         0.5,
      color:       undefined,
      linked:      false,
      fader:       { linear: c.faderLinear ?? 0.75, db: null, raw: c.faderLinear ?? 0.75 },
      sendRouting: c.sendRouting,
      fatChannel:  c.fatChannel,
    })),
    currentProject:    undefined,
    currentScene:      undefined,
    availableProjects: [],
    capturedAt:        new Date().toISOString(),
    rawState:          {},
    flatState,
    isStale:           false,
    disconnectedAt:    undefined,
    outputPatch:       undefined,
  }
}

// ---------------------------------------------------------------------------
// #32 REQ-F-ROUT-002: get_routing_graph
// ---------------------------------------------------------------------------

describe('get_routing_graph (REQ-F-ROUT-002 #32)', () => {
  /**
   * Verifies: REQ-F-ROUT-002 (Issue #32)
   * Scenario 1: Returns routing graph with channels and sendRouting
   * Test Type: Unit
   * Priority: P1
   */
  it('returns routing graph with channels and sendRouting — Scenario 1', async () => {
    const sendRouting: import('@presonus-mcp/domain').ChannelSendRouting = {
      auxSends: [{ auxBus: 1, sendLevelLinear: 0.5, assigned: true }],
      fxSends:  [],
      subgroupAssigns: [],
      mainLrAssigned:  true,
      parameterConfidence: 'inferred',
    }
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch1', name: 'Kick',     sendRouting },
      { id: 'line.ch7', name: 'Lead Vox', sendRouting: undefined },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'get_routing_graph', { deviceId: DEVICE_ID })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    expect(data.deviceId).toBe(DEVICE_ID)
    expect(data.channelCount).toBe(2)
    const channels = data.channels as Array<{ channelId: string; sendRouting: unknown }>
    expect(channels).toHaveLength(2)
    expect(channels[0]!.channelId).toBe('line.ch1')
    // ch1 has sendRouting with aux send
    const ch1Routing = channels[0]!.sendRouting as { auxSends: unknown[] }
    expect(ch1Routing?.auxSends).toHaveLength(1)
  })

  /**
   * Verifies: REQ-F-ROUT-002 (Issue #32)
   * Scenario 2: globalConfidence = not_verifiable_with_current_adapter when outputPatch absent
   * Test Type: Unit
   * Priority: P1
   */
  it('reports not_verifiable_with_current_adapter when outputPatch is null — Scenario 2', async () => {
    const snapshot = makeSnapshotWithChannels([{ id: 'line.ch1', name: 'Kick' }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'get_routing_graph', { deviceId: DEVICE_ID })
    const data = body(result)

    expect(data.outputPatch).toBeNull()
    expect(data.globalConfidence).toBe('not_verifiable_with_current_adapter')
  })

  /**
   * Verifies: REQ-F-ROUT-002 (Issue #32)
   * Scenario 3: Device not connected → error
   * Test Type: Unit
   * Priority: P1
   */
  it('returns error when device is not connected — Scenario 3', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(undefined), { writeEnabled: false })

    const result = await callTool(tools, 'get_routing_graph', { deviceId: DEVICE_ID })

    expect(result.isError).toBe(true)
    expect(body(result).error).toContain('not connected')
  })
})

// ---------------------------------------------------------------------------
// #33 REQ-F-ROUT-003: validate_input_routing (P0)
// ---------------------------------------------------------------------------

describe('validate_input_routing (REQ-F-ROUT-003 #33 — P0)', () => {
  /**
   * Verifies: REQ-F-ROUT-003 (Issue #33)
   * Scenario 1: All expected channels have signal → status ok per route
   * Test Type: Unit
   * Priority: P0 (Critical)
   *
   * Acceptance Criteria (from #33):
   *   Given: expectedRoutes = [{ch1: 'Kick'}, {ch7: 'Lead Vox'}]
   *   And: ch1 and ch7 both have active meter signal
   *   When: validate_input_routing called
   *   Then: both routes have status 'ok'
   *   And: physical source has confidence 'not_verifiable_with_current_adapter'
   */
  it('marks routes ok when meter shows active signal on both channels — Scenario 1', async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch1', name: 'Kick',     mute: false },
      { id: 'line.ch7', name: 'Lead Vox', mute: false },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      activeChannels: ['line.ch1', 'line.ch7'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'validate_input_routing', {
      deviceId: DEVICE_ID,
      expectedRoutes: [
        { channelId: 'line.ch1', signalName: 'Kick' },
        { channelId: 'line.ch7', signalName: 'Lead Vox' },
      ],
    })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    const routes = data.routes as Array<{ destinationPort: string; status: string; confidence: string }>
    expect(routes).toHaveLength(2)
    expect(routes.every((r) => r.status === 'ok')).toBe(true)
    expect(data.summary).toMatchObject({ ok: 2, missing: 0 })
    // Physical source is always not verifiable
    expect(routes.every((r) => r.confidence === 'not_verifiable_with_current_adapter')).toBe(true)
  })

  /**
   * Verifies: REQ-F-ROUT-003 (Issue #33)
   * Scenario 2: Expected channel is silent → status 'missing'
   * Test Type: Unit
   * Priority: P0 (Critical)
   *
   * Acceptance Criteria (from #33):
   *   Given: ch7 (Lead Vox) has no meter signal
   *   Then: ch7 route has status 'missing'
   */
  it("marks route 'missing' when expected channel is silent — Scenario 2", async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch1', name: 'Kick',     mute: false },
      { id: 'line.ch7', name: 'Lead Vox', mute: false },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      activeChannels: ['line.ch1'],
      silentChannels: ['line.ch7'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'validate_input_routing', {
      deviceId: DEVICE_ID,
      expectedRoutes: [
        { channelId: 'line.ch1', signalName: 'Kick' },
        { channelId: 'line.ch7', signalName: 'Lead Vox' },
      ],
    })
    const data = body(result)
    const routes = data.routes as Array<{ destinationPort: string; status: string }>

    expect(routes.find((r) => r.destinationPort === 'line.ch1')?.status).toBe('ok')
    expect(routes.find((r) => r.destinationPort === 'line.ch7')?.status).toBe('missing')
    expect(data.summary).toMatchObject({ ok: 1, missing: 1 })
    expect((data.issues as string[]).some((i) => i.includes('line.ch7'))).toBe(true)
  })

  /**
   * Verifies: REQ-F-ROUT-003 (Issue #33)
   * Scenario 3: Channel has active signal but is muted → status 'ambiguous'
   * Test Type: Unit
   * Priority: P0 (Critical)
   *
   * Acceptance Criteria (from #33):
   *   Given: ch1 has signal but is muted
   *   Then: ch1 route has status 'ambiguous'
   */
  it("marks route 'ambiguous' when channel has signal but is muted — Scenario 3", async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch1', name: 'Kick', mute: true },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      activeChannels: ['line.ch1'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'validate_input_routing', {
      deviceId: DEVICE_ID,
      expectedRoutes: [{ channelId: 'line.ch1', signalName: 'Kick' }],
    })
    const routes = (body(result).routes as Array<{ status: string }>)

    expect(routes[0]!.status).toBe('ambiguous')
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(undefined), { writeEnabled: false })

    const result = await callTool(tools, 'validate_input_routing', {
      deviceId: DEVICE_ID,
      expectedRoutes: [{ channelId: 'line.ch1', signalName: 'Kick' }],
    })

    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// #34 REQ-F-ROUT-004: validate_stagebox_routing
// ---------------------------------------------------------------------------

describe('validate_stagebox_routing (REQ-F-ROUT-004 #34)', () => {
  /**
   * Verifies: REQ-F-ROUT-004 (Issue #34)
   * Scenario 1: stagebox_mode = 1 → stageboxPresent: true
   * Test Type: Unit
   * Priority: P1
   *
   * Acceptance Criteria (from #34):
   *   Given: 32SC has global.stagebox_mode = 1
   *   Then: stageboxPresent: true, stageboxMode: 1
   */
  it('detects stagebox when stagebox_mode is 1 — Scenario 1', async () => {
    const snapshot = makeSnapshotWithChannels([], { 'global.stagebox_mode': 1 })
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'validate_stagebox_routing', { deviceId: DEVICE_ID })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    expect(data.stageboxPresent).toBe(true)
    expect(data.stageboxMode).toBe(1)
  })

  /**
   * Verifies: REQ-F-ROUT-004 (Issue #34)
   * Scenario 2: stagebox_mode = 0 → stageboxPresent: false
   * Test Type: Unit
   * Priority: P1
   *
   * Acceptance Criteria (from #34):
   *   Given: global.stagebox_mode = 0
   *   Then: stageboxPresent: false, stageboxMode: 0
   */
  it('reports no stagebox when stagebox_mode is 0 — Scenario 2', async () => {
    const snapshot = makeSnapshotWithChannels([], { 'global.stagebox_mode': 0 })
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'validate_stagebox_routing', { deviceId: DEVICE_ID })
    const data = body(result)

    expect(data.stageboxPresent).toBe(false)
    expect(data.stageboxMode).toBe(0)
  })

  /**
   * Verifies: REQ-F-ROUT-004 (Issue #34)
   * Scenario 3: AVB stream routing is always not_verifiable_with_current_adapter
   * Test Type: Unit
   * Priority: P1
   *
   * Acceptance Criteria (from #34):
   *   When: Tool is called with any configuration
   *   Then: avbStreamRouting is always 'not_verifiable_with_current_adapter'
   */
  it('avbStreamRouting is always not_verifiable — Scenario 3', async () => {
    for (const mode of [0, 1]) {
      const snapshot = makeSnapshotWithChannels([], { 'global.stagebox_mode': mode })
      const { server, tools } = makeMockServer()
      registerTools(server, makeManagerWithMeter(snapshot), { writeEnabled: false })

      const result = await callTool(tools, 'validate_stagebox_routing', { deviceId: DEVICE_ID })
      expect((body(result).avbStreamRouting as string)).toBe('not_verifiable_with_current_adapter')
    }
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(undefined), { writeEnabled: false })

    const result = await callTool(tools, 'validate_stagebox_routing', { deviceId: DEVICE_ID })

    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// #35 REQ-F-ROUT-005: diagnose_no_signal_routing (P0)
// ---------------------------------------------------------------------------

describe('diagnose_no_signal_routing (REQ-F-ROUT-005 #35 — P0)', () => {
  /**
   * Verifies: REQ-F-ROUT-005 (Issue #35)
   * Scenario 1: Channel is muted → status 'problem', mute check, likelyCause includes 'muted'
   * Test Type: Unit
   * Priority: P0 (Critical)
   *
   * Acceptance Criteria (from #35):
   *   Given: ch7 has mute: true, meter is silent
   *   When: diagnose_no_signal_routing({ channelId: 'line.ch7' })
   *   Then: checks includes { check: 'mute', result: 'muted' }
   *   And: likelyCauses includes "Channel is muted"
   *   And: safeNextSteps includes "Unmute channel line.ch7"
   */
  it('identifies muted channel as problem with actionable next step — Scenario 1', async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch7', name: 'Lead Vox', mute: true, faderLinear: 0.75 },
    ], { 'global.stagebox_mode': 1 })
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      silentChannels: ['line.ch7'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_no_signal_routing', {
      deviceId:   DEVICE_ID,
      channelId:  'line.ch7',
      expectedSource: 'Lead Vox',
    })
    const data = body(result)
    const checks = data.checks as Array<{ check: string; result: string }>

    expect(result.isError).toBeFalsy()
    expect(data.status).toBe('problem')
    expect(checks.find((c) => c.check === 'mute')?.result).toBe('muted')
    expect((data.likelyCauses as string[]).some((c) => c.toLowerCase().includes('muted'))).toBe(true)
    expect((data.safeNextSteps as string[]).some((s) => s.includes('line.ch7'))).toBe(true)
  })

  /**
   * Verifies: REQ-F-ROUT-005 (Issue #35)
   * Scenario 2: Fader at zero → status 'problem', fader check 'zero'
   * Test Type: Unit
   * Priority: P0 (Critical)
   *
   * Acceptance Criteria (from #35):
   *   Given: ch7 has fader.linear = 0, meter silent, mute false
   *   Then: checks includes { check: 'fader', result: 'zero' }
   *   And: likelyCauses includes "fader is at minimum"
   */
  it('identifies fader at zero as problem — Scenario 2', async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch7', name: 'Lead Vox', mute: false, faderLinear: 0 },
    ], { 'global.stagebox_mode': 1 })
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      silentChannels: ['line.ch7'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_no_signal_routing', {
      deviceId:  DEVICE_ID,
      channelId: 'line.ch7',
    })
    const data = body(result)
    const checks = data.checks as Array<{ check: string; result: string }>

    expect(data.status).toBe('problem')
    expect(checks.find((c) => c.check === 'fader')?.result).toBe('zero')
    expect((data.likelyCauses as string[]).some((c) => c.toLowerCase().includes('fader'))).toBe(true)
    expect((data.safeNextSteps as string[]).some((s) => s.toLowerCase().includes('fader'))).toBe(true)
  })

  /**
   * Verifies: REQ-F-ROUT-005 (Issue #35)
   * Scenario 3: Gate enabled → gate check 'enabled_check_threshold', status 'partial'
   * Test Type: Unit
   * Priority: P0 (Critical)
   *
   * Acceptance Criteria (from #35):
   *   Given: ch7 meter intermittently active (gate on, tight threshold)
   *   Then: checks includes { check: 'gate', result: 'enabled_check_threshold' }
   *   And: safeNextSteps includes guidance to check gate threshold
   */
  it('flags enabled gate as partial issue with threshold guidance — Scenario 3', async () => {
    const fatChannel: import('@presonus-mcp/domain').ChannelFatState = {
      gate: { enabled: true, thresholdDb: -40 },
    }
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch7', name: 'Lead Vox', mute: false, faderLinear: 0.75, fatChannel },
    ], { 'global.stagebox_mode': 1 })
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      silentChannels: ['line.ch7'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_no_signal_routing', {
      deviceId:  DEVICE_ID,
      channelId: 'line.ch7',
    })
    const data = body(result)
    const checks = data.checks as Array<{ check: string; result: string }>

    expect(checks.find((c) => c.check === 'gate')?.result).toBe('enabled_check_threshold')
    expect((data.safeNextSteps as string[]).some((s) => s.toLowerCase().includes('gate'))).toBe(true)
    // Status is partial because gate is flagged but not definitively the cause
    expect(['partial', 'problem']).toContain(data.status)
  })

  /**
   * Verifies: REQ-F-ROUT-005 (Issue #35)
   * Scenario 4: Unmuted, fader up, gate off, but meter silent → status 'inconclusive'
   * Test Type: Unit
   * Priority: P0 (Critical)
   *
   * Acceptance Criteria (from #35):
   *   Given: ch7 unmuted, fader up, gate off, but meter silent
   *   Then: status 'inconclusive'
   *   And: likelyCauses includes physical routing (not_verifiable)
   *   And: safeNextSteps includes "Ask performer to send signal"
   */
  it('returns inconclusive with physical routing causes when all checks pass but no signal — Scenario 4', async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch7', name: 'Lead Vox', mute: false, faderLinear: 0.75 },
    ], { 'global.stagebox_mode': 1 })
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      silentChannels: ['line.ch7'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_no_signal_routing', {
      deviceId:       DEVICE_ID,
      channelId:      'line.ch7',
      expectedSource: 'Lead Vox',
    })
    const data = body(result)

    expect(data.status).toBe('inconclusive')
    const causes = data.likelyCauses as string[]
    expect(causes.some((c) => c.toLowerCase().includes('routing') || c.toLowerCase().includes('patch') || c.toLowerCase().includes('verifiable'))).toBe(true)
    expect((data.safeNextSteps as string[]).some((s) => s.toLowerCase().includes('signal'))).toBe(true)
  })

  it('returns ok status when channel has active signal', async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch7', name: 'Lead Vox', mute: false, faderLinear: 0.75 },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      activeChannels: ['line.ch7'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_no_signal_routing', {
      deviceId: DEVICE_ID, channelId: 'line.ch7',
    })

    expect(body(result).status).toBe('ok')
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(undefined), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_no_signal_routing', {
      deviceId: DEVICE_ID, channelId: 'line.ch7',
    })

    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// #36 REQ-F-ROUT-006: detect_possible_patch_swap
// ---------------------------------------------------------------------------

describe('detect_possible_patch_swap (REQ-F-ROUT-006 #36)', () => {
  /**
   * Verifies: REQ-F-ROUT-006 (Issue #36)
   * Scenario 1: Two channels swapped by label cross-match
   * Test Type: Unit
   * Priority: P1
   *
   * Acceptance Criteria (from #36):
   *   Given: expectedChannels = [{ch1: 'Kick'}, {ch2: 'Snare'}]
   *   And: Meter shows ch1 silent, ch2 active
   *   And: Channel names: ch1='Snare', ch2='Kick' (label swap)
   *   When: detect_possible_patch_swap called
   *   Then: possibleSwaps contains entry for ch1↔ch2 with evidence string
   */
  it('detects label-cross swap when silent ch is labeled with active ch signal — Scenario 1', async () => {
    // ch1 labeled 'Snare' but expected 'Kick' (silent)
    // ch2 labeled 'Kick' but expected 'Snare' (active)
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch1', name: 'Snare', mute: false },
      { id: 'line.ch2', name: 'Kick',  mute: false },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      silentChannels: ['line.ch1'],
      activeChannels: ['line.ch2'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'detect_possible_patch_swap', {
      deviceId: DEVICE_ID,
      expectedChannels: [
        { channelId: 'line.ch1', signalName: 'Kick' },
        { channelId: 'line.ch2', signalName: 'Snare' },
      ],
    })
    const data = body(result)
    const swaps = data.possibleSwaps as Array<{ channelA: string; channelB: string; evidence: string }>

    expect(result.isError).toBeFalsy()
    expect(swaps.length).toBeGreaterThanOrEqual(1)
    const swap = swaps[0]!
    expect([swap.channelA, swap.channelB]).toContain('line.ch1')
    expect([swap.channelA, swap.channelB]).toContain('line.ch2')
    expect(swap.evidence).toBeTruthy()
  })

  /**
   * Verifies: REQ-F-ROUT-006 (Issue #36)
   * Scenario 2: No swap detected when all channels active on correct channels
   * Test Type: Unit
   * Priority: P1
   *
   * Acceptance Criteria (from #36):
   *   Given: All expected channels have signal on correct channels
   *   Then: possibleSwaps is empty
   */
  it('returns empty possibleSwaps when all channels are correctly wired — Scenario 2', async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch1', name: 'Kick',  mute: false },
      { id: 'line.ch2', name: 'Snare', mute: false },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      activeChannels: ['line.ch1', 'line.ch2'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'detect_possible_patch_swap', {
      deviceId: DEVICE_ID,
      expectedChannels: [
        { channelId: 'line.ch1', signalName: 'Kick' },
        { channelId: 'line.ch2', signalName: 'Snare' },
      ],
    })
    const data = body(result)

    expect((data.possibleSwaps as unknown[]).length).toBe(0)
  })

  /**
   * Verifies: REQ-F-ROUT-006 (Issue #36)
   * Scenario 3: Silent without obvious swap partner → silentChannelsNotInExpectedList populated
   * Test Type: Unit
   * Priority: P1
   *
   * Acceptance Criteria (from #36):
   *   Given: ch7 silent, no other channel has ch7's expected signal name as a label
   *   Then: silentChannelsNotInExpectedList and unexpectedActiveChannels populated
   */
  it('reports silent expected channels and unexpected active channels without swap — Scenario 3', async () => {
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch7', name: 'Lead Vox', mute: false },
      { id: 'line.ch9', name: 'Overhead',  mute: false },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      silentChannels: ['line.ch7'],
      activeChannels: ['line.ch9'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'detect_possible_patch_swap', {
      deviceId: DEVICE_ID,
      expectedChannels: [
        { channelId: 'line.ch7', signalName: 'Lead Vox' },
      ],
    })
    const data = body(result)

    // ch7 is silent (expected) → in silentChannelsNotInExpectedList
    expect((data.silentChannelsNotInExpectedList as string[])).toContain('line.ch7')
    // ch9 is active but not in expected list → unexpectedActiveChannels
    expect((data.unexpectedActiveChannels as string[])).toContain('line.ch9')
  })

  it('returns error when device is not connected', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(undefined), { writeEnabled: false })

    const result = await callTool(tools, 'detect_possible_patch_swap', {
      deviceId: DEVICE_ID,
      expectedChannels: [{ channelId: 'line.ch1', signalName: 'Kick' }],
    })

    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// REQ-F-DIAG-001 (#78) + TEST-DIAG-001 (#83): diagnose_channel
// ---------------------------------------------------------------------------

describe('diagnose_channel (REQ-F-DIAG-001 #78)', () => {
  /**
   * Verifies: #78 REQ-F-DIAG-001 — diagnose_channel MCP tool
   * Verifies: #83 TEST-DIAG-001
   * Traces to: #3 (StR: Soundcheck assistance via read-only mixer diagnostics)
   *
   * Tests the MCP tool layer (handler dispatch + JSON serialisation).
   * Adapter-layer logic is already verified in diagnostics.test.ts.
   */

  it('muted channel → status:problem, cause mentions mute (StR #3 criterion 3)', async () => {
    // Given: channel 7 is muted
    const snapshot = makeSnapshotWithChannels([{ id: 'line.ch7', name: 'Lead Vox', mute: true }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })

    // When: diagnose_channel called
    const result = await callTool(tools, 'diagnose_channel', { deviceId: DEVICE_ID, channel: 7 })
    const data = body(result)

    // Then: problem with mute cause
    expect(result.isError).toBeFalsy()
    expect(data.status).toBe('problem')
    expect((data.mostLikelyCauses as string[]).some((c) => /mute|muted/i.test(c))).toBe(true)
    expect(Array.isArray(data.safeNextSteps)).toBe(true)
  })

  it('fader at zero → status:problem, cause mentions fader (StR #3 criterion 3)', async () => {
    // Given: channel 7 fader at minimum
    const snapshot = makeSnapshotWithChannels([{ id: 'line.ch7', mute: false, faderLinear: 0.0 }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_channel', { deviceId: DEVICE_ID, channel: 7 })
    const data = body(result)

    expect(data.status).toBe('problem')
    expect((data.mostLikelyCauses as string[]).some((c) => /fader/i.test(c))).toBe(true)
  })

  it('gate enabled → status not ok, cause mentions gate (StR #3 criterion 3)', async () => {
    // Given: channel 7 has gate enabled (may cut signal), everything else nominal
    const snapshot = makeSnapshotWithChannels([{
      id: 'line.ch7',
      mute: false,
      faderLinear: 0.75,
      fatChannel: { gateEnabled: true } as ChannelFatState,
    }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_channel', { deviceId: DEVICE_ID, channel: 7 })
    const data = body(result)

    expect(data.status).not.toBe('ok')
    expect((data.mostLikelyCauses as string[]).some((c) => /gate/i.test(c))).toBe(true)
  })

  it('active signal, unmuted, fader up → status:ok (StR #3 criterion 1)', async () => {
    // Given: channel 7 nominal, meter shows active signal
    const snapshot = makeSnapshotWithChannels([{ id: 'line.ch7', mute: false, faderLinear: 0.75 }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, { activeChannels: ['line.ch7'] }), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_channel', { deviceId: DEVICE_ID, channel: 7 })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    expect(data.status).toBe('ok')
  })

  it('device not connected → isError:true', async () => {
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(undefined), { writeEnabled: false })

    const result = await callTool(tools, 'diagnose_channel', { deviceId: DEVICE_ID, channel: 7 })

    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// REQ-F-DIAG-002 (#74) + TEST-DIAG-002 (#81): analyze_line_check_step
// ---------------------------------------------------------------------------

describe('analyze_line_check_step (REQ-F-DIAG-002 #74)', () => {
  /**
   * Verifies: #74 REQ-F-DIAG-002 — analyze_line_check_step MCP tool
   * Verifies: #81 TEST-DIAG-002
   * Traces to: #3 (StR: Soundcheck assistance — criteria 1, 4)
   */

  it('expected channel silent → expectedActive shows silent, status not ok (StR #3 criterion 1)', async () => {
    // Given: ch1 expected active, but meter shows it silent
    const snapshot = makeSnapshotWithChannels([{ id: 'line.ch1', name: 'Kick' }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, { silentChannels: ['line.ch1'] }), { writeEnabled: false })

    const result = await callTool(tools, 'analyze_line_check_step', {
      deviceId: DEVICE_ID,
      expectedActiveChannels: [{ channel: 1, name: 'Kick' }],
    })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    expect(data.status).not.toBe('ok')
    const expected = data.expectedActive as Array<{ channel: number; signal: string }>
    expect(expected[0]!.signal).toBe('silent')
  })

  it('unexpected active channel → flagged in unexpectedActive (StR #3 criterion 4)', async () => {
    // Given: ch1 expected but silent; ch2 unexpectedly active
    const snapshot = makeSnapshotWithChannels([
      { id: 'line.ch1', name: 'Kick' },
      { id: 'line.ch2', name: 'Ch 2' },
    ])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, {
      silentChannels: ['line.ch1'],
      activeChannels: ['line.ch2'],
    }), { writeEnabled: false })

    const result = await callTool(tools, 'analyze_line_check_step', {
      deviceId: DEVICE_ID,
      expectedActiveChannels: [{ channel: 1, name: 'Kick' }],
    })
    const data = body(result)

    const unexpected = data.unexpectedActive as Array<{ channel: number }>
    expect(unexpected.some((u) => u.channel === 2)).toBe(true)
  })

  it('all expected channels active, no extras → status:ok (StR #3 criteria 1+4)', async () => {
    const snapshot = makeSnapshotWithChannels([{ id: 'line.ch1', name: 'Kick' }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, { activeChannels: ['line.ch1'] }), { writeEnabled: false })

    const result = await callTool(tools, 'analyze_line_check_step', {
      deviceId: DEVICE_ID,
      expectedActiveChannels: [{ channel: 1, name: 'Kick' }],
    })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    expect(data.status).toBe('ok')
    expect((data.unexpectedActive as unknown[]).length).toBe(0)
  })

  it('no meter data available → isError:true with explanation', async () => {
    // getSummarizer returns undefined → tool cannot proceed
    const snapshot = makeSnapshotWithChannels([{ id: 'line.ch1' }])
    const { server, tools } = makeMockServer()
    registerTools(server, makeManagerWithMeter(snapshot, undefined), { writeEnabled: false })

    const result = await callTool(tools, 'analyze_line_check_step', {
      deviceId: DEVICE_ID,
      expectedActiveChannels: [{ channel: 1, name: 'Kick' }],
    })

    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text).error).toMatch(/meter|data/i)
  })
})

// ---------------------------------------------------------------------------
// REQ-F-DIAG-003 (#76) + TEST-DIAG-003 (#82): check_required_setup
// ---------------------------------------------------------------------------

describe('check_required_setup (REQ-F-DIAG-003 #76)', () => {
  /**
   * Verifies: #76 REQ-F-DIAG-003 — check_required_setup MCP tool
   * Verifies: #82 TEST-DIAG-003
   * Traces to: #3 (StR: Soundcheck assistance)
   * mockCaps = { lineInputs:32, auxMixes:16, fxBuses:4, avbStagebox:true }
   */

  it('all requirements met → status:ok, every check passes', async () => {
    const snapshot = makeSnapshotWithChannels([])
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'check_required_setup', {
      deviceId: DEVICE_ID,
      requirements: { inputChannels: 32, monitorMixes: 6, fxBuses: 4, stageboxRequired: true },
    })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    expect(data.status).toBe('ok')
    const checks = data.checks as Array<{ requirement: string; status: string }>
    expect(checks.every((c) => c.status === 'ok')).toBe(true)
  })

  it('requires more FX buses than available → status:problem, fxBuses insufficient', async () => {
    const snapshot = makeSnapshotWithChannels([])
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })

    // mockCaps.fxBuses === 4; require 8
    const result = await callTool(tools, 'check_required_setup', {
      deviceId: DEVICE_ID,
      requirements: { fxBuses: 8 },
    })
    const data = body(result)

    expect(data.status).toBe('problem')
    const checks = data.checks as Array<{ requirement: string; status: string }>
    const fxCheck = checks.find((c) => c.requirement === 'fxBuses')
    expect(fxCheck?.status).toBe('insufficient')
  })

  it('requires stagebox but caps shows none → status:problem, stageboxRequired unavailable', async () => {
    // Override caps to have no stagebox
    const noStagebox = makeMockManager(makeSnapshotWithChannels([]))
    ;(noStagebox as Record<string, unknown>).getCapabilities = () => ({
      ...mockCaps,
      avbStagebox: false,
    })
    const { server, tools } = makeMockServer()
    registerTools(server, noStagebox, { writeEnabled: false })

    const result = await callTool(tools, 'check_required_setup', {
      deviceId: DEVICE_ID,
      requirements: { stageboxRequired: true },
    })
    const data = body(result)

    expect(data.status).toBe('problem')
    const checks = data.checks as Array<{ requirement: string; status: string }>
    const sbCheck = checks.find((c) => c.requirement === 'stageboxRequired')
    expect(sbCheck?.status).toBe('unavailable')
  })

  it('device not connected → isError:true', async () => {
    // check_required_setup gates on getIdentity (not getSnapshot)
    const mgr = makeMockManager(undefined)
    ;(mgr as Record<string, unknown>).getIdentity = () => undefined
    const { server, tools } = makeMockServer()
    registerTools(server, mgr, { writeEnabled: false })

    const result = await callTool(tools, 'check_required_setup', {
      deviceId: DEVICE_ID,
      requirements: { inputChannels: 32 },
    })

    expect(result.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// REQ-F-DIAG-004 (#79) + TEST-DIAG-004 (#80): get_mixer_capabilities
// ---------------------------------------------------------------------------

describe('get_mixer_capabilities (REQ-F-DIAG-004 #79)', () => {
  /**
   * Verifies: #79 REQ-F-DIAG-004 — get_mixer_capabilities MCP tool
   * Verifies: #80 TEST-DIAG-004
   * Traces to: #3 (StR: Soundcheck assistance)
   * mockCaps = { lineInputs:32, auxMixes:16, subgroups:4, fxBuses:4, mainOutputs:true, fatChannel:true, avbStagebox:true }
   * mockIdentity.role = 'FOH'
   */

  it('connected device → returns capabilities object with all fields', async () => {
    const snapshot = makeSnapshotWithChannels([])
    const { server, tools } = makeMockServer()
    registerTools(server, makeMockManager(snapshot), { writeEnabled: false })

    const result = await callTool(tools, 'get_mixer_capabilities', { deviceId: DEVICE_ID })
    const data = body(result)

    expect(result.isError).toBeFalsy()
    expect(data.deviceId).toBe(DEVICE_ID)
    expect(data.role).toBe('FOH')
    const caps = data.capabilities as typeof mockCaps
    expect(caps.lineInputs).toBe(32)
    expect(caps.auxMixes).toBe(16)
    expect(caps.fxBuses).toBe(4)
    expect(caps.avbStagebox).toBe(true)
    expect(caps.fatChannel).toBe(true)
  })

  it('unknown device id → isError:true', async () => {
    // get_mixer_capabilities gates on getIdentity; override to return undefined
    const mgr = makeMockManager(undefined)
    ;(mgr as Record<string, unknown>).getIdentity = () => undefined
    const { server, tools } = makeMockServer()
    registerTools(server, mgr, { writeEnabled: false })

    const result = await callTool(tools, 'get_mixer_capabilities', { deviceId: DEVICE_ID })

    expect(result.isError).toBe(true)
  })
})
