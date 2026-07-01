You are working inside the already-loaded repository `zarfld/presonus-studiolive-mcp`.

Primary objective: close the most critical unfinished-code, placeholder, and stub-implementation gaps without bypassing the repository-defined lifecycle process. You must use TDD. HIL validation must use real connected PreSonus StudioLive hardware, not mocks or assumptions.

## Non-negotiable rules

1. Do not start implementation immediately.
2. First discover and follow the repository’s defined lifecycle/process exactly.
3. Use the repository workflow in this order unless the repo defines a stricter one:

   * requirements
   * architecture impact
   * design
   * tests
   * implementation
   * HIL validation
   * documentation/capability matrix update
   * release-readiness/traceability update
4. Use TDD:

   * write or update failing tests first;
   * prove they fail for the current implementation;
   * implement the smallest change required;
   * prove tests pass;
   * then perform HIL validation with real mixers.
5. Do not claim a feature is supported unless there is evidence:

   * unit/integration test evidence;
   * real hardware-in-loop evidence where mixer behavior is involved;
   * documented model and firmware metadata;
   * updated capability classification.
6. Do not replace unknown behavior with guessed logic.
7. Do not convert stubs into fake success responses.
8. Do not mark `stub`, `probe_required`, `inferred`, or `not_verifiable` tools as complete unless the evidence threshold is met.
9. Write tools must remain disabled by default and safety-gated.
10. If real hardware is unavailable or not detected, stop before HIL-dependent implementation claims. You may still add failing tests, probe plans, documentation, and safe scaffolding, but you must not mark HIL-dependent work as observed or supported.

## Skills to use

If these skills exist in the repo, use them explicitly and follow their contracts:

* `.github/skills/stub-placeholder-elimination/SKILL.md`
* `.github/skills/mcp-capability-contract/SKILL.md`
* `.github/skills/routing-reverse-engineering/SKILL.md`
* `.github/skills/hil-probe-design/SKILL.md`
* `.github/skills/mcp-write-safety-gate/SKILL.md`
* `.github/skills/fat-channel-calibration/SKILL.md`
* `.github/skills/traceability-enforcement/SKILL.md`
* `.github/skills/release-readiness-audit/SKILL.md`
* `.github/skills/dependency-ci-hygiene/SKILL.md`
* `.github/skills/github-housekeeping/SKILL.md`

If the skills are not present, create a short note in your plan and proceed by applying the same contracts manually.

## Initial repository reconnaissance

Before changing code, inspect at least:

* `README.md`
* `package.json`
* workspace package manifests
* `.github/copilot-instructions.md`, if present
* `AGENTS.md`, if present
* `CONTRIBUTING.md`, if present
* `docs/`
* `docs/capability-matrix.generated.md`
* `docs/release-readiness-checklist.md`
* existing tests
* HIL/probe scripts
* MCP tool registration and handlers
* adapter/domain boundaries

Produce a short lifecycle-compliance note before editing:

```markdown
## Lifecycle compliance note

Detected repo process:
- ...

Required artifacts before code:
- ...

TDD strategy:
- ...

HIL strategy:
- ...

Risk controls:
- ...
```

## Task focus

Focus on critical unfinished/stub/placeholder gaps, especially:

1. `get_input_routing`
2. `validate_avb_routing`
3. output routing source-name mapping
4. Fat Channel inferred/guessed parameter mappings
5. write-tool safety gates
6. probe commands or instructions that are placeholders or non-executable
7. MCP tools that are visible but return `stub`, `not_verifiable`, `probe_required`, empty, fake, or placeholder responses

Do not perform broad unrelated refactoring.

## Required stub/placeholder audit

Search for at least these patterns:

```text
TODO
FIXME
HACK
XXX
stub
placeholder
not implemented
not_implemented
not_verifiable
probe_required
inferred
dummy
mock
fake
temporary
return {}
return []
return null
return undefined
success: true
throw new Error("Not implemented")
```

Create or update an audit table in the appropriate repo documentation location. Classify each finding:

* P0: MCP-exposed tool claims or appears usable but is not truly implemented.
* P1: Internal incomplete logic affecting routing, AVB, Fat Channel, write tools, or mixer state.
* P2: Documentation/test/probe gap that blocks release confidence.
* P3: harmless internal note or cosmetic issue.

