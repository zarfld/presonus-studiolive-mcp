# Stub and Placeholder Elimination

## Purpose

Use this skill to find, classify, and eliminate unfinished code, placeholder logic, fake success responses, empty implementations, TODO-only paths, and user-visible stubs.

The goal is not to delete all TODO comments. The goal is to prevent unfinished behavior from being exposed as real MCP capability.

## Applies to

- TypeScript source files
- MCP tool handlers
- adapter methods
- domain conversion functions
- generated capability documentation
- tests and fixtures
- README/examples
- probe scripts

## Search targets

Scan for these literal terms case-insensitively:

```text
TODO
FIXME
HACK
XXX
stub
placeholder
not implemented
not_implemented
unimplemented
dummy
fake
temporary
probe_required
not_verifiable
inferred
return {}
return []
return null
return undefined
throw new Error("Not implemented")
throw new Error('Not implemented')
```

Also inspect suspicious patterns:

```ts
return { success: true };
return { ok: true };
return { status: "ok", data: {} };
return { status: "ok", data: [] };
return { capability: "observed" };
```

Any such response must be backed by real adapter interaction and tests.

## Severity classification

| Severity | Meaning | Required action |
|---|---|---|
| `P0` | User-visible MCP tool is exposed but not truly implemented. | Implement, hide, or mark as `stub`/`probe_required` in all docs and responses. |
| `P1` | Incomplete internal logic affects routing, AVB, writes, Fat Channel, state, or safety. | Fix before release or gate behind explicit experimental flag. |
| `P2` | Dev-only TODO or incomplete docs/tests that do not mislead users. | Track in issue; not release-blocking unless claim depends on it. |
| `P3` | Cosmetic comment or harmless future note. | Leave or clean opportunistically. |

## Required workflow

1. Run textual searches across the repo.
2. For each hit, inspect the surrounding implementation.
3. Determine whether the hit affects runtime behavior or only documentation.
4. Identify the user-visible surface, if any:
   - MCP tool,
   - CLI command,
   - README claim,
   - generated matrix,
   - release checklist.
5. Classify severity.
6. For `P0` and `P1`, choose exactly one resolution:
   - implement behavior,
   - remove/hide tool from normal inventory,
   - keep exposed but explicitly return `stub`/`probe_required` with actionable probe instructions,
   - mark as `not_supported`.
7. Add or update tests.
8. Update capability and release docs.

## Required output

Produce a table:

| Finding | File | Symbol/tool | Severity | Why it matters | Resolution |
|---|---|---|---|---|---|

For each `P0` and `P1`, include an explicit acceptance criterion.

## Required code behavior for unfinished features

A user-visible unfinished feature must return a structured response like:

```json
{
  "status": "probe_required",
  "capability": "probe_required",
  "supported": false,
  "reason": "Input routing cannot be verified with the current adapter state.",
  "nextProbe": "probe-input-routing-32sc",
  "safeToUseForLiveDecisions": false
}
```

Do not return fake empty data.

Bad:

```json
{
  "status": "ok",
  "routing": []
}
```

Good:

```json
{
  "status": "stub",
  "routing": null,
  "reason": "Routing source map is not implemented.",
  "probeRequired": true
}
```

## Placeholder probe command rule

Probe instructions must be executable or explicitly pseudo-code.

Bad:

```bash
pnpm probe --device  --target input-routing
```

Good:

```bash
pnpm probe:input-routing -- --device <MIXER_IP_OR_ID> --model StudioLive-32SC
```

If the device ID is unknown, write `<MIXER_IP_OR_ID>`, not an empty string.

## Acceptance criteria

This skill is complete only when:

- all `P0` findings are implemented, hidden, or explicitly marked unsupported/stub,
- all `P1` findings have issues, tests, or gates,
- no MCP tool returns fake success for unimplemented behavior,
- docs and capability matrix reflect the remaining unfinished state,
- probe commands are executable or clearly marked as templates.

## Stop conditions

Stop and report a blocker if:

- a write tool has an unverified write path,
- a routing tool returns empty routing as success,
- a Fat Channel conversion uses guessed formulas without exposing confidence,
- a tool description claims real support while implementation returns `not_verifiable`,
- the same behavior is described differently in README and capability matrix.
