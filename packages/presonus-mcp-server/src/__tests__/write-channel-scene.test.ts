/**
 * Mocked CI tests for REQ-F-WRITE-005 (#86) — channel rename, sub group
 * membership, and aux assignment MCP tools.
 *
 * These tests run WITHOUT hardware in CI. They use the fixture factory from
 * fixtures/scene-fixture.ts which is a TypeScript const, NOT a loaded JSON file.
 *
 * Each test validates: input validation, changeset shape, TTL, write-guard.
 * The actual mixer round-trip is covered by write-channel-scene.hil.test.ts.
 *
 * Verifies: REQ-F-WRITE-005 (#86)
 * Traces to: #2 (StR-002: Show preparation)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerTools } from '../tools.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { makeFixtureSnapshot, FIXTURE_FLAT_STATE } from './fixtures/scene-fixture.js'
import type { PresonusClientManager } from '@presonus-mcp/adapter'

// ─── Mock server + client manager ────────────────────────────────────────────

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

function body(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>
}

async function callTool(tools: Map<string, ToolHandler>, name: string, args: Record<string, unknown>) {
  const handler = tools.get(name)
  if (!handler) throw new Error(`Tool '${name}' not registered`)
  return handler(args)
}

/** Build a mock PresonusClientManager backed by the fixture snapshot */
function makeMockManager(overrides: Record<string, unknown> = {}, writeEnabled = true) {
  const snapshot = makeFixtureSnapshot(overrides)
  const applyChangeMock = vi.fn(async () => {})
  const applyStringChangeMock = vi.fn(async () => {})
  return {
    manager: {
      getSnapshot: () => snapshot,
      getSummarizer: () => null,
      getConnectedDeviceIds: () => ['serial:SD7E21010066'],
      getIdentity: () => snapshot.identity,
      getCapabilities: () => ({ lineInputs: 32, auxMixes: 16, fxBuses: 4, avbStagebox: false }),
      setAllWriteEnabled: () => {},
      applyChange: applyChangeMock,
      applyStringChange: applyStringChangeMock,
      connect: vi.fn(), disconnect: vi.fn(),
    } as unknown as PresonusClientManager,
    applyChangeMock,
    applyStringChangeMock,
    snapshot,
  }
}

// ─── list_sub_groups ─────────────────────────────────────────────────────────

describe('list_sub_groups — mocked CI (REQ-F-WRITE-005b #86)', () => {
  it('returns 4 buses from fixture', async () => {
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const r = await callTool(tools, 'list_sub_groups', { deviceId: 'serial:SD7E21010066' })
    const result = body(r) as { buses: unknown[] }
    expect(result.buses).toHaveLength(4)
  })

  it('BackVox (sub4) has fxreturn.ch4 as member', async () => {
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const r = await callTool(tools, 'list_sub_groups', { deviceId: 'serial:SD7E21010066' })
    const result = body(r) as { buses: Array<{ username: string; members: Array<{ channelId: string; channelType: string }> }> }
    const backVox = result.buses.find(b => b.username === 'BackVox')
    expect(backVox, 'BackVox bus not found').toBeDefined()
    const voxDelay = backVox!.members.find(m => m.channelId === 'fxreturn.ch4')
    expect(voxDelay, 'VoxDelay (fxreturn.ch4) not in BackVox members').toBeDefined()
    expect(voxDelay!.channelType).toBe('fxreturn')
  })

  it('is registered without writeEnabled (read-only tool)', () => {
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })
    expect(tools.has('list_sub_groups')).toBe(true)
  })

  it('returns error when device not connected', async () => {
    const { manager } = makeMockManager()
    const badManager = { ...manager, getSnapshot: () => undefined } as unknown as PresonusClientManager
    const { server, tools } = makeMockServer()
    registerTools(server, badManager, { writeEnabled: false })

    const r = await callTool(tools, 'list_sub_groups', { deviceId: 'serial:SD7E21010066' })
    expect(r.isError).toBe(true)
  })
})

// ─── prepare_channel_rename_change_set ───────────────────────────────────────

