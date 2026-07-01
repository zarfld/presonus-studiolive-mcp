---
name: routing-confidence-probe-promotion
description: Preserve routing correctness by separating observed, inferred, probe-required, stubbed, and unsupported routing capabilities before exposing them to a sound-engineer agent.
---

# Routing confidence and probe promotion

## Use this skill when

Use this skill when working on:

- input routing
- AVB/stagebox routing
- AUX/monitor sends
- FX sends
- subgroup/main assignments
- output patch routing
- `get_routing_graph`
- `validate_input_routing`
- `validate_stagebox_routing`
- `get_input_routing`
- `validate_avb_routing`
- `validate_output_routing`
- probe-diff sessions
- any routing-related resource under `presonus://mixer/{id}/routing*`

## Goal

Never present uncertain routing as verified routing. A consuming sound-engineer agent must be able to distinguish what the MCP backend directly observes, what it infers, what requires probe evidence, and what cannot be known through the current adapter.

## Routing confidence vocabulary

Use these exact values in schemas, docs, and tests where practical:

| Value | Meaning |
|---|---|
| `observed_live_state` | Directly read from live mixer state keys. |
| `inferred_live_state` | Derived from key patterns or normalized mappings, not directly confirmed. |
| `probe_verified` | Confirmed by operator-driven probe/diff on real hardware. |
| `probe_required` | Must not be trusted until probe/diff is run. |
| `not_verifiable_with_current_adapter` | Current adapter/protocol surface cannot expose this fact. |
| `stub` | Tool intentionally returns limited result or instructions only. |
| `unsupported` | Not implemented and not planned for current scope. |

Do not use vague values such as `ok`, `complete`, `works`, `unknown`, or `probably`.

## Layer model

### Layer A — observable live state

Allowed without probe, but may still be `inferred_live_state`:

- channel names
- mute/solo/fader/pan where mapped
- meter activity
- AUX send level/assign when exposed by live keys
- FX send level/assign when exposed by live keys
- subgroup/main assignment when exposed by live keys

### Layer B — hardware/probe-dependent routing

Must be `probe_required`, `probe_verified`, or `not_verifiable_with_current_adapter`:

- physical input source routing
- AVB stream routing
- stagebox socket to mixer-channel routing
- output patch source names where only source indices are known
- bus-to-output source-name mapping

## Required output fields

Routing tools/resources must expose enough metadata for an agent to reason safely:

```ts
interface RoutingConfidenceMetadata {
  confidence: 'observed_live_state'
    | 'inferred_live_state'
    | 'probe_verified'
    | 'probe_required'
    | 'not_verifiable_with_current_adapter'
    | 'stub'
    | 'unsupported'
  evidence?: {
    kind: 'live_state_key' | 'unit_test' | 'fixture' | 'hil_probe' | 'operator_probe' | 'manual_inspection'
    reference: string
    capturedAt?: string
    mixerModel?: string
    firmware?: string
  }
  limitations?: string[]
  nextProbeCommand?: string
}
```

Every route, route group, or global routing result must include either item-level confidence or a clearly documented inherited `globalConfidence`.

## Procedure

1. **Identify the routing layer.**
   - If it comes from flat live-state keys, classify Layer A.
   - If it maps physical sockets, AVB streams, stagebox I/O, or output source names, classify Layer B.

2. **Do not promote Layer B by inference.**
   - A source index is not a source name.
   - A meter on a channel is not proof of the physical cable route.
   - A channel name matching an input list is not proof of physical patch correctness.

3. **Add probe instructions where blocked.**
   - Return actionable probe commands or steps.
   - Include what the operator should change and what diff result is expected.

4. **Promote only with evidence.**
   - `probe_required` → `probe_verified` only after a recorded probe session exists.
   - Store probe captures with model, firmware, serial redaction policy, timestamp, command, and expected/actual result.

5. **Update docs and capability matrix.**
   - Routing rows in the capability matrix must include confidence.
   - README must not say “routing supported” without distinguishing Layer A from Layer B.

6. **Add regression tests.**
   - Tests must assert that unprobed Layer B tools do not return verified status.
   - Tests must assert that partial output-patch mappings expose missing source names as `null` or equivalent, not invented names.

## Acceptance criteria

- No routing tool/resource returns a verified-looking result for unverified Layer B routing.
- Output patch routing distinguishes source indices from source names.
- AVB/stagebox routing is not treated as validated unless probe evidence exists.
- Every routing result includes confidence and limitations.
- Probe instructions are actionable.
- Capability matrix and README classify routing by confidence level.

## Failure modes to avoid

- Inferring cable patching from channel names.
- Inferring AVB stream routing from meter activity alone.
- Naming source indices without probe evidence.
- Removing probe-required functionality as YAGNI instead of preserving it as a required blocked capability.
- Returning `valid: true` when the actual result is “not verifiable”.
