# Issue Traceability Reconciliation

This document lists manual issue actions required to reconcile GitHub issue
state with the current implementation. Use this when GitHub issue tooling is
not available in-session, or as a checklist for the next maintenance sprint.

Generated: 2026-07-01

---

## Actions required

### 1. Close issue #84 — FlexMix bus mode classification (REQ-F-FLEXMIX-001)

**Current state**: Issue appears open/backlog.  
**Actual state**: Fully implemented and test-verified.

**Evidence**:
- Implementation: `packages/presonus-adapter/src/state-mapper.ts` lines 779–920
  (`extractFlexMixBusTopology` with `@implements #84 REQ-F-FLEXMIX-001`)
- Test: `packages/presonus-adapter/src/__tests__/flexmix-routing.test.ts`
  (`@verifies REQ-F-FLEXMIX-001 (#84)`)
- HIL test: `packages/presonus-adapter/src/__tests__/flexmix-routing.hil.test.ts`

**Action**: Add comment to issue #84 linking the implementation and test, then close or
label as `status:implemented`. If additional HIL verification is desired before
full closure, label as `status:implemented-unverified`.

---

### 2. Close issue #85 — Fixed subgroup extraction (REQ-F-FIXEDSUB-001)

**Current state**: Issue appears open/backlog.  
**Actual state**: Fully implemented and test-verified.

**Evidence**:
- Implementation: `packages/presonus-adapter/src/state-mapper.ts`
  (`extractFixedSubGroups`, `@implements` annotation)
- Test: `packages/presonus-adapter/src/__tests__/fixed-subgroups.test.ts`
  (`@verifies REQ-F-FIXEDSUB-001 (#85)`)
- HIL test: `packages/presonus-adapter/src/__tests__/fixed-subgroups.hil.test.ts`

**Action**: Add comment to issue #85 linking the implementation and test, then close or
label as `status:implemented`.

---

### 3. Create GitHub issues for orphan @implements annotations

The following `@implements` annotations in `packages/presonus-mcp-server/src/tools.ts`
reference requirements that do not have GitHub issue numbers:

| Annotation in source | Requirement ID | Suggested issue title |
|---|---|---|
| `// @implements REQ-F-PROBE-001` | REQ-F-PROBE-001 | REQ-F-PROBE-001: Layer B promotion — capture baseline state for probe workflow |
| `// @implements REQ-F-PROBE-002` | REQ-F-PROBE-002 | REQ-F-PROBE-002: Layer B promotion — diff and return changed routing keys |
| `// @implements REQ-F-INP-001` | REQ-F-INP-001 | REQ-F-INP-001: Validate input list against mixer channel state |
| `// @implements REQ-F-INP-002` | REQ-F-INP-002 | REQ-F-INP-002: Validate and render patch sheet |
| `// @implements REQ-F-INP-003` | REQ-F-INP-003 | REQ-F-INP-003: Render patch sheet data for printing |
| `// @implements REQ-F-MON-001` | REQ-F-MON-001 | REQ-F-MON-001: Get monitor mix layout (stereo pair inference) |
| `// @implements REQ-F-MON-002` | REQ-F-MON-002 | REQ-F-MON-002: Validate stereo monitor pair consistency |
| `// @implements REQ-F-MON-003` | REQ-F-MON-003 | REQ-F-MON-003: Validate monitor mix names against rider |
| `// @implements REQ-F-ROUT-010` | REQ-F-ROUT-010 | REQ-F-ROUT-010: Validate output patch labels |
| `// @implements REQ-F-FAT-001` | REQ-F-FAT-001 | REQ-F-FAT-001: Get Fat Channel DSP state per channel |
| `// @implements REQ-F-FAT-002` | REQ-F-FAT-002 | REQ-F-FAT-002: Validate Fat Channel settings for source type |

**Action for each**:
1. Create a GitHub issue with label `type:requirement:functional`, `phase:05-implementation`
2. Include acceptance criteria matching the tool description
3. Add traceability: `Traces to: #1` (or appropriate StR issue)
4. Back-fill the issue number into the `@implements` annotation in tools.ts

---

### 4. Issue #72 — Split requirements from implementation tasks

Issue #72 (HOUSEKEEPING-004: Split requirements from implementation tasks) identifies
that broad REQ issues carry implementation progress, test status, and future work in one place.

**Action**: Use issue #72's pattern to split each large REQ issue into:
- `REQ-*` issue: the requirement only (acceptance criteria, unchanged)
- `IMP-*` issue: the implementation task (code change, links to REQ)
- `TEST-*` issue: the verification task (test coverage, links to REQ)

Per the `issue-traceability-remediation` skill, a future agent must be able to answer:
1. What requirement exists?
2. What design/ADR governs it?
3. What code implements it?
4. What tests verify it?
5. What remains blocked, deferred, or unverified?

---

### 5. Add @verifies annotations to existing tests

Most unit tests do not have `@verifies #N` annotations linking them back to GitHub issues.
Only 2 tests have these annotations: `flexmix-routing.test.ts` and `fixed-subgroups.test.ts`.

**Action**: Add `@verifies #N` annotations to test files where the corresponding
requirement issue exists. Priority order:

| Test file | Suggested @verifies annotation |
|---|---|
| `routing-confidence.test.ts` | `@verifies #38 REQ-F-ROUT-008` (RoutingKind + MixerRoute) |
| `routing.test.ts` | `@verifies #38 REQ-F-ROUT-008` |
| `state-mapper.test.ts` | `@verifies #15 REQ-F-001` (discovery + state) |
| `aux-mix.test.ts` | `@verifies #41 REQ-F-AUX-002` |
| `routing-layer-b-confidence.test.ts` | `@verifies REQ-F-INP-001, REQ-F-PROBE-001` |
| `tool-inventory.snapshot.test.ts` | `@verifies REQ-CAP-INV-001, #22 REQ-NF-002` |

---

## Summary of state as of 2026-07-01

| Item | State |
|---|---|
| Issue #84 (FlexMix) | Needs close/label — implemented and tested |
| Issue #85 (Fixed subgroups) | Needs close/label — implemented and tested |
| 11 orphan @implements refs | Needs corresponding GitHub issues |
| @verifies coverage | 2/40+ test files — poor coverage, needs remediation |
| Issue #72 (split requirements) | Open — use as template for future splits |