describe('prepare_channel_rename_change_set — mocked CI (REQ-F-WRITE-005a #86)', () => {
  let tools: Map<string, ToolHandler>

  beforeEach(() => {
    const { manager } = makeMockManager()
    const mock = makeMockServer()
    registerTools(mock.server, manager, { writeEnabled: true })
    tools = mock.tools
  })

  it('is NOT registered when writeEnabled=false', () => {
    const { manager } = makeMockManager()
    const { server, tools: roTools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })
    expect(roTools.has('prepare_channel_rename_change_set')).toBe(false)
  })

  it('returns a valid changeSet for line.ch11 → "Samples"', async () => {
    const r = await callTool(tools, 'prepare_channel_rename_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch11', newName: 'Samples',
    })
    expect(r.isError).toBeUndefined()
    const cs = body(r)
    expect(typeof cs.changeSetId).toBe('string')
    expect(cs.channelId).toBe('line.ch11')
    expect(cs.description).toContain('Samples')
    const changes = cs.changes as Array<{ parameter: string; proposedStringValue: string }>
    expect(changes[0]!.parameter).toBe('username')
    expect(changes[0]!.proposedStringValue).toBe('Samples')
  })

  it('accepts fxreturn.ch4 rename', async () => {
    const r = await callTool(tools, 'prepare_channel_rename_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'fxreturn.ch4', newName: 'VoxDly2',
    })
    expect(r.isError).toBeUndefined()
    expect(body(r).channelId).toBe('fxreturn.ch4')
  })

  it('rejects name > 16 chars', async () => {
    const r = await callTool(tools, 'prepare_channel_rename_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch11', newName: 'TOOLONGNAME_12345',
    })
    expect(r.isError).toBe(true)
  })

  it('rejects empty name', async () => {
    const r = await callTool(tools, 'prepare_channel_rename_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch11', newName: '',
    })
    expect(r.isError).toBe(true)
  })

  it('rejects unknown channelId (no username key in snapshot)', async () => {
    const r = await callTool(tools, 'prepare_channel_rename_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch99', newName: 'Test',
    })
    expect(r.isError).toBe(true)
  })

  it('apply_change_set calls applyStringChange for username parameter', async () => {
    const { manager, applyStringChangeMock, applyChangeMock: acm } = makeMockManager()
    const { server, tools: wTools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const propR = await callTool(wTools, 'prepare_channel_rename_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch11', newName: 'Samples',
    })
    const changeSetId = body(propR).changeSetId as string

    const applyR = await callTool(wTools, 'apply_change_set', {
      deviceId: 'serial:SD7E21010066', changeSetId, confirmationNote: 'unit test',
    })
    expect(body(applyR).success).toBe(true)
    expect(applyStringChangeMock).toHaveBeenCalledWith(
      'serial:SD7E21010066', 'line.ch11.username', 'Samples',
    )
    expect(acm).not.toHaveBeenCalled()  // must NOT use numeric applyChange for string
  })
})

// ─── prepare_sub_group_membership_change_set ─────────────────────────────────

describe('prepare_sub_group_membership_change_set — mocked CI (REQ-F-WRITE-005c #86)', () => {
  let tools: Map<string, ToolHandler>

  beforeEach(() => {
    const { manager } = makeMockManager()
    const mock = makeMockServer()
    registerTools(mock.server, manager, { writeEnabled: true })
    tools = mock.tools
  })

  it('is NOT registered when writeEnabled=false', () => {
    const { manager } = makeMockManager()
    const { server, tools: roTools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })
    expect(roTools.has('prepare_sub_group_membership_change_set')).toBe(false)
  })

  it('returns changeSet for removing fxreturn.ch4 from sub4 (BackVox)', async () => {
    const r = await callTool(tools, 'prepare_sub_group_membership_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'fxreturn.ch4', subGroupIndex: 4, assigned: false,
    })
    expect(r.isError).toBeUndefined()
    const cs = body(r)
    expect(cs.description).toContain('Remove')
    expect(cs.description).toContain('Sub D')
    const changes = cs.changes as Array<{ parameter: string; rawKeyPath: string; proposedRawValue: number }>
    expect(changes[0]!.parameter).toBe('sub.membership')
    expect(changes[0]!.rawKeyPath).toBe('fxreturn.ch4.sub4')
    expect(changes[0]!.proposedRawValue).toBe(0.0)
  })

  it('returns changeSet for adding line.ch17 to sub1', async () => {
    const r = await callTool(tools, 'prepare_sub_group_membership_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch17', subGroupIndex: 1, assigned: true,
    })
    const cs = body(r)
    expect((cs.changes as Array<{ proposedRawValue: number }>)[0]!.proposedRawValue).toBe(1.0)
  })

  it('rejects unsupported channel type (sub.ch1 is not line or fxreturn)', async () => {
    const r = await callTool(tools, 'prepare_sub_group_membership_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'sub.ch1', subGroupIndex: 1, assigned: true,
    })
    expect(r.isError).toBe(true)
  })

  it('apply_change_set calls applyChange (numeric) for sub.membership', async () => {
    const { manager, applyChangeMock } = makeMockManager()
    const { server, tools: wTools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const propR = await callTool(wTools, 'prepare_sub_group_membership_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'fxreturn.ch4', subGroupIndex: 4, assigned: false,
    })
    await callTool(wTools, 'apply_change_set', {
      deviceId: 'serial:SD7E21010066', changeSetId: body(propR).changeSetId, confirmationNote: 'test',
    })
    expect(applyChangeMock).toHaveBeenCalledWith('serial:SD7E21010066', 'fxreturn.ch4.sub4', 0.0)
  })
})

