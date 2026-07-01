# Release Readiness Audit

## Purpose

Use this skill before publishing, tagging, announcing, or broadening claims about the MCP server.

This audit separates what is actually supported from what is experimental, inferred, stubbed, or blocked by hardware evidence.

## Applies to

- README
- npm package metadata
- release notes
- GitHub milestones
- capability matrix
- release-readiness checklist
- MCP tool inventory
- examples and quick-start docs

## Required classification

Group all features into:

| Group | Meaning |
|---|---|
| Supported | Observed with model/firmware evidence and tests. |
| Experimental | Implemented but not fully HIL-verified or only safe for controlled testing. |
| Read-only supported | Safe inspection tools with observed data. |
| Write-gated | Mutating tools disabled by default and not claimed safe for live use. |
| Probe required | Requires HIL before support can be claimed. |
| Stub/unavailable | Exposed only as placeholder or not exposed as functional. |
| Not supported | Explicitly out of scope. |

## Required workflow

1. Build the current tool inventory.
2. Compare inventory against capability matrix.
3. Compare README claims against capability matrix.
4. Compare release checklist against actual tests and HIL evidence.
5. Review open issues labelled completed, blocked, HIL, routing, writes, Fat Channel.
6. Check that write tools are disabled by default.
7. Check that stubs are not advertised as functional.
8. Check that model/firmware scope is explicit.
9. Produce release decision.

## Required output

```markdown
# Release Readiness Report

## Decision
release / prerelease / do-not-release

## Supported scope
Exact model/firmware/features supported.

## Experimental scope
Implemented but not proven.

## Stub/unavailable capabilities
Visible incomplete tools or docs.

## Blocking issues
Must fix before release.

## Documentation corrections
Claims that must be narrowed.

## Required HIL probes
Probes needed to upgrade capability.

## Recommended version label
Example: 0.1.x experimental-readonly
```

## Release decision rules

Use:

```text
release
```

only if:

- build/test/typecheck pass,
- no P0 stubs are exposed as functional,
- README claims match evidence,
- write tools are safe by default,
- supported features have evidence.

Use:

```text
prerelease
```

if:

- read-only tools are useful,
- writes remain gated,
- routing/Fat Channel gaps are clearly documented,
- unsupported features are not misrepresented.

Use:

```text
do-not-release
```

if:

- visible tools fake success,
- write tools can mutate without explicit enablement,
- critical docs overclaim,
- build/test path is broken,
- routing stubs appear as supported.

## Required claim wording

Prefer precise wording:

```text
Experimental read-mostly MCP backend validated against StudioLive 32SC firmware <version>.
```

Avoid broad wording:

```text
Complete StudioLive III MCP server.
Full mixer control.
Supports all StudioLive III mixers.
Production-ready soundcheck automation.
```

## Required release labels

Use one or more:

```text
experimental-readonly
hil-required
write-tools-disabled
32sc-observed
32r-unverified
routing-partial
fat-channel-inferred
avb-routing-probe-required
```

## Acceptance criteria

The audit is complete only when:

- every tool has a release classification,
- every broad claim is corrected,
- every blocker has an issue or checklist entry,
- release decision is justified,
- unsupported or stubbed capabilities are visible to users.

## Stop conditions

Stop and recommend `do-not-release` if:

- a P0 stub is presented as functional,
- writes are enabled by default,
- no capability matrix exists or it is stale,
- README contradicts tool behavior,
- tests cannot be run or are known broken.
