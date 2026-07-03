/**
 * Capability inventory snapshot test.
 *
 * Asserts that the committed docs/generated/capability-inventory.json is in
 * sync with the tools and resources actually registered in tools.ts /
 * resources.ts.  The test fails if:
 *   1. capability-inventory.json does not exist yet (→ run `pnpm inventory`).
 *   2. A tool or resource was added/removed in source without re-running the
 *      generator (drift detected).
 *
 * TDD lifecycle:
 *   RED  = inventory JSON missing or stale → run `pnpm inventory` to fix.
 *   GREEN = inventory JSON exists and names match current registrations.
 *
 * @implements #22 REQ-CAP-INV-001 — generated inventory must not drift from source
 * Traces to: #22 REQ-NF-002 (zero write tools in default config),
 *            #15 REQ-F-001 (auto-discover mixers)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PresonusClientManager } from '@presonus-mcp/adapter'
import { registerTools } from '../tools.js'
import { registerResources } from '../resources.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Workspace root — four levels up from packages/presonus-mcp-server/src/__tests__/
const ROOT = resolve(__dirname, '../../../../')
const TOOLS_SRC   = resolve(ROOT, 'packages/presonus-mcp-server/src/tools.ts')
const RESOURCES_SRC = resolve(ROOT, 'packages/presonus-mcp-server/src/resources.ts')
const INVENTORY_PATH = resolve(ROOT, 'docs/generated/capability-inventory.json')
const MATRIX_PATH = resolve(ROOT, 'docs/capability-matrix.generated.md')

/** Parse tool/resource names from source text by finding server.tool( and server.resource( calls */
function extractNamesFromSource(src: string, callPattern: RegExp): string[] {
  const names: string[] = []
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (callPattern.test(lines[i])) {
      // Look at the next non-empty line for the quoted name argument
      const nextLine = lines[i + 1]?.trim() ?? ''
      const match = /^'([^']+)'/.exec(nextLine)
      if (match?.[1]) names.push(match[1])
    }
  }
  return names
}

function collectRegisteredToolNames(writeEnabled: boolean): string[] {
  const names: string[] = []
  const server = {
    tool: (name: string) => {
      names.push(name)
    },
  } as unknown as McpServer
  registerTools(server, {} as PresonusClientManager, { writeEnabled })
  return names
}

function collectRegisteredResourceNames(): string[] {
  const names: string[] = []
  const server = {
    resource: (name: string) => {
      names.push(name)
    },
  } as unknown as McpServer
  registerResources(server, {} as PresonusClientManager)
  return names
}

function runInventoryGenerator(): void {
  execSync('pnpm inventory', { cwd: ROOT, stdio: 'pipe' })
}

