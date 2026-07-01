---
name: issue-traceability-remediation
description: Reconcile GitHub issues, implementation comments, tests, docs, and requirements so agents do not mistake stale requirements for completed work or completed code for backlog.
---

# Issue traceability remediation

## Use this skill when

Use this skill when:

- an issue says backlog/open but code claims `@implements #N`
- README claims a feature is complete but issues list it as planned
- implementation comments reference issues/ADRs incorrectly
- broad REQ issues contain implementation progress, test status, and future work in one place
- labels, milestones, or trace links are missing or misleading
- an agent is about to implement directly from a broad issue without acceptance criteria

## Goal

Make issue state, requirements, implementation, tests, and docs mutually consistent.

A future agent must be able to answer:

1. What requirement exists?
2. What design/ADR governs it?
3. What code implements it?
4. What tests verify it?
5. What remains blocked, deferred, or unverified?

## Required issue split

Do not allow one broad issue to carry all work states. Split into:

| Issue type | Purpose |
|---|---|
| `REQ-*` | Requirement: what must be true, with acceptance criteria. |
| `ADR-*` | Architectural decision: why this approach. |
| `IMP-*` | Implementation task: code change. |
| `TEST-*` | Verification task: unit/integration/HIL/probe validation. |
| `DOC-*` | Documentation update. |
| `PROBE-*` | Reverse-engineering or hardware probe task. |
| `BUG-*` | Defect against implemented behavior. |

## Traceability syntax

Use exact, machine-readable links:

```markdown
## Traceability
- Traces to: #123
- Depends on: #45
- Verifies: #67
- Implements: #89
```

For tests:

```markdown
## Traceability
- Verifies: #123
```

For implementation PRs:

```markdown
Fixes #123
Implements #456
```

## Procedure

1. **Inventory conflicting references.**
   - Search for `@implements #N`, `@architecture #N`, `Verifies: #N`, `Traces to: #N`.
   - Compare against open/closed issue state.
   - Identify features that are partly implemented but not verified.

2. **Classify issue state accurately.**
   - `implemented`: code exists and tests pass.
   - `verified`: code exists and suitable tests/HIL/probe evidence exist.
   - `partial`: code exists but gaps remain.
   - `probe-blocked`: implementation depends on hardware diff/probe.
   - `docs-drift`: docs disagree with code/tests.
   - `planned`: no implementation yet.

3. **Split broad issues.**
   - Keep the REQ issue as the requirement anchor.
   - Create or identify separate IMP/TEST/DOC/PROBE issues.
   - Move progress notes out of the REQ body into implementation/test tasks.

4. **Update implementation comments.**
   - `@implements #N` only if the code materially implements that issue.
   - Use `@partial #N` or a normal comment when incomplete.
   - Use `@see #N` for related but not implemented requirements.

5. **Update docs.**
   - README/capability matrix must reflect the same state as issues.
   - If an issue remains open because HIL is missing, docs must say `implemented-unverified` or `probe-required`, not complete.

6. **Add regression guard.**
   - Prefer a script/test that checks unresolved `@implements` references against issue metadata where possible.
   - At minimum, create a manual checklist in `docs/traceability.md`.

## Acceptance criteria

- No open backlog issue is described as fully implemented in README unless the issue is intentionally left open for a later phase and the partial state is explicit.
- No `@implements #N` comment points to an issue whose acceptance criteria are not satisfied, unless marked partial.
- Requirement issues do not contain hidden implementation progress as their only status source.
- TEST issues verify REQ/IMP issues explicitly.
- Docs, issues, and code use the same status categories.

## Failure modes to avoid

- Closing an issue because code exists but no test/probe evidence exists.
- Leaving a requirement open with implementation details buried in comments.
- Using `@implements` as a vague relationship marker.
- Treating issue labels as truth when the code/docs contradict them.
- Letting agents implement directly from a broad REQ without a narrower IMP and TEST path.
