# Traceability Enforcement

## Purpose

Use this skill to enforce the repository workflow:

```text
requirement -> architecture/design -> implementation -> tests -> HIL evidence -> capability claim
```

Agents must not jump directly into code and then mark work complete.

## Applies to

- new features
- changed MCP tools
- routing work
- Fat Channel calibration
- write tools
- docs claiming support
- issue closure
- release readiness
- generated inventories

## Required trace objects

Each non-trivial feature must have traceability across:

| Trace object | Required for |
|---|---|
| GitHub issue | all user-visible feature work |
| requirement statement | all feature work |
| design note | routing, writes, Fat Channel, protocol mapping |
| implementation files | all code changes |
| unit tests | all deterministic logic |
| integration/tool tests | all MCP tools |
| HIL probe/evidence | hardware behavior |
| capability matrix entry | all MCP tools/features |
| release checklist entry | release-relevant work |

## Required workflow

1. Identify the feature or claim being touched.
2. Find or create the issue.
3. State the requirement in one sentence.
4. State the design approach before code changes.
5. Identify impacted files.
6. Identify required tests.
7. Identify whether HIL evidence is required.
8. Implement only after steps 1-7 are clear.
9. Update capability and release docs.
10. Produce a traceability table.

## Required output

Every run must produce:

| Feature | Issue | Requirement | Design | Code | Unit tests | Tool tests | HIL | Capability matrix | Status |
|---|---|---|---|---|---|---|---|---|---|

Allowed status values:

```text
complete
implemented_unverified
blocked_by_hil
blocked_by_design
stub_only
not_supported
```

## Minimum requirement format

Use concise requirements:

```text
REQ-ROUTING-001: The MCP server shall report, per input channel, whether the channel source is local analog, AVB/stagebox, or unknown, including confidence and raw adapter evidence.
```

## Minimum design note format

```markdown
# Design: <feature>

## Requirement
<REQ-ID and text>

## Current behavior
What exists now.

## Target behavior
What should change.

## Data model
Request/response/schema changes.

## Adapter impact
Raw fields and API calls.

## Safety impact
Read-only/write/routing/Fat Channel risk.

## Test plan
Unit, tool, integration, HIL.

## Capability impact
Expected state transition.
```

## Completion rule

A feature cannot be marked complete if any required trace item is missing.

Examples:

- Routing implementation without HIL evidence: `implemented_unverified`, not `complete`.
- Fat Channel formula from guesswork: `inferred`, not `complete`.
- Write tool with mocked tests only: `implemented_unverified`, not `observed`.
- Tool handler returning `probe_required`: `stub_only` or `blocked_by_hil`.

## Issue update rule

When a feature changes state, update the issue with:

```markdown
## Traceability update

- Requirement:
- Design:
- Implementation:
- Tests:
- HIL evidence:
- Capability matrix:
- Remaining blockers:
```

## Acceptance criteria

This skill is satisfied only when:

- each user-visible change has a trace row,
- all missing evidence is explicitly shown,
- capability state matches evidence,
- incomplete work is not closed as done,
- open issues reflect real remaining work.

## Stop conditions

Stop and report a blocker if:

- no requirement exists for a non-trivial feature,
- no HIL plan exists for hardware behavior,
- tests do not cover the behavior being claimed,
- docs claim support broader than evidence,
- an issue is being closed while capability remains `stub`, `probe_required`, or `inferred`.