describe('Capability inventory snapshot', () => {
  const toolsSrc     = readFileSync(TOOLS_SRC, 'utf8')
  const resourcesSrc = readFileSync(RESOURCES_SRC, 'utf8')

  const declaredTools = extractNamesFromSource(toolsSrc, /server\.tool\(/)
  const declaredResources = extractNamesFromSource(resourcesSrc, /server\.resource\(/)
  const defaultRegisteredTools = collectRegisteredToolNames(false)
  const writeEnabledRegisteredTools = collectRegisteredToolNames(true)
  const registeredResources = collectRegisteredResourceNames()

  const writeEnabledSet = new Set(writeEnabledRegisteredTools)
  const disabledDeclaredTools = declaredTools.filter((n) => !writeEnabledSet.has(n))

  const APPROVED_WRITE_GATED = [
    'apply_change_set',
    'prepare_mute_change_set',
    'validate_change_set',
    'prepare_channel_rename_change_set',
    'prepare_sub_group_membership_change_set',
    'prepare_aux_assignment_change_set',
  ]

  const EXPERIMENTAL_DSP_DISABLED = [
    'propose_eq_change',
    'prepare_fader_change_set',
    'prepare_aux_send_change_set',
    'prepare_fat_channel_change_set',
  ]

  const FUTURE_DSP_PATTERN = /^(?:prepare|propose)_(?:eq|comp|gate|limiter)(?:_|$)/

  it('runs inventory generator successfully', () => {
    runInventoryGenerator()
    expect(existsSync(INVENTORY_PATH)).toBe(true)
    expect(existsSync(MATRIX_PATH)).toBe(true)
  }, 20_000)

  it('tools runtime registration has at least 34 default tools and 40 write-enabled tools', () => {
    expect(defaultRegisteredTools.length).toBeGreaterThanOrEqual(34)
    expect(writeEnabledRegisteredTools.length).toBeGreaterThanOrEqual(40)
  })

  it('resources runtime registration has at least 14 resources', () => {
    expect(registeredResources.length).toBeGreaterThanOrEqual(14)
  })

  it('capability-inventory.json exists (run `pnpm inventory` if this fails)', () => {
    expect(existsSync(INVENTORY_PATH),
      `docs/generated/capability-inventory.json not found.\n` +
      `Run: pnpm inventory\n` +
      `Then commit the generated file.`,
    ).toBe(true)
  })

  it('inventory tools match registered tools (drift check)', () => {
    if (!existsSync(INVENTORY_PATH)) return // Covered by the existence test

    const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as {
      tools: Array<{ name: string }>
      disabledTools: Array<{ name: string; availability: string }>
      resources: Array<{ name: string }>
    }

    const inventoryToolNames     = inventory.tools.map((t) => t.name).sort()
    const inventoryDisabledNames = inventory.disabledTools.map((t) => t.name).sort()
    const inventoryResourceNames = inventory.resources.map((r) => r.name).sort()
    const runtimeToolNames = [...writeEnabledRegisteredTools].sort()
    const runtimeResourceNames = [...registeredResources].sort()
    const expectedDisabled = [...disabledDeclaredTools].sort()

    expect(inventoryToolNames, `
Tool inventory drift detected.
In runtime registration but not in inventory: ${runtimeToolNames.filter((n) => !inventoryToolNames.includes(n)).join(', ') || 'none'}
In inventory but not in runtime registration: ${inventoryToolNames.filter((n) => !runtimeToolNames.includes(n)).join(', ') || 'none'}
Run: pnpm inventory
`).toEqual(runtimeToolNames)

    expect(inventoryDisabledNames, `
Disabled tool inventory drift detected.
Declared but not registered in runtime: ${expectedDisabled.filter((n) => !inventoryDisabledNames.includes(n)).join(', ') || 'none'}
Listed as disabled but not declared in source: ${inventoryDisabledNames.filter((n) => !expectedDisabled.includes(n)).join(', ') || 'none'}
Run: pnpm inventory
`).toEqual(expectedDisabled)

    expect(inventoryResourceNames, `
Resource inventory drift detected.
In runtime registration but not in inventory: ${runtimeResourceNames.filter((n) => !inventoryResourceNames.includes(n)).join(', ') || 'none'}
In inventory but not in runtime registration: ${inventoryResourceNames.filter((n) => !runtimeResourceNames.includes(n)).join(', ') || 'none'}
Run: pnpm inventory
`).toEqual(runtimeResourceNames)
  })

  it('approved write tools are write-gated in inventory', () => {
    if (!existsSync(INVENTORY_PATH)) return

    const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as {
      tools: Array<{ name: string; defaultAvailability: string }>
    }

    for (const toolName of APPROVED_WRITE_GATED) {
      const entry = inventory.tools.find((t) => t.name === toolName)
      expect(entry, `Tool '${toolName}' not found in inventory`).toBeDefined()
      expect(entry?.defaultAvailability,
        `Tool '${toolName}' should be write-gated`,
      ).toBe('write-gated')
    }
  })

  it('experimental DSP write helpers are not classified as write-gated available tools', () => {
    if (!existsSync(INVENTORY_PATH)) return

    const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as {
      tools: Array<{ name: string; defaultAvailability: string }>
      disabledTools: Array<{ name: string; availability: string }>
    }

    for (const toolName of EXPERIMENTAL_DSP_DISABLED) {
      const available = inventory.tools.find((t) => t.name === toolName)
      expect(available,
        `Tool '${toolName}' must not appear as available in inventory.tools`,
      ).toBeUndefined()

      const disabled = inventory.disabledTools.find((t) => t.name === toolName)
      expect(disabled,
        `Tool '${toolName}' must appear in inventory.disabledTools`,
      ).toBeDefined()
      expect(disabled?.availability,
        `Tool '${toolName}' must be marked not_registered`,
      ).toBe('not_registered')
    }
  })

  it('future DSP helpers matching prepare/propose eq|comp|gate|limiter are not available when unregistered', () => {
    if (!existsSync(INVENTORY_PATH)) return

    const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as {
      tools: Array<{ name: string }>
      disabledTools: Array<{ name: string; availability: string }>
    }

    const declaredFutureCandidates = disabledDeclaredTools.filter((n) => FUTURE_DSP_PATTERN.test(n))
    for (const toolName of declaredFutureCandidates) {
      expect(inventory.tools.some((t) => t.name === toolName),
        `Unregistered DSP helper '${toolName}' must not be in available tools`,
      ).toBe(false)
      const disabled = inventory.disabledTools.find((t) => t.name === toolName)
      expect(disabled,
        `Unregistered DSP helper '${toolName}' should be explicitly listed as disabled`,
      ).toBeDefined()
      expect(disabled?.availability).toBe('not_registered')
    }
  })

  it('capability matrix does not list disabled DSP helpers as write-gated available tools', () => {
    if (!existsSync(MATRIX_PATH)) return

    const matrix = readFileSync(MATRIX_PATH, 'utf8')

    for (const toolName of EXPERIMENTAL_DSP_DISABLED) {
      expect(matrix.includes(`| \`${toolName}\` | \`write-gated\` |`),
        `Matrix should not list '${toolName}' as write-gated available`,
      ).toBe(false)
      expect(matrix.includes(`| \`${toolName}\` | \`not_registered\` |`),
        `Matrix should list '${toolName}' in disabled/not-registered section`,
      ).toBe(true)
    }

    for (const toolName of APPROVED_WRITE_GATED) {
      expect(matrix.includes(`| \`${toolName}\` | \`write-gated\` |`),
        `Matrix should keep approved write tool '${toolName}' as write-gated`,
      ).toBe(true)
    }
  })

  it('no write-gated tools are listed as always-available', () => {
    if (!existsSync(INVENTORY_PATH)) return

    const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as {
      tools: Array<{ name: string; defaultAvailability: string; safetyClass: string }>
    }

    const writeTools = inventory.tools.filter(
      (t) => t.safetyClass === 'write-proposed' || t.safetyClass === 'write-applied',
    )
    for (const t of writeTools) {
      expect(t.defaultAvailability,
        `Write tool '${t.name}' (safety=${t.safetyClass}) must not be always-available`,
      ).toBe('write-gated')
    }
  })
})
