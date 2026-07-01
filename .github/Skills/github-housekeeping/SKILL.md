# GitHub Housekeeping

## Purpose

Use this skill to keep the issue tracker, labels, milestones, and project state aligned with the actual repository state.

The goal is to make the repo understandable to both humans and agents. Open issues should represent real remaining work, not completed history.

## Applies to

- GitHub issues
- labels
- milestones
- issue checklists
- release blockers
- completed-but-open issues
- stale TODO tracking
- HIL work queues

## Recommended labels

Use a controlled label set.

### Type

```text
type:bug
type:feature
type:stub
type:docs
type:refactor
type:test
type:hil-probe
```

### Area

```text
area:routing
area:avb
area:fat-channel
area:write-tools
area:mcp-server
area:adapter
area:domain
area:ci
area:docs
```

### Status

```text
status:planned
status:in-progress
status:implemented-unverified
status:needs-probe
status:blocked
status:observed
status:done
```

### Priority

```text
priority:p0
priority:p1
priority:p2
priority:p3
```

## Required workflow

1. List open issues.
2. Identify issues that appear completed.
3. Identify issues whose title/body overstates completion.
4. Identify issues missing acceptance criteria.
5. Identify issues missing labels.
6. Link each issue to the relevant skill:
   - stubs → `stub-placeholder-elimination`
   - routing → `routing-reverse-engineering`
   - HIL → `hil-probe-design`
   - writes → `mcp-write-safety-gate`
   - Fat Channel → `fat-channel-calibration`
   - claims/release → `release-readiness-audit`
7. Close completed issues only if evidence is linked.
8. Convert broad issues into smaller actionable issues if needed.

## Required issue template

Each active issue should contain:

```markdown
## Problem
What is unfinished or wrong?

## Scope
Files/tools/features affected.

## Required skill
Which agent skill should be used?

## Acceptance criteria
- [ ] ...
- [ ] ...

## Evidence required
Unit test / HIL probe / fixture / docs update.

## Capability impact
Which capability matrix entries change?
```

## Required housekeeping report

Produce:

| Issue | Current state | Problem | Recommended action | Skill | Priority |
|---|---|---|---|---|---|

Recommended actions:

```text
close
reopen
split
relabel
convert-to-hil-probe
convert-to-docs
keep-open
```

## Milestone recommendations

Use milestones tied to readiness:

```text
routing-readiness
write-safety-readiness
fat-channel-calibration
32sc-hil-baseline
32r-stagebox-hil
experimental-readonly-release
```

## Closing rule

An issue may be closed only if:

- acceptance criteria are satisfied,
- evidence is linked,
- capability matrix is updated if applicable,
- release checklist is updated if applicable,
- remaining work has separate issues.

Do not close an issue only because code was changed.

## Acceptance criteria

Housekeeping is complete when:

- all open issues have correct labels,
- completed work is closed with evidence,
- active work has acceptance criteria,
- HIL-required work is explicit,
- P0/P1 blockers are easy to find,
- milestones reflect release sequencing.

## Stop conditions

Stop and report a blocker if:

- an issue is labelled done but capability remains `stub` or `probe_required`,
- a release milestone contains unresolved P0 issues,
- broad compatibility claims have no linked evidence,
- HIL work is hidden inside generic feature issues.
