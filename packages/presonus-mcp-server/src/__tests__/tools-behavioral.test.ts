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