// ─── prepare_aux_assignment_change_set ───────────────────────────────────────

describe('prepare_aux_assignment_change_set — mocked CI (REQ-F-WRITE-005d #86)', () => {
  let tools: Map<string, ToolHandler>

  beforeEach(() => {
    const { manager } = makeMockManager()
    const mock = makeMockServer()
    registerTools(mock.server, manager, { writeEnabled: true })
    tools = mock.tools
  })

  it('is NOT registered when writeEnabled=false', () => {
    const { manager } = makeMockManager()
    const { server, tools: roTools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })
    expect(roTools.has('prepare_aux_assignment_change_set')).toBe(false)
  })

  it('returns changeSet for unassigning line.ch17 from aux13 (NYDrums)', async () => {
    const r = await callTool(tools, 'prepare_aux_assignment_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch17', auxBus: 13, assigned: false,
    })
    expect(r.isError).toBeUndefined()
    const cs = body(r)
    expect(cs.description).toContain('Unassign')
    expect(cs.description).toContain('Aux 13')
    const changes = cs.changes as Array<{ parameter: string; rawKeyPath: string; proposedRawValue: number }>
    expect(changes[0]!.parameter).toBe('aux.assignment')
    expect(changes[0]!.rawKeyPath).toBe('line.ch17.assign_aux13')
    expect(changes[0]!.proposedRawValue).toBe(0.0)
  })

  it('returns changeSet for assigning line.ch18 to aux13', async () => {
    const r = await callTool(tools, 'prepare_aux_assignment_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch18', auxBus: 13, assigned: true,
    })
    const cs = body(r)
    expect((cs.changes as Array<{ proposedRawValue: number }>)[0]!.proposedRawValue).toBe(1.0)
  })

  it('rejects unknown channel (not in snapshot channels list)', async () => {
    const r = await callTool(tools, 'prepare_aux_assignment_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch99', auxBus: 13, assigned: false,
    })
    expect(r.isError).toBe(true)
  })

  it('apply_change_set calls applyChange (numeric) for aux.assignment', async () => {
    const { manager, applyChangeMock } = makeMockManager()
    const { server, tools: wTools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const propR = await callTool(wTools, 'prepare_aux_assignment_change_set', {
      deviceId: 'serial:SD7E21010066', channelId: 'line.ch17', auxBus: 13, assigned: false,
    })
    await callTool(wTools, 'apply_change_set', {
      deviceId: 'serial:SD7E21010066', changeSetId: body(propR).changeSetId, confirmationNote: 'test',
    })
    expect(applyChangeMock).toHaveBeenCalledWith('serial:SD7E21010066', 'line.ch17.assign_aux13', 0.0)
  })
})

// ─── get_routing_graph — fxreturn channels ───────────────────────────────────

describe('get_routing_graph enhancement — fxreturn + sub channels (REQ-F-READ-005e #86)', () => {
  it('includes fxreturn.ch4 in channels list', async () => {
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const r = await callTool(tools, 'get_routing_graph', { deviceId: 'serial:SD7E21010066' })
    const result = body(r) as { channels: Array<{ channelId: string; channelType: string }> }
    const fxCh = result.channels.find(c => c.channelId === 'fxreturn.ch4')
    expect(fxCh, 'fxreturn.ch4 missing from routing graph').toBeDefined()
    expect(fxCh!.channelType).toBe('fxreturn')
  })

  it('line channels still have channelType = "line"', async () => {
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const r = await callTool(tools, 'get_routing_graph', { deviceId: 'serial:SD7E21010066' })
    const result = body(r) as { channels: Array<{ channelId: string; channelType: string }> }
    const lineCh = result.channels.find(c => c.channelId === 'line.ch11')
    expect(lineCh!.channelType).toBe('line')
  })

  it('sub channels appear in routing graph', async () => {
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: false })

    const r = await callTool(tools, 'get_routing_graph', { deviceId: 'serial:SD7E21010066' })
    const result = body(r) as { channels: Array<{ channelId: string; channelType: string }> }
    const subCh = result.channels.find(c => c.channelId === 'sub.ch4')
    expect(subCh, 'sub.ch4 missing from routing graph').toBeDefined()
    expect(subCh!.channelType).toBe('sub')
  })
})

