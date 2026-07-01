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

---

## 6. UNKNOWN type classification — ~11 issues

The CI report shows ~11 `UNKNOWN` type issues. These are issues caught by phase labels
(e.g., `phase:05-implementation`) but whose title prefix does not match the recognized
vocabulary (`StR`, `REQ-F`, `REQ-NF`, `ADR`, `ARC-C`, `QA-SC`, `TEST`).

The extended type vocabulary now recognizes: `IMP`, `DOC`, `HOUSEKEEPING`, `EPIC`, `BUG`, `PROBE`.

**Expected sources of UNKNOWN items:**

| Likely prefix | Issue type | Action |
|---|---|---|
| `EPIC-` | Epic tracking issue | Rename to `EPIC-NNN:` title or add `type:epic` label |
| `HOUSEKEEPING-` | Repo maintenance | Now recognized. No action needed if title starts with `HOUSEKEEPING`. |
| `BUG-` | Defect | Now recognized. No action needed if title starts with `BUG`. |
| `IMP-` | Implementation task | Now recognized. No action needed if title starts with `IMP`. |
| `DOC-` | Documentation task | Now recognized. No action needed if title starts with `DOC`. |
| Other | Unknown | Check the `requirements-traceability.generated.md` UNKNOWN table after running `pnpm traceability` |

**Action**: After running `pnpm traceability`, review the generated
`07-verification-validation/traceability/requirements-traceability.generated.md`
UNKNOWN section, then either:
1. Rename the issue title to add a recognized prefix, or
2. Add the correct `type:*` label (e.g., `type:housekeeping`, `type:epic`)

---

## 7. github-orphan-check.py label taxonomy fix

**Problem**: `scripts/github-orphan-check.py` was using legacy hyphenated labels
(`functional-requirement`, `non-functional`, etc.) which no longer exist in this repository.
The actual labels use colon-separated format (`type:requirement:functional`, etc.).
This caused the orphan check to silently find zero issues (all issues appeared to have no
requirement labels), making the check ineffective.

**Fix applied**: `REQUIREMENT_LABELS` in `github-orphan-check.py` updated to use current
colon-separated taxonomy as primary, with hyphenated labels retained as fallback.

---

## 8. Additional orphan @implements annotations found in domain and resource files

Beyond the `tools.ts` annotations listed in section 3, these additional files have
REQ-ID-only `@implements` annotations (no GitHub issue number):

| File | REQ-IDs |
|---|---|
| `packages/presonus-adapter/src/diagnostics.ts` | `REQ-F-DIAG-001`, `REQ-F-LINECHK-001` |
| `packages/presonus-mcp-server/src/resources.ts` | `REQ-F-FAT-001`, `REQ-F-MON-001` |
| `packages/presonus-domain/src/schemas/input-list.ts` | `REQ-F-INP-001`, `REQ-F-INP-002`, `REQ-F-INP-003` |
| `packages/presonus-domain/src/schemas/diagnosis.ts` | `REQ-F-DIAG-001` |
| `packages/presonus-domain/src/schemas/line-check.ts` | `REQ-F-LINECHK-001` |
| `scripts/generate-capability-matrix.ts` | `REQ-CAP-INV-001` |

**Action**: Same as section 3 — create GitHub issues and back-fill `#N` in each annotation.
`REQ-CAP-INV-001` is special: it is the capability inventory requirement and likely maps to
`#22 REQ-NF-002` or needs its own issue. Check the generated traceability matrix after running
`pnpm traceability`.

---

## 9. Capabilities without traceability (from capability inventory)

The following MCP tools/resources have `traceability: "missing"` in the capability inventory:

| Name | Kind | Required action |
|---|---|---|
| `validate_mixer_identity` | tool | Add `@implements #N REQ-ID` near the tool registration in `tools.ts`, or update `TOOL_META` in `generate-capability-matrix.ts` |
| `get_mixer_capabilities` | tool | Same as above |
| `analyze_line_check_step` | tool | Same as above (maps to `REQ-F-LINECHK-001`) |
| `diagnose_channel` | tool | Same as above (maps to `REQ-F-DIAG-001`) |
| `mixer-raw-state` | resource | Add traceability to `RESOURCE_META` in `generate-capability-matrix.ts` |

After adding traceability refs: run `pnpm inventory` and commit updated capability files,
then run `pnpm traceability` and commit updated traceability files.

---

## 10. How to run pnpm traceability

The `pnpm traceability` command generates committed traceability artifacts. It requires
`GITHUB_TOKEN` with `issues: read` permission.

```bash
# Local development
export GITHUB_TOKEN=ghp_your_token
export GITHUB_REPOSITORY=zarfld/presonus-studiolive-mcp
pnpm traceability

# Review the generated files
git diff 07-verification-validation/traceability/requirements-traceability.generated.*

# Commit when satisfied
git add 07-verification-validation/traceability/requirements-traceability.generated.*
git commit -m "chore(traceability): regenerate traceability matrix"
```

In CI (`ci-standards-compliance.yml`, `code-quality` job), the script runs automatically
with `GITHUB_TOKEN` from the workflow. If the committed artifacts differ from what the script
generates, the `git diff --exit-code` step fails — the developer must regenerate locally
and commit.

