#!/usr/bin/env tsx
/**
 * MCP Capability Inventory Generator
 *
 * Parses registered tool and resource names from source files, joins them with
 * manually-maintained metadata, and emits:
 *   - docs/capability-matrix.generated.md   (human-readable Markdown table)
 *   - docs/generated/capability-inventory.json  (machine-readable JSON)
 *
 * Usage:
 *   pnpm inventory
 *
 * The generated files must be committed so that the snapshot test and CI drift
 * check can detect when tool registrations change without a corresponding
 * inventory update.
 *
 * @implements REQ-CAP-INV-001 — generated inventory is the source of truth for
 *   capability documentation
 * Traces to: #22 REQ-NF-002, #15 REQ-F-001
 *
 * NOTE: Metadata below must be updated whenever a tool or resource is added,
 * removed, or its confidence classification changes.  The snapshot test will
 * catch drift in names; metadata accuracy depends on engineering discipline.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Source parsing helpers
// ---------------------------------------------------------------------------

function extractNamesFromSource(src: string, callPattern: RegExp): string[] {
  const names: string[] = []
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (callPattern.test(lines[i])) {
      const nextLine = lines[i + 1]?.trim() ?? ''
      const match = /^'([^']+)'/.exec(nextLine)
      if (match?.[1]) names.push(match[1])
    }
  }
  return names
}

// ---------------------------------------------------------------------------
// Metadata tables
// ---------------------------------------------------------------------------

/**
 * Confidence vocabulary (aligns with RoutingConfidenceSchema + ChangeSetConfidence):
 *   observed   = confirmed by probe diff-state on real hardware
 *   inferred   = key patterns observed; formula/mapping plausible, not probe-confirmed
 *   probe_required = must not be trusted until probe diff-state is run
 *   stub       = tool returns instructions only; Layer B placeholder
 *   planned    = requirement exists; implementation not yet present
 *   not_verifiable_with_current_adapter = permanently unobservable via current protocol
 *
 * Safety classes:
 *   read-only       = no mixer mutation
 *   diagnostic      = reads state and compares against expected; no mutation
 *   write-proposed  = generates a ProposedChangeSet but does NOT change hardware
 *   write-applied   = changes mixer hardware (requires writeEnabled=true + confirmation)
 *   stub            = returns probe instructions, no mixer interaction
 */

interface ToolMeta {
  defaultAvailability: 'always' | 'write-gated'
  confidence: string
  safetyClass: 'read-only' | 'diagnostic' | 'write-proposed' | 'write-applied' | 'stub'
  traceability: string
}

interface ResourceMeta {
  uriTemplate: string
  confidence: string
  traceability: string
}

