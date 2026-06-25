# ADR-008: Two-Layer Routing Model — Observable vs. Probe-Required

**Status**: Accepted  
**Date**: 2026-06-25  
**Traces to**: #4 (StR-4: Routing validation between FOH and stagebox)  
**Depends on**: #29 (ADR-007: Routing domain read-only-first)

## Status

Accepted

---

## Context

The PreSonus StudioLive mixer exposes two fundamentally different categories of routing data:

1. **Observable routing** — state keys that exist in the featherbear API state tree and are confirmed
   (or likely) via probe diff-state on 32SC firmware 3.3.0.109659:
   - `line.chN.auxM` / `line.chN.assign_auxM` — channel-to-aux send level and assignment
   - `line.chN.FXA–FXH` — channel-to-FX send levels
   - `fxreturn.chN.auxM` / `return.chN.auxM` / `talkback.chN.auxM` — other channel types to AUX
   - `line.chN.sub1–sub4`, `line.chN.lr` — subgroup and main LR assignment

2. **Probe-required routing** — routing that exists in hardware but has no confirmed state key via
   the featherbear API:
   - Physical input source selection (analog, digital, network)
   - AVB stream mapping (which network channel → which console input)
   - Stagebox input routing (32R → FOH mapping)
   - Digital patch matrix
   - Output patch source names (source index 0–27 known, but source name → index mapping unverified)

Mixing these two categories in a single undifferentiated API would cause the AI sound engineer agent
to draw false conclusions: treating physically-unverifiable routing as confirmed would lead to
incorrect diagnosisand incorrect instructions to the human engineer.

Previous ADR-007 (#29) established read-only-first policy. This ADR establishes the **layer split**
within read-only routing data.

---

## Decision

Split routing into **Layer A** (observable/implementable now) and **Layer B** (probe-required stubs):

### Layer A — Mix Send Routing (implement now)

Resources and tools that operate entirely on confirmed state keys:

```
presonus://mixer/{id}/routing          (existing — per-channel AUX/FX/SUB sends)
presonus://mixer/{id}/auxes            (existing — aux mix master + sends)
presonus://mixer/{id}/fx-sends         (NEW — per-channel FX send levels + assignments)
presonus://mixer/{id}/monitor-routing  (NEW — flattened MixerRoute[] for all AUX sends)
```

Layer A tools: `get_aux_mix`, `validate_monitor_requirements`, `validate_aux_mix`,
`find_missing_monitor_sends`, `find_muted_monitor_sends`, `find_hot_monitor_sends`.

All Layer A data carries `confidence: 'inferred'` (formula plausible, key confirmed in capture)
until a probe session upgrades it to `'observed'`.

### Layer B — Physical/AVB/Patch Routing (stubs now, implement post-probe)

Stubs registered in MCP server immediately so agents can call them and receive structured
`not_verifiable_with_current_adapter` responses with `probeInstructions`:

```
get_input_routing       → stub (requires probe-routing diff on input source changes)
validate_avb_routing    → stub (requires 32R hardware + AVB probe session)
validate_output_routing → partial (output patch index known; source names unknown)
```

The stubs return:
```json
{
  "status": "not_verifiable_with_current_adapter",
  "reason": "<human-readable>",
  "probeSteps": ["pnpm probe-routing dump ...", "pnpm probe-routing diff ..."],
  "probeMarkdown": "## How to verify\n..."
}
```

### Unified RoutingKind type

A `RoutingKind` union distinguishes route categories, enabling tools to filter and report by kind:

```typescript
type RoutingKind =
  | 'input-source'      // physical input → console channel (probe-required)
  | 'channel-to-aux'   // console channel → AUX bus (Layer A)
  | 'channel-to-fx'    // console channel → FX bus (Layer A)
  | 'fx-return-to-aux' // FX return → AUX bus (Layer A when data available)
  | 'talkback-to-aux'  // talkback → AUX bus (Layer A when data available)
  | 'bus-to-output'    // AUX/SUB/FX bus → analog output (partial Layer B)
  | 'avb-stream'       // AVB network stream mapping (Layer B)
  | 'stagebox'         // stagebox input mapping (Layer B)
```

### Confidence vocabulary

Rename `'guessed'` → `'inferred'` in `RoutingConfidenceSchema` to align with `MixerRoute.confidence`
vocabulary and better describe the epistemic status (formula is logically inferred from observed
patterns, not randomly guessed):

```typescript
type RoutingConfidence = 'observed' | 'inferred' | 'not_verifiable_with_current_adapter'
```

Note: `fat-channel.ts` retains its own `ConfidenceSchema` with `'guessed'` (different domain,
different calibration lifecycle — leave unchanged).

---

## Alternatives Considered

### Alternative 1: Single unified routing API with confidence per route
Rejected: Requires all routing types to be queried at once. Makes agent responses slow when
only AUX sends are needed.

### Alternative 2: Only expose Layer A, no Layer B stubs
Rejected: Agents have no way to know what routing data is missing. Stub responses with
`probeInstructions` help the agent communicate to the human engineer what probe session is needed.

### Alternative 3: Delay all routing until full probe done
Rejected: AUX send routing is immediately useful for monitor validation and is confirmed in
the 32SC state capture. Delaying wastes proven capability.

---

## Consequences

### Positive
- Agents can immediately use Layer A tools for monitor validation
- Layer B stubs prevent agents from silently ignoring unknown routing
- `probeInstructions` in Layer B responses creates a clear upgrade path
- `RoutingKind` allows tools to filter and explain routing by category
- Renaming `'guessed'` → `'inferred'` improves precision of confidence vocabulary

### Negative
- Two tiers require agents to check `status: 'not_verifiable_with_current_adapter'` before
  acting on routing data
- FX assign keys (`assign_FXA` etc.) are inferred pattern, not yet probe-confirmed — marked
  `confidence: 'inferred'` until a probe session confirms the key name

### Probe workflow to promote Layer B → Layer A
```bash
# Step 1: Baseline dump
pnpm probe-routing dump --device <IP> --out before-routing.json

# Step 2: Change one routing item in UC Surface (e.g. Channel 1 source: Analog 1 → Network 1)

# Step 3: Post-change dump
pnpm probe-routing dump --device <IP> --out after-routing.json

# Step 4: Diff with routing filter
pnpm probe-routing diff --before before-routing.json --after after-routing.json --kind input-source

# Step 5: Update state-mapper.ts with confirmed key
# Step 6: Change confidence from 'inferred' → 'observed'
```

---

## Traceability
- Traces to: #4 (StR-4)
- Verified by: (TEST issues to be created)
- Implemented by: routing.ts RoutingKind+MixerRoute, state-mapper.ts extractAuxMixes fix,
  tools.ts Layer A tools + Layer B stubs, probe-routing.ts CLI command
