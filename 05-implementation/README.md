# Phase 05 — Implementation

**Standard**: ISO/IEC/IEEE 12207:2017 (Implementation Process)
**Status**: In Progress
**Phases prerequisite to this**: Phase 01 ✅ Phase 02 ✅ Phase 03 ✅ Phase 04 ✅

---

## Source Code Location

Source code for this project lives in **`packages/`** at the repository root. This is a pnpm workspace monorepo (ADR-003 #8); the implementation is not nested under `05-implementation/src/` but at the repo root per the monorepo convention.

```
presonus-studiolive-mcp/   ← repo root
  packages/
    presonus-domain/       ← @presonus-mcp/domain (#11 ARC-C-001)
    presonus-adapter/      ← @presonus-mcp/adapter (#12 ARC-C-002)
    presonus-inspector/    ← @presonus-mcp/inspector (#13 ARC-C-003)
    presonus-mcp-server/   ← @presonus-mcp/server (#14 ARC-C-004)
```

Phase 05 instructions and traceability requirements apply to all files in `packages/`.

---

## XP Practices Applied

- **TDD (Red-Green-Refactor)**: All tests written before or alongside implementation
- **Continuous Integration**: `pnpm build && pnpm test` must pass on every commit
- **Simple Design**: YAGNI — no speculative features; implement only what a failing test requires
- **Collective Ownership**: All packages share one monorepo; anyone can improve any package

---

## Implementation Status

| Package | Status | Gate blocker |
|---------|--------|-------------|
| `presonus-domain` | Scaffold complete; tests written | `pnpm test` must pass |
| `presonus-adapter` | Scaffold complete; unit tests written | `pnpm install` + `pnpm build` must succeed |
| `presonus-inspector` | Scaffold complete | `pnpm probe:dev discover` on physical hardware |
| `presonus-mcp-server` | Scaffold started; resources/tools stub needed | `pnpm build` + MCP Inspector connects |

---

## First TDD Milestones (in order)

1. `pnpm install` — all dependencies resolved, no version conflicts
2. `pnpm build` — TypeScript compiles with zero errors across all 4 packages
3. `pnpm test` — all unit tests (domain + adapter) pass on fixture data
4. `pnpm probe:dev discover` — finds physical 32SC or 32R on network (HIL milestone)
5. `pnpm probe:dev dump-state --device <ip>` — saves valid JSON to `captures/` (REQ-F-006 #20)
6. State key map updated in `docs/generated/state-key-map.md` from captures
7. Adapter state mapper updated and re-tested with real fixture data
8. MCP Inspector connects to server and lists resources + tools

---

## Traceability: Code → Requirements

Every source file MUST reference implementing requirements via JSDoc. See Phase 05 instructions for exact format.

Example already in place:
```typescript
/**
 * @implements #15 REQ-F-001: Auto-discover StudioLive III mixers
 * @architecture #12 ARC-C-002: presonus-adapter package
 */
```

---

## Running the Build

```bash
# Install all workspace dependencies
pnpm install

# Build all packages (respects project references)
pnpm build

# Run all unit tests
pnpm test

# Run probe CLI (requires build first OR use dev mode with tsx)
pnpm probe:dev discover
pnpm probe:dev dump-state --device <ip>

# Start MCP server (stdio mode)
pnpm mcp:server:dev
```
