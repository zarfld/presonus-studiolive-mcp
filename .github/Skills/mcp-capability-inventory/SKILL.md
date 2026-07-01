---
name: mcp-capability-inventory
description: Generate and validate the authoritative inventory of MCP tools/resources, write gating, input schemas, output confidence, and documentation claims.
---

# MCP capability inventory

## Use this skill when

Use this skill when:

- adding, removing, renaming, or changing an MCP tool or resource
- editing README tool/resource counts
- changing `writeEnabled` / `controlEnabled` behavior
- changing route, AUX, Fat Channel, patch-sheet, line-check, or diagnostic tools
- reconciling implementation with docs/issues

## Goal

Make the registered MCP surface the single source of truth. Documentation may summarize capability, but it must not manually invent counts or imply more support than the registered tools/resources provide.

## Source files

Primary implementation files:

- `packages/presonus-mcp-server/src/tools.ts`
- `packages/presonus-mcp-server/src/resources.ts`

Supporting contract files:

- `packages/presonus-domain/src/**`
- `packages/presonus-adapter/src/**`
- `README.md`
- `docs/**`
- relevant GitHub issues and ADRs

## Required inventory fields

For every MCP tool:

| Field | Required value |
|---|---|
| `name` | MCP tool name exactly as registered |
| `kind` | `tool` |
| `defaultAvailability` | `default` or `write-enabled-only` |
| `safetyClass` | `read-only`, `proposal-only`, `write-gated`, or `unsafe/not-allowed` |
| `inputSchemaSummary` | short schema description |
| `outputSummary` | short result description |
| `confidence` | `verified`, `implemented-unverified`, `inferred`, `probe-required`, `stub`, `planned`, or `unsupported` |
| `sourceFile` | implementation file and approximate line/function |
| `traceability` | issue/ADR references from comments or docs |
| `docsMentioned` | yes/no; README/docs location if present |

For every MCP resource:

| Field | Required value |
|---|---|
| `name` | internal resource registration name |
| `uriTemplate` | exact URI or template |
| `kind` | `resource` |
| `safetyClass` | usually `read-only` |
| `outputSummary` | JSON payload summary |
| `confidence` | same confidence vocabulary as tools |
| `sourceFile` | implementation file and approximate line/function |
| `traceability` | issue/ADR references |
| `docsMentioned` | yes/no |

## Procedure

1. **Parse the registered surface.**
   - Enumerate `server.tool(` calls in `tools.ts`.
   - Enumerate `server.resource(` calls in `resources.ts`.
   - Detect conditional registration blocks, especially `writeEnabled`.

2. **Classify safety.**
   - Read-only tools/resources: no mixer mutation.
   - Proposal-only tools: generate a `ProposedChangeSet` but do not change hardware.
   - Write-gated tools: change mixer only when explicitly enabled and confirmed.
   - Unsafe/not-allowed: must not be registered.

3. **Classify confidence.**
   - `verified`: test/probe/HIL evidence exists.
   - `implemented-unverified`: code exists but no hardware evidence.
   - `inferred`: value is inferred from live state mapping.
   - `probe-required`: result depends on probe-diff/session.
   - `stub`: intentionally returns instructions or `not_verifiable`.
   - `planned`: docs/issues only.
   - `unsupported`: deliberately out of scope.

4. **Generate docs.**
   - Write `docs/mcp-capability-matrix.generated.md`.
   - Include separate sections for default read-only surface and write-enabled surface.
   - Include a warning banner if any capability is `stub`, `inferred`, or `probe-required`.

5. **Check README claims against generated inventory.**
   - README counts must be derived from the generated inventory.
   - If README says “22 read-only tools”, the inventory must show exactly 22 default read-only tools.
   - If README says “+2 write tools”, inventory must show exactly 2 write-enabled-only tools.
   - Any conflict is a failing condition.

6. **Add or update tests.**
   - Add a snapshot test that fails when registered tools/resources change without updating the generated inventory.
   - Add a test that proves write tools are not registered in default config.
   - Add a test that proves write tools are registered only when write mode is enabled.

## Minimal generated table format

```markdown
# MCP capability matrix

Generated from `packages/presonus-mcp-server/src/tools.ts` and `resources.ts`.
Do not edit counts manually.

## Summary

| Surface | Count |
|---|---:|
| Default read-only tools | <n> |
| Write-enabled-only tools | <n> |
| Resources | <n> |

## Tools

| Tool | Availability | Safety | Confidence | Summary | Trace |
|---|---|---|---|---|---|
| discover_mixers | default | read-only | verified | Discover StudioLive mixers | #15 |

## Resources

| Resource | URI | Safety | Confidence | Summary | Trace |
|---|---|---|---|---|---|
| mixers | presonus://mixers | read-only | verified | Connected mixer identities | #17 |
```

## Acceptance criteria

- Tool/resource counts are generated or mechanically verified from code.
- README no longer contains contradictory manual counts.
- Default mode has zero hardware-mutating tools.
- Write-enabled tools are clearly separated and named.
- Each routing-related capability includes confidence metadata.
- CI fails when the registered MCP surface changes without an inventory update.

## Failure modes to avoid

- Counting tools by reading README.
- Treating a schema as an implemented tool.
- Counting write-enabled-only tools as default tools.
- Describing a probe-required routing tool as validated routing.
- Leaving generated documentation stale after a tool rename.