// ---------------------------------------------------------------------------
// apply_change_set safety semantics: dry-run, post-write verification, rollback hint
// TDD: RED first - these tests FAIL until dry-run, postWriteVerification,
//      rollbackHint are implemented in apply_change_set.
// ---------------------------------------------------------------------------

describe('apply_change_set safety semantics (dry-run / post-write / rollback) � REQ-F-WRITE-005', () => {
  const DEVICE_ID = 'serial:SD7E21010066'
  const CHANNEL_ID = 'line.ch11'  // safe test channel (Klick)

  it('dryRun:true returns resolution without calling applyChange', async () => {
    /**
     * Verifies: apply_change_set dry-run must not call applyChange.
     * Given: dryRun=true in the call
     * Then:  applyChangeMock never called; response has dryRun:true + resolution array
     */
    const { manager, applyChangeMock } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const prep = body(await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: CHANNEL_ID, muted: true,
    }))
    expect(prep.changeSetId).toBeTruthy()

    const dryResult = body(await callTool(tools, 'apply_change_set', {
      deviceId: DEVICE_ID,
      changeSetId: prep.changeSetId,
      confirmationNote: 'dry-run unit test',
      dryRun: true,
    }))

    expect(dryResult.dryRun).toBe(true)
    expect(dryResult.resolution).toBeDefined()
    expect(Array.isArray(dryResult.resolution)).toBe(true)
    expect(applyChangeMock).not.toHaveBeenCalled()
  })

  it('dryRun:true leaves changeSetId valid (not consumed)', async () => {
    /**
     * Verifies: dry-run must not consume the changeSet.
     * A subsequent validate_change_set must still return valid:true.
     */
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const prep = body(await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: CHANNEL_ID, muted: true,
    }))

    await callTool(tools, 'apply_change_set', {
      deviceId: DEVICE_ID,
      changeSetId: prep.changeSetId,
      confirmationNote: 'dry-run consume test',
      dryRun: true,
    })

    const v = body(await callTool(tools, 'validate_change_set', {
      deviceId: DEVICE_ID, changeSetId: prep.changeSetId,
    }))
    expect(v.valid).toBe(true)
  })

  it('real apply returns postWriteVerification keyed by rawKeyPath', async () => {
    /**
     * Verifies: after a real apply, the response must include postWriteVerification
     * with expected/actual/match for each changed key.
     */
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const prep = body(await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: CHANNEL_ID, muted: true,
    }))

    const result = body(await callTool(tools, 'apply_change_set', {
      deviceId: DEVICE_ID,
      changeSetId: prep.changeSetId,
      confirmationNote: 'post-write verification test',
    }))

    expect(result.postWriteVerification).toBeDefined()
    const pv = result.postWriteVerification as Record<string, { expected: unknown; actual: unknown; match: boolean }>
    expect(pv['line.ch11.mute']).toBeDefined()
    expect(pv['line.ch11.mute'].expected).toBe(1)  // muted = 1.0 raw
  })

  it('real apply returns rollbackHint array', async () => {
    /**
     * Verifies: apply response must include rollbackHint so agents can restore state.
     * rollbackHint[].rawKeyPath must match the changed key.
     */
    const { manager } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const prep = body(await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: CHANNEL_ID, muted: true,
    }))

    const result = body(await callTool(tools, 'apply_change_set', {
      deviceId: DEVICE_ID,
      changeSetId: prep.changeSetId,
      confirmationNote: 'rollback hint test',
    }))

    expect(result.rollbackHint).toBeDefined()
    expect(Array.isArray(result.rollbackHint)).toBe(true)
    const hints = result.rollbackHint as Array<{ rawKeyPath: string; currentDisplayValue: string }>
    expect(hints[0].rawKeyPath).toBe('line.ch11.mute')
    expect(hints[0].currentDisplayValue).toBe('active')  // was active before mute
  })

  it('no dryRun field (omitted) behaves as real apply (backward compat)', async () => {
    /**
     * Verifies: omitting dryRun entirely must not break existing callers.
     */
    const { manager, applyChangeMock } = makeMockManager()
    const { server, tools } = makeMockServer()
    registerTools(server, manager, { writeEnabled: true })

    const prep = body(await callTool(tools, 'prepare_mute_change_set', {
      deviceId: DEVICE_ID, channelId: CHANNEL_ID, muted: true,
    }))

    const result = body(await callTool(tools, 'apply_change_set', {
      deviceId: DEVICE_ID,
      changeSetId: prep.changeSetId,
      confirmationNote: 'backward compat test',
      // dryRun intentionally omitted
    }))

    expect(result.success).toBe(true)
    expect(applyChangeMock).toHaveBeenCalledOnce()
  })
})
