# Dependency and CI Hygiene

## Purpose

Use this skill to keep the TypeScript monorepo buildable, testable, reproducible, and publishable.

This skill is lower priority than routing and safety, but release quality depends on it.

## Applies to

- `package.json`
- `pnpm-lock.yaml`
- workspace packages
- TypeScript config
- Vitest config
- CI workflows
- npm package metadata
- MCP SDK version
- adapter dependency versions

## Required commands

Run or verify the equivalent commands:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm inventory
pnpm traceability
```

If a command does not exist, report that explicitly and recommend whether to add it.

## Required dependency audit table

| Package | Current | Target/latest | Used by | Risk | Action |
|---|---:|---:|---|---|---|

Do not upgrade dependencies blindly. Classify risk first.

## Risk categories

| Risk | Meaning |
|---|---|
| `api-drift` | New version may change public API. |
| `esm-cjs` | Upgrade may affect module system. |
| `test-fragility` | Test runner/plugin versions may be mismatched. |
| `security` | Known vulnerability or unsafe dependency. |
| `runtime` | Could break MCP runtime behavior. |
| `low` | Safe patch/minor update likely. |

## Required workflow

1. Inspect workspace package metadata.
2. Identify mismatched major versions.
3. Identify floating versions that should be pinned before release.
4. Identify stale dependencies that are safe to defer.
5. Run build/test/typecheck where possible.
6. If updating, update one dependency group at a time.
7. Record before/after versions and test results.
8. Do not combine dependency upgrades with feature implementation unless unavoidable.

## MCP SDK rule

For `@modelcontextprotocol/sdk`:

- check current API usage,
- check server start path,
- check tool registration path,
- run MCP tool inventory after upgrade,
- prefer pinning a known-good version for release.

Do not assume all 1.x versions are behaviorally identical.

## Adapter dependency rule

For unofficial or patched adapter dependencies:

- document exact version,
- document local patch assumptions,
- add smoke tests around adapter boundary,
- avoid broad mixer compatibility claims.

## CI acceptance criteria

A CI-ready repo should have:

```text
install
build
typecheck
unit tests
tool/inventory validation
traceability validation
capability matrix validation
```

Optional but recommended:

```text
coverage
dependency audit
package publish dry run
fixture validation
```

## Required output

```markdown
# Dependency/CI Report

## Summary
<short status>

## Commands
| Command | Result | Notes |
|---|---|---|

## Dependency risks
<table>

## Required changes
<ordered list>

## Deferred changes
<safe-to-defer list>

## Release impact
<impact statement>
```

## Stop conditions

Stop and report a blocker if:

- lockfile is inconsistent,
- build fails,
- typecheck fails,
- tests fail in areas affected by the change,
- MCP tool inventory cannot be generated,
- dependency upgrade changes MCP registration behavior,
- coverage tooling uses incompatible major versions.
