# MCP Write Safety Gate

## Purpose

Use this skill for every write-capable MCP tool and every adapter method that changes mixer state.

A write-capable tool must be safe by default. It must not mutate mixer state unless writes are explicitly enabled, validated, preflighted, and verified.

## Applies to

- channel mute writes
- channel fader writes
- aux send level writes
- aux send mute writes
- Fat Channel parameter writes
- preset application
- routing writes, if added later
- scene/state changes
- any adapter method that mutates mixer state

## Hard rules

1. Default mode is read-only.
2. Writes require an explicit environment flag.
3. Writes require a dry-run path.
4. Writes require parameter validation.
5. Writes require preflight state read.
6. Writes require proposed-change summary.
7. Writes require post-write verification.
8. Writes require HIL evidence before being advertised as supported.
9. Risky writes require rollback or restore procedure.
10. Never execute writes in tests unless using a mock or an explicit HIL write test target.

## Required environment gate

Use a single obvious flag:

```text
PRESONUS_MCP_ENABLE_WRITES=true
```

If this flag is absent, all write tools must return dry-run or disabled responses.

## Required response shape

Write tools must return a response equivalent to:

```json
{
  "status": "dry_run",
  "writeEnabled": false,
  "dryRun": true,
  "tool": "set_channel_fader",
  "target": {
    "channel": 1
  },
  "before": {
    "faderDb": -12.0
  },
  "proposed": {
    "faderDb": -10.0
  },
  "validation": {
    "rangeValid": true,
    "targetExists": true,
    "hilStatus": "implemented_unverified"
  },
  "risk": "medium",
  "requiresConfirmation": true,
  "postWriteVerificationAvailable": true,
  "rollback": {
    "available": true,
    "restore": {
      "faderDb": -12.0
    }
  },
  "executed": false
}
```

For enabled writes:

```json
{
  "status": "verified",
  "writeEnabled": true,
  "dryRun": false,
  "executed": true,
  "before": {},
  "requested": {},
  "after": {},
  "verification": {
    "matched": true,
    "tolerance": "..."
  }
}
```

## Required workflow

1. Identify whether the touched tool can mutate mixer state.
2. If yes, check for:
   - environment gate,
   - dry-run mode,
   - schema validation,
   - range validation,
   - target existence validation,
   - preflight state read,
   - proposed-change summary,
   - rollback/restoration data,
   - post-write verification,
   - HIL evidence.
3. Add missing safety pieces before changing business logic.
4. Add unit tests for disabled, dry-run, invalid, and enabled mocked paths.
5. Add or update HIL probe plan for real write validation.
6. Keep README clear that writes are disabled by default unless fully observed.

## Risk classification

| Risk | Examples | Requirement |
|---|---|---|
| `low` | read-only preview, no state change | allowed by default |
| `medium` | fader, mute, aux send on test scene | explicit enable + verification |
| `high` | routing, Fat Channel preset, scene overwrite | explicit enable + confirmation + rollback + HIL evidence |
| `critical` | global reset, firmware, destructive scene operation | not supported unless separately designed |

## Required tests

For each write tool:

```text
<tool>.disabled.test.ts
<tool>.dry-run.test.ts
<tool>.validation.test.ts
<tool>.mock-write.test.ts
```

For hardware validation, add probe docs:

```text
probe-mute-write-roundtrip
probe-fader-write-roundtrip
probe-aux-send-write-roundtrip
probe-fat-channel-write-roundtrip
```

## Acceptance criteria

A write tool is acceptable only when:

- disabled by default,
- dry-run is useful and complete,
- invalid inputs are rejected before adapter calls,
- current state is read before write,
- post-write state is verified,
- rollback information is returned where practical,
- docs describe risk,
- capability state does not exceed available HIL evidence.

## Stop conditions

Stop and report a blocker if:

- enabling writes is implicit,
- dry-run path is missing,
- range validation is incomplete,
- the adapter cannot read back the changed value,
- no HIL write probe exists for a claimed supported write,
- Fat Channel formulas are guessed,
- a write could alter live state without clear user consent.
