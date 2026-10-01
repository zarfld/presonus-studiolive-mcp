# ADR-006: Semi-Automated Write Tools — Propose + Confirm + Apply

**Status**: Accepted  
**Date**: 2026-06-24  
**Supersedes**: ADR-005 (extends, does not replace)  
**Issue**: (pending GitHub issue creation)

## Amendment — v0.1 public release scope (2026-10-01)

The original decision listed EQ as the initial scope for write tools (Phase C). However, as of the v0.1 public release:

- **EQ write is deferred**: `propose_eq_change` is hard-disabled. De-normalization formulas remain `guessed` pending probe-fat-channel calibration. UC Surface display does not update from probe writes, blocking write HIL.
- **Channel mute write is the only v0.1 supported public write**: `prepare_mute_change_set` + `apply_change_set` — HIL-verified on StudioLive 32SC <id.hidden> firmware 3.4.0.111374 (T1–T9 passed 2026-07-01).
- `prepare_fader_change_set`, `prepare_fat_channel_change_set` are hard-disabled pending scale investigation and HIL.

This amendment does not rewrite the original decision. The two-step proposal → confirmation safety framework and all safety constraints described below remain exactly as accepted. Only the supported parameter scope for v0.1 is narrowed from EQ-first to mute-only.

---

## Traceability
- Traces to: ADR-005 (read-only-first policy)
- Motivated by: soundcheck/feedback adjustment assistance use case

---

## Context

ADR-005 established a read-only-first policy for the MVP (v0.1.0). The MCP server
exposes mixer state but provides no tools to change parameters. This is safe but limits
AI-assisted soundcheck workflows: the AI can diagnose (e.g., "channel 3 is clipping")
but cannot propose or apply corrections.

To support feedback adjustment and soundcheck assistance, write tools are needed.
The risk of fully autonomous writes (AI changes parameters without human review) is
unacceptable during live performance. A two-step proposal → confirmation flow is the
minimum safe design.

---

## Decision

Introduce semi-automated write tools activated only when `controlEnabled: true` is
passed to `createServer()` (explicit opt-in — default remains `false`).

### Two-step flow

1. **`propose_eq_change`** — AI reads current state, computes proposed normalized value,
   creates a `ProposedChangeSet` with a `changeSetId`, returns human-readable description
   of current → proposed values. No mixer interaction occurs.

2. **`apply_change_set`** — Operator (or AI acting on confirmed operator intent) calls
   this tool with `changeSetId` + `confirmationNote`. The tool applies changes via the
   featherbear `_sendPacket('PV', ...)` protocol and writes an audit log entry.

### Safety constraints

- `changeSetId` expires after 60 seconds (prevents stale proposals being applied).
- Only one `ProposedChangeSet` per `channelId` is kept active (new proposal replaces old).
- `controlEnabled: true` requires explicit server configuration — never auto-enabled.
- `operationMode: 'control_locked'` overrides `controlEnabled` (always read-only).
- All applied changes are written to stderr audit log with timestamp + confirmationNote.
- Write tools are NOT registered in default configuration (ADR-005 still applies for MVP).

### Supported parameters (initial scope)

EQ only (Phase C initial):
- `eq.gain<1-4>` — gain in dB (±18 dB range)
- `eq.freq<1-4>` — frequency in Hz (20–20000 Hz)
- `eq.q<1-4>` — Q factor (0.1–16)
- `eq.enabled` — master EQ on/off

Compressor, gate, and limiter parameters added in follow-up (same pattern).

### Write protocol

Featherbear `_sendPacket('PV', buffer)` where buffer is:
```
[path as UTF-8 NUL-terminated + 3 NUL padding] ++ [float32BE of normalized 0–1 value]
```
Path uses `/` as separator: `line/ch1/eq/eqgain1` (convert from dot-notation: `.` → `/`).

---

## Consequences

### Positive
- AI can propose specific EQ adjustments with before/after values visible to operator.
- Operator retains explicit control over all changes via `apply_change_set`.
- Audit log provides accountability for every applied change.
- Consistent with ADR-005: write tools disabled by default.

### Risks
- De-normalization formulas are currently 'guessed' — incorrect proposals possible until
  probe-fat-channel calibration confirms the formulas.
- featherbear `_sendPacket` is an internal API subject to change — adapter layer isolates risk.
- Mixer firmware may reject malformed packets silently — current snapshot is refreshed
  after apply to detect discrepancies.

### Out of scope
- Scene recall, routing changes, gain staging.
- Bulk multi-channel changes in a single changeSet.
- Undo beyond `refresh_mixer_state` (which restores from live mixer state).