const TOOL_META: Record<string, ToolMeta> = {
  // ── Discovery / identity ──────────────────────────────────────────────────
  discover_mixers: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: '#15 REQ-F-001',
  },
  refresh_mixer_state: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: '#15 REQ-F-001',
  },
  validate_mixer_identity: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#16 REQ-F-002',
  },
  get_mixer_capabilities: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: '#79 REQ-F-DIAG-004',
  },

  // ── Routing — Layer A (observable live state) ─────────────────────────────
  get_routing_graph: {
    defaultAvailability: 'always', confidence: 'probe_required',
    safetyClass: 'read-only', traceability: '#32 REQ-F-ROUT-002',
  },
  validate_input_routing: {
    defaultAvailability: 'always', confidence: 'not_verifiable_with_current_adapter',
    safetyClass: 'diagnostic', traceability: '#33 REQ-F-ROUT-003',
  },
  validate_stagebox_routing: {
    defaultAvailability: 'always', confidence: 'probe_required',
    safetyClass: 'diagnostic', traceability: '#34 REQ-F-ROUT-004',
  },
  diagnose_no_signal_routing: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'diagnostic', traceability: '#35 REQ-F-ROUT-005',
  },
  detect_possible_patch_swap: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'diagnostic', traceability: '#36 REQ-F-ROUT-006',
  },

  // ── Routing — Layer A implementations (HIL evidence 2026-07-01) ───────────
  get_input_routing: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'diagnostic',
    traceability: '#45 REQ-F-ROUT-011 — Observed on StudioLive 32SC (SD7E21010066), firmware 3.3.0.109659 (2026-07-01). Indices 0=Local, 1=Stage Box confirmed. Indices 2–3 labels probe_required. Other StudioLive III models unverified.',
  },
  validate_avb_routing: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic',
    traceability: '#45 REQ-F-ROUT-011 — Observed on StudioLive 32SC + StudioLive 32R, firmware 3.3.0.109659 (2026-07-01). Other StudioLive III models remain unverified.',
  },
  validate_output_routing: {
    defaultAvailability: 'always', confidence: 'probe_required',
    safetyClass: 'diagnostic', traceability: 'REQ-F-INP-002',
  },

  // ── Probe workflow ────────────────────────────────────────────────────────
  start_routing_probe: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: 'REQ-F-PROBE-001',
  },
  complete_routing_probe: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: 'REQ-F-PROBE-002',
  },

  // ── AUX / monitor ─────────────────────────────────────────────────────────
  get_aux_mix: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'read-only', traceability: '#41 REQ-F-AUX-002',
  },
  validate_monitor_requirements: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'diagnostic', traceability: '#42 REQ-F-AUX-003',
  },
  validate_aux_mix: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#43 REQ-F-AUX-004',
  },
  find_missing_monitor_sends: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#45 REQ-F-ROUT-011',
  },
  find_muted_monitor_sends: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#43 REQ-F-AUX-004',
  },
  find_hot_monitor_sends: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#44 REQ-F-AUX-005',
  },
  get_monitor_mix_layout: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'read-only', traceability: 'REQ-F-MON-001',
  },
  validate_stereo_monitor_pair: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'diagnostic', traceability: 'REQ-F-MON-002',
  },
  validate_monitor_mix_names: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: 'REQ-F-MON-003',
  },
  validate_output_patch_labels: {
    defaultAvailability: 'always', confidence: 'probe_required',
    safetyClass: 'diagnostic', traceability: 'REQ-F-ROUT-010',
  },

  // ── Channel diagnostics ───────────────────────────────────────────────────
  analyze_line_check_step: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: '#74 REQ-F-DIAG-002',
  },
  diagnose_channel: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#78 REQ-F-DIAG-001',
  },
  validate_channel_setup: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#45 REQ-F-ROUT-011',
  },
  check_required_setup: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: '#45 REQ-F-ROUT-011',
  },

  // ── Input list / patch sheet ──────────────────────────────────────────────
  validate_input_list_against_mixer: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'diagnostic', traceability: 'REQ-F-INP-001',
  },
  validate_patch_sheet: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: 'REQ-F-INP-002',
  },
  render_patch_sheet_data: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: 'REQ-F-INP-003',
  },

  // ── Fat Channel ───────────────────────────────────────────────────────────
  get_fat_channel: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'read-only', traceability: 'REQ-F-FAT-001',
  },
  validate_fat_channel_for_source: {
    defaultAvailability: 'always', confidence: 'inferred',
    safetyClass: 'diagnostic', traceability: 'REQ-F-FAT-002',
  },

  // ── Sub groups ────────────────────────────────────────────────────────────
  list_sub_groups: {
    defaultAvailability: 'always', confidence: 'observed',
    safetyClass: 'read-only', traceability: 'REQ-F-WRITE-005b #86',
  },

  // ── Write tools (registered only when writeEnabled=true) ─────────────────
  propose_eq_change: {
    defaultAvailability: 'write-gated', confidence: 'inferred',
    safetyClass: 'write-proposed',
    traceability: 'ADR-006 (EQ de-normalization formulas unverified — changeSetConfidence: guessed)',
  },
  apply_change_set: {
    defaultAvailability: 'write-gated', confidence: 'inferred',
    safetyClass: 'write-applied', traceability: 'ADR-006',
  },
  prepare_mute_change_set: {
    defaultAvailability: 'write-gated', confidence: 'observed',
    safetyClass: 'write-proposed', traceability: 'ADR-006 (mute key confirmed on 32SC)',
  },
  prepare_fader_change_set: {
    defaultAvailability: 'write-gated', confidence: 'inferred',
    safetyClass: 'write-proposed',
    traceability: 'ADR-006 (fader taper not probe-confirmed — changeSetConfidence: guessed)',
  },
  prepare_aux_send_change_set: {
    defaultAvailability: 'write-gated', confidence: 'inferred',
    safetyClass: 'write-proposed',
    traceability: 'ADR-006 (aux send key observed; de-normalization unverified — changeSetConfidence: inferred)',
  },
  prepare_fat_channel_change_set: {
    defaultAvailability: 'write-gated', confidence: 'inferred',
    safetyClass: 'write-proposed',
    traceability: 'ADR-006 (all formulas guessed — changeSetConfidence: guessed)',
  },
  validate_change_set: {
    defaultAvailability: 'write-gated', confidence: 'observed',
    safetyClass: 'write-proposed', traceability: 'ADR-006',
  },
  prepare_channel_rename_change_set: {
    defaultAvailability: 'write-gated', confidence: 'observed',
    safetyClass: 'write-proposed', traceability: 'REQ-F-WRITE-005a #86 (username key confirmed)',
  },
  prepare_sub_group_membership_change_set: {
    defaultAvailability: 'write-gated', confidence: 'observed',
    safetyClass: 'write-proposed', traceability: 'REQ-F-WRITE-005c #86 (sub1-4 keys confirmed)',
  },
  prepare_aux_assignment_change_set: {
    defaultAvailability: 'write-gated', confidence: 'observed',
    safetyClass: 'write-proposed', traceability: 'REQ-F-WRITE-005d #86 (assign_auxN key confirmed)',
  },
}

