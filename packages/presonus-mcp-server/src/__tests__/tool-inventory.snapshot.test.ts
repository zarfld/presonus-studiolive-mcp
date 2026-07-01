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
 * @implements REQ-CAP-INV-001 — generated inventory must not drift from source
 * Traces to: #22 REQ-NF-002 (zero write tools in default config),
 *            #15 REQ-F-001 (auto-discover mixers)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Workspace root — four levels up from packages/presonus-mcp-server/src/__tests__/
const ROOT = resolve(__dirname, '../../../../')
const TOOLS_SRC   = resolve(ROOT, 'packages/presonus-mcp-server/src/tools.ts')
const RESOURCES_SRC = resolve(ROOT, 'packages/presonus-mcp-server/src/resources.ts')
const INVENTORY_PATH = resolve(ROOT, 'docs/generated/capability-inventory.json')

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

describe('Capability inventory snapshot', () => {
  const toolsSrc     = readFileSync(TOOLS_SRC, 'utf8')
  const resourcesSrc = readFileSync(RESOURCES_SRC, 'utf8')

  const registeredTools     = extractNamesFromSource(toolsSrc, /server\.tool\(/)
  const registeredResources = extractNamesFromSource(resourcesSrc, /server\.resource\(/)

  it('tools.ts has at least 34 always-available tools', () => {
    // 34 read-only + 10 write-gated = 44 total; minimum guard for regressions
    expect(registeredTools.length).toBeGreaterThanOrEqual(34)
  })

  it('resources.ts has at least 14 resources', () => {
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
      resources: Array<{ name: string }>
    }

    const inventoryToolNames     = inventory.tools.map((t) => t.name).sort()
    const inventoryResourceNames = inventory.resources.map((r) => r.name).sort()
    const srcToolNames     = [...registeredTools].sort()
    const srcResourceNames = [...registeredResources].sort()

    expect(inventoryToolNames, `
Tool inventory drift detected.
In source but not in inventory: ${srcToolNames.filter((n) => !inventoryToolNames.includes(n)).join(', ') || 'none'}
In inventory but not in source: ${inventoryToolNames.filter((n) => !srcToolNames.includes(n)).join(', ') || 'none'}
Run: pnpm inventory
`).toEqual(srcToolNames)

    expect(inventoryResourceNames, `
Resource inventory drift detected.
In source but not in inventory: ${srcResourceNames.filter((n) => !inventoryResourceNames.includes(n)).join(', ') || 'none'}
In inventory but not in source: ${inventoryResourceNames.filter((n) => !srcResourceNames.includes(n)).join(', ') || 'none'}
Run: pnpm inventory
`).toEqual(srcResourceNames)
  })

  it('write-gated tools are correctly identified in inventory', () => {
    if (!existsSync(INVENTORY_PATH)) return

    const inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as {
      tools: Array<{ name: string; defaultAvailability: string }>
    }

    const EXPECTED_WRITE_GATED = [
      'propose_eq_change',
      'apply_change_set',
      'prepare_mute_change_set',
      'prepare_fader_change_set',
      'prepare_aux_send_change_set',
      'prepare_fat_channel_change_set',
      'validate_change_set',
      'prepare_channel_rename_change_set',
      'prepare_sub_group_membership_change_set',
      'prepare_aux_assignment_change_set',
    ]

    for (const toolName of EXPECTED_WRITE_GATED) {
      const entry = inventory.tools.find((t) => t.name === toolName)
      expect(entry, `Tool '${toolName}' not found in inventory`).toBeDefined()
      expect(entry?.defaultAvailability,
        `Tool '${toolName}' should be write-gated`,
      ).toBe('write-gated')
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