For every P0/P1 finding, decide one of:

* implement with tests and HIL evidence;
* hide/disable behind an experimental or stub flag;
* downgrade the capability claim and document as unsupported/probe-required.

## TDD workflow

For each selected gap:

1. Write or update requirements first.
2. Write or update design notes before implementation.
3. Add failing unit/integration tests that expose the current gap.
4. Run the relevant test command and capture the failure.
5. Implement the minimum correct change.
6. Run the test again and capture success.
7. Run full relevant validation:

   * build
   * typecheck
   * unit tests
   * integration tests
   * capability/inventory generation
   * traceability checks, if available
8. Only then run HIL validation where real mixer behavior is involved.

Suggested commands to discover and use, adjusted to the repo scripts:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm inventory
pnpm traceability
```

Do not invent commands if the repo defines different names. Read `package.json` first.

## HIL requirements

HIL must use real connected PreSonus StudioLive hardware.

Before HIL, record:

```markdown
## HIL environment

- Date/time:
- Mixer model:
- Firmware version:
- Serial/device identifier, if available:
- Connected stagebox/model, if any:
- Network topology:
- Computer OS:
- Node version:
- pnpm version:
- Relevant env vars:
- Write tools enabled: yes/no
```

For routing-related work, include real probes for:

* local input routing;
* channel source selection;
* 32SC + 32R AVB/stagebox routing, if stagebox is connected;
* output source mapping;
* wrong-patch detection;
* unavailable/ambiguous route handling.

For Fat Channel work, include calibration probes with one parameter changed at a time and raw adapter dumps captured before/after.

For write-tool work, include:

* dry-run verification;
* explicit write-enable flag;
* preflight read;
* proposed change summary;
* bounded parameter validation;
* post-write verification;
* rollback or restore instruction where possible.

No HIL-dependent capability may be marked `observed` without captured HIL evidence.

## Capability classification rules

Use this vocabulary consistently:

```text
observed
implemented_unverified
inferred
probe_required
stub
planned
not_supported
deprecated
```

A capability may be `observed` only when:

* implementation exists;
* unit/integration tests pass;
* HIL evidence exists if it depends on mixer behavior;
* model and firmware are documented;
* failure behavior is defined;
* documentation and capability matrix are updated.

If implementation exists but HIL is missing, use `implemented_unverified`.

If behavior is guessed from raw values, use `inferred`.

If a real mixer probe is required before implementation can be trusted, use `probe_required`.

If the handler intentionally returns a non-functional response, use `stub`.

## Write-tool safety

Do not enable write tools by default.

Every write-capable tool must have this behavior:

```json
{
  "dryRun": true,
  "writeEnabled": false,
  "target": "...",
  "before": {},
  "proposed": {},
  "risk": "low | medium | high",
  "requiresConfirmation": true,
  "hilStatus": "observed | implemented_unverified | unsupported"
}
```

A write must not execute unless:

* the global write-enable environment flag is set;
* the specific tool safety checks pass;
* current state was read successfully;
* parameter range validation passes;
* post-write verification is possible;
* HIL status allows the operation.

If these conditions are not met, return a structured refusal, not a silent success.

## Documentation updates required

For every changed capability, update the appropriate docs:

* capability matrix
* release-readiness checklist
* README claims, if affected
* HIL/probe docs
* issue/traceability references
* generated inventories, if the repo uses them

Remove or downgrade broad claims that are not evidence-backed.

## Expected final answer from you

At the end, report:

```markdown
## Summary

- What was audited:
- What was changed:
- What was intentionally not changed:
- Which tests were added first:
- Initial failing test evidence:
- Passing test evidence:
- HIL evidence:
- Remaining `stub` / `probe_required` / `inferred` capabilities:
- Capability matrix changes:
- Release-readiness impact:
- Follow-up issues required:
```

## Hard stop conditions

Stop and ask for human intervention if:

* the repo lifecycle/process is unclear or contradictory;
* required HIL hardware is not connected for an HIL-dependent claim;
* a write operation could affect live audio unexpectedly;
* a tool requires unknown mixer protocol behavior and no probe evidence exists;
* tests cannot be run due to dependency/environment failure;
* implementation would require broad architectural changes outside the selected gap.

Do not continue by guessing.