const RESOURCE_META: Record<string, ResourceMeta> = {
  mixers: {
    uriTemplate: 'presonus://mixers',
    confidence: 'observed', traceability: '#17 REQ-F-003',
  },
  'mixer-channels': {
    uriTemplate: 'presonus://mixer/{deviceId}/channels',
    confidence: 'observed', traceability: '#17 REQ-F-003',
  },
  'mixer-meters-summary': {
    uriTemplate: 'presonus://mixer/{deviceId}/meters/summary',
    confidence: 'observed', traceability: '#18 REQ-F-004',
  },
  'mixer-scene-current': {
    uriTemplate: 'presonus://mixer/{deviceId}/scene/current',
    confidence: 'observed', traceability: '#19 REQ-F-005',
  },
  'mixer-raw-state': {
    uriTemplate: 'presonus://mixer/{deviceId}/raw/state',
    confidence: 'observed', traceability: '#20 REQ-F-006',
  },
  'mixer-routing': {
    uriTemplate: 'presonus://mixer/{deviceId}/routing',
    confidence: 'inferred',
    traceability: '#32 REQ-F-ROUT-002 (parameterConfidence=inferred until AUX probe calibration)',
  },
  'mixer-routing-outputs': {
    uriTemplate: 'presonus://mixer/{deviceId}/routing/outputs',
    confidence: 'probe_required',
    traceability: '#32 REQ-F-ROUT-002 (sourceName=null until probe diff-state run)',
  },
  'mixer-auxes': {
    uriTemplate: 'presonus://mixer/{deviceId}/auxes',
    confidence: 'inferred',
    traceability: '#41 REQ-F-AUX-002 (prePost=unknown until hardware probed)',
  },
  'mixer-fx-sends': {
    uriTemplate: 'presonus://mixer/{deviceId}/fx-sends',
    confidence: 'inferred',
    traceability: 'ADR-008 Layer A (assign_FXA key pattern inferred)',
  },
  'mixer-monitor-routing': {
    uriTemplate: 'presonus://mixer/{deviceId}/monitor-routing',
    confidence: 'inferred', traceability: 'ADR-008 Layer A',
  },
  'mixer-fat-channel': {
    uriTemplate: 'presonus://mixer/{deviceId}/fat-channel/{channelId}',
    confidence: 'inferred',
    traceability: 'REQ-F-FAT-001 (parameter values guessed — parameterConfidence: guessed)',
  },
  'mixer-monitor-layout': {
    uriTemplate: 'presonus://mixer/{deviceId}/monitor-layout',
    confidence: 'inferred',
    traceability: 'REQ-F-MON-001 (pair inference confidence=inferred until operator-confirmed)',
  },
  'mixer-output-patch-labels': {
    uriTemplate: 'presonus://mixer/{deviceId}/output-patch/labels',
    confidence: 'probe_required',
    traceability: 'REQ-F-ROUT-010 (source names null until probe-routing diff --kind bus-to-output)',
  },
  'mixer-graph': {
    uriTemplate: 'presonus://mixer-graph/current',
    confidence: 'inferred', traceability: '#32 REQ-F-ROUT-002',
  },
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run(): void {
  const toolsSrc     = readFileSync(resolve(ROOT, 'packages/presonus-mcp-server/src/tools.ts'), 'utf8')
  const resourcesSrc = readFileSync(resolve(ROOT, 'packages/presonus-mcp-server/src/resources.ts'), 'utf8')

  const toolNames     = extractNamesFromSource(toolsSrc, /server\.tool\(/)
  const resourceNames = extractNamesFromSource(resourcesSrc, /server\.resource\(/)

  // ── Validate metadata coverage ───────────────────────────────────────────
  const missingToolMeta     = toolNames.filter((n) => !(n in TOOL_META))
  const missingResourceMeta = resourceNames.filter((n) => !(n in RESOURCE_META))
  if (missingToolMeta.length > 0) {
    console.warn(`[inventory] WARNING: No metadata for tools: ${missingToolMeta.join(', ')}`)
    console.warn('[inventory] Add entries to TOOL_META in scripts/generate-capability-matrix.ts')
  }
  if (missingResourceMeta.length > 0) {
    console.warn(`[inventory] WARNING: No metadata for resources: ${missingResourceMeta.join(', ')}`)
    console.warn('[inventory] Add entries to RESOURCE_META in scripts/generate-capability-matrix.ts')
  }

  // ── Build inventory structures ───────────────────────────────────────────
  const tools = toolNames.map((name) => {
    const meta = TOOL_META[name] ?? {
      defaultAvailability: 'always',
      confidence: 'missing',
      safetyClass: 'read-only' as const,
      traceability: 'missing',
    }
    return { name, kind: 'tool' as const, ...meta }
  })

  const resources = resourceNames.map((name) => {
    const meta = RESOURCE_META[name] ?? {
      uriTemplate: 'unknown',
      confidence: 'missing',
      traceability: 'missing',
    }
    return { name, kind: 'resource' as const, safetyClass: 'read-only' as const, ...meta }
  })

  const inventory = {
    generatedBy: 'scripts/generate-capability-matrix.ts',
    note: 'Auto-generated. Do not edit manually. Run `pnpm inventory` to regenerate.',
    summary: {
      totalTools: tools.length,
      alwaysAvailableTools: tools.filter((t) => t.defaultAvailability === 'always').length,
      writeGatedTools: tools.filter((t) => t.defaultAvailability === 'write-gated').length,
      totalResources: resources.length,
    },
    tools,
    resources,
  }

  // ── Write JSON ────────────────────────────────────────────────────────────
  const jsonDir = resolve(ROOT, 'docs/generated')
  mkdirSync(jsonDir, { recursive: true })
  const jsonPath = resolve(jsonDir, 'capability-inventory.json')
  writeFileSync(jsonPath, JSON.stringify(inventory, null, 2) + '\n', 'utf8')
  console.log(`[inventory] Wrote: ${jsonPath}`)

  // ── Write Markdown ────────────────────────────────────────────────────────
  const mdPath = resolve(ROOT, 'docs/capability-matrix.generated.md')
  writeFileSync(mdPath, buildMarkdown(inventory), 'utf8')
  console.log(`[inventory] Wrote: ${mdPath}`)

  // Summary
  console.log(`[inventory] ${inventory.summary.totalTools} tools ` +
    `(${inventory.summary.alwaysAvailableTools} always-available, ` +
    `${inventory.summary.writeGatedTools} write-gated), ` +
    `${inventory.summary.totalResources} resources`)
}

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

function buildMarkdown(inventory: ReturnType<typeof buildInventory>): string {
  const { summary, tools, resources } = inventory

  const toolRows = tools.map((t) => {
    const avail = t.defaultAvailability === 'write-gated' ? '`write-gated`' : '`always`'
    return `| \`${t.name}\` | ${avail} | \`${t.confidence}\` | \`${t.safetyClass}\` | ${t.traceability} |`
  })

  const resourceRows = resources.map((r) => {
    return `| \`${r.name}\` | \`${r.uriTemplate}\` | \`${r.confidence}\` | ${r.traceability} |`
  })

  return `# MCP Capability Matrix

> **Auto-generated** by \`pnpm inventory\`. Do not edit manually — run \`pnpm inventory\` to regenerate.

## Summary

| Metric | Count |
|---|---|
| Always-available tools | ${summary.alwaysAvailableTools} |
| Write-gated tools (require \`writeEnabled: true\`) | ${summary.writeGatedTools} |
| Total tools | ${summary.totalTools} |
| Total resources | ${summary.totalResources} |

> **Note**: Write-gated tools are NOT registered in the default configuration
> (\`writeEnabled: false\`). They require explicit opt-in. See \`AGENTS.addendum.md\` rule #5.

## Confidence vocabulary

| Value | Meaning |
|---|---|
| \`observed\` | Confirmed by probe diff-state on real hardware |
| \`inferred\` | Key patterns observed; formula/mapping plausible, not probe-confirmed |
| \`probe_required\` | Must not be trusted until probe diff-state is run |
| \`stub\` | Tool returns probe instructions only; Layer B placeholder |
| \`not_verifiable_with_current_adapter\` | Permanently unobservable via current protocol |
| \`planned\` | Requirement exists; implementation not yet present |

## Tools

| Name | Availability | Confidence | Safety class | Traceability |
|---|---|---|---|---|
${toolRows.join('\n')}

## Resources

| Name | URI template | Confidence | Traceability |
|---|---|---|---|
${resourceRows.join('\n')}
`
}

// Type hack to allow reuse
function buildInventory(inventory: {
  generatedBy: string; note: string; summary: Record<string, number>;
  tools: Array<{ name: string; defaultAvailability: string; confidence: string; safetyClass: string; traceability: string }>
  resources: Array<{ name: string; uriTemplate: string; confidence: string; traceability: string }>
}) { return inventory }

run()
