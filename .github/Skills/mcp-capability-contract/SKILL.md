# MCP Capability Contract

## Purpose

Use this skill whenever an MCP tool, resource, adapter method, README claim, capability matrix entry, or release checklist item is added, changed, reviewed, or marked complete.

This skill prevents the repository from overstating support. A tool that exists in code is not automatically supported. A tool is supported only when implementation, tests, evidence, and documentation agree.

## Applies to

- MCP tool inventory
- `docs/capability-matrix.generated.md`
- `docs/release-readiness-checklist.md`
- `README.md`
- package metadata and examples
- GitHub issues and milestones
- adapter/domain/server packages

## Capability states

Use exactly one of these states for each tool or feature.

| State | Meaning |
|---|---|
| `observed` | Verified against real hardware or a captured real device fixture. |
| `implemented_unverified` | Real implementation exists, but no HIL or real-device fixture proves correctness. |
| `inferred` | Behavior is derived from indirect evidence or a guessed mapping/formula. |
| `probe_required` | The implementation cannot be completed or trusted without a defined hardware probe. |
| `stub` | User-visible tool exists, but it intentionally returns placeholder/non-verifiable data. |
| `planned` | Not implemented and not exposed as functional. |
| `not_supported` | Deliberately out of scope. |
| `deprecated` | Former capability that should not be used. |

Do not invent alternative labels.

## Hard rules

1. Never mark a tool as `observed` without naming the hardware model, firmware version, evidence artifact, and test/probe used.
2. Never call a user-visible tool "supported" if the code path returns placeholders, empty objects, guessed values, or `not_verifiable`.
3. Never hide uncertainty. If a value is guessed, the response schema and docs must say so.
4. Never let README claims be broader than the capability matrix.
5. Never upgrade a state because a test was added unless the test asserts the real behavior being claimed.
6. Any write-capable tool must also satisfy the `mcp-write-safety-gate` skill before it can be marked anything stronger than `implemented_unverified`.

## Required review workflow

1. List all tools/features affected by the change.
2. For each affected item, inspect:
   - implementation path,
   - test coverage,
   - HIL/probe evidence,
   - docs,
   - user-facing descriptions.
3. Assign exactly one capability state.
4. Check whether the README or tool description overstates the state.
5. Update traceability:
   - issue,
   - requirement/design note if present,
   - code path,
   - unit/integration test,
   - HIL evidence if applicable,
   - capability matrix,
   - release checklist.
6. Emit a capability delta table.

## Required output

Every run of this skill must produce this table:

| Capability | Previous state | New state | Evidence | User-facing claim OK? | Required follow-up |
|---|---|---|---|---|---|

Evidence must be specific. Do not write vague phrases like "tested" or "works".

Good evidence examples:

- `HIL: StudioLive 32SC fw 3.3.0.109659, probe-output-source-name-map, dump docs/hil/2026-07-01-output-map.json`
- `Fixture: tests/fixtures/32sc-state-routing-local.json`
- `Unit: packages/presonus-domain/src/routing.test.ts`

Bad evidence examples:

- `implemented`
- `manual check`
- `agent verified`
- `looks correct`

## Required file updates

When capability state changes, update all applicable files:

- `docs/capability-matrix.generated.md`
- `docs/release-readiness-checklist.md`
- `README.md`
- tool descriptions in the MCP server package
- related tests or fixtures
- related GitHub issue status or checklist

If a capability remains uncertain, add or update a probe plan instead of pretending completion.

## Acceptance criteria

A feature may be called supported only if all are true:

- implementation exists,
- unit tests exist,
- behavior is validated with HIL evidence or real captured fixtures,
- failure behavior is documented,
- confidence/capability state is documented,
- README and tool descriptions match the actual state,
- traceability links exist.

## Stop conditions

Stop and report a blocker if:

- the tool is write-capable and lacks write safety gates,
- the feature depends on real mixer behavior but no HIL evidence or fixture exists,
- a tool response uses raw indices that are not semantically mapped,
- a public claim cannot be traced to code and evidence,
- a capability matrix entry contradicts implementation reality.

## Common mistakes to avoid

- Treating "tool exists" as "tool works".
- Treating "unit test passes" as "hardware behavior observed".
- Treating a raw routing index as a meaningful routing name.
- Marking inferred Fat Channel formulas as verified.
- Leaving an MCP tool visible while its implementation is only a placeholder.
