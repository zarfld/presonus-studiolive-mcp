# Routing Confidence Model

This document defines the routing confidence vocabulary used in the MCP backend,
maps each value to examples in the codebase, and describes the promotion path
from uncertain to verified.

> **KEY RULE**: Do not present uncertain routing as verified routing. A
> consuming sound-engineer agent must be able to distinguish what the backend
> directly observes, what it infers, and what requires probe evidence.

---

## Confidence values

| Value | Meaning | When to use |
|---|---|---|
| `observed` | Directly read from live mixer state keys; confirmed by hardware probe | Layer A facts confirmed on 32SC fw 3.3.0.109659 |
| `inferred` | Derived from key patterns or normalized mappings; plausible but not probe-confirmed | AUX send levels, FX assignment patterns |
| `probe_required` | Must not be trusted until a probe diff-state session is run | Output patch source names, AUX de-normalization |
| `stub` | Tool deliberately returns probe instructions only; Layer B placeholder | (no current tools — both promoted 2026-07-01) |
| `not_verifiable_with_current_adapter` | Permanently unobservable via current protocol/adapter | Physical cable routing, AVB stream mapping |
| `planned` | Requirement exists; implementation not yet present | AUX/FX/SUB/MAIN channel extraction (see below) |

---

## Layer A — Observable live state (Layer A)

These items are directly observable from the mixer's live state via the
featherbear API without any additional probe session.

### Confirmed observed on StudioLive 32SC firmware 3.3.0.109659

| Item | State keys | Confidence |
|---|---|---|
| Channel mute | `line.chN.mute` | `observed` |
| Channel name (scribble strip) | `line.chN.username` | `observed` |
| Channel fader | `line.chN.volume` (formula TBD — see below) | `observed` (key), `probe_required` (formula) |
| Channel pan | `line.chN.pan` | `observed` |
| Sub group assignment | `line.chN.sub1`–`sub4` | `observed` |
| AUX assignment | `line.chN.assign_aux1`–`assign_aux32` | `observed` |
| Main LR assignment | `line.chN.lr` | `observed` |
| FlexMix bus mode | `aux.chN.busmode.value` | `observed` |
| Fat Channel model — compressor | `line.chN.opt.compmodel` (formula confirmed) | `observed` |
| Fat Channel model — EQ | `line.chN.opt.eqmodel` (formula confirmed) | `observed` |
| Fat Channel ON/OFF flags | `line.chN.comp.on`, `eq.on`, `gate.on`, `limit.on` | `observed` |
| Meter activity | Real-time meter packets | `observed` |

### Inferred from Layer A (key observed, formula unconfirmed)

| Item | State keys | Confidence | Gap |
|---|---|---|---|
| AUX send level | `line.chN.auxM` (raw 0–1) | `inferred` | De-normalization formula unverified — run probe diff-state while dragging AUX faders in UC Surface |
| FX send assignment | `line.chN.assign_FXA`–`FXH` | `inferred` | Key pattern inferred from uppercase FX convention; not probe-confirmed |
| FX send level | `line.chN.FXA`–`FXH` | `inferred` | Same as AUX send level |
| Fat Channel parameter values (EQ gain/freq/Q, comp threshold/ratio/attack/release/makeup, gate, limiter) | `line.chN.eq.*`, `comp.*`, `gate.*`, `limit.*` | `inferred`/`guessed` | De-normalization formulas are best-estimate; run `probe-fat-channel` to confirm |
| Fader taper | `line.chN.volume` | `inferred` | Log law assumed; run fader movement probe to confirm |

---

## Layer B — Hardware/probe-dependent routing

These items require operator-driven probe sessions before they can be trusted.

| Item | Tool | Confidence | Required probe |
|---|---|---|---|
| Physical input source routing | `get_input_routing` | `inferred` | **HIL COMPLETED 2026-07-01**: key `line.chN.inputsrc.value` confirmed. Index 0=Local, 1=Stage Box (observed). Indices 2–3 labels still probe_required. |
| AVB stream routing | `validate_avb_routing` | `observed` | **HIL COMPLETED 2026-07-01**: keys `stageboxsetup.avb_src_{range}.value` confirmed on 32SC+32R. Labels from `.strings` array (device-specific). |
| Output patch source names | `validate_output_routing`, `mixer-routing-outputs` | `probe_required` | Source index known; source name → index mapping needs `probe-routing diff --kind bus-to-output` |
| AUX send de-normalization | `get_aux_mix`, `mixer-auxes` | `probe_required` | Run `probe-routing diff --kind channel-to-aux` while dragging AUX faders |
| Pre/post AUX routing | `mixer-auxes` (prePost field) | `probe_required` | Probe while toggling pre/post switch in UC Surface |

### Layer B stub tools — PROMOTED (2026-07-01)

`get_input_routing` and `validate_avb_routing` were stub tools that always returned
`status: 'not_verifiable_with_current_adapter'`. Both were promoted on 2026-07-01 after
successful HIL probe sessions on StudioLive 32SC fw 3.3.0.109659 + StudioLive 32R.

**Evidence**: `captures/probe-input-source/` and `captures/probe-avb/`.

- `get_input_routing` — now returns `status: 'inferred'` with per-channel `inputSourceIndex` / `inputSourceLabel`.
  Confidence: `inferred` (key + indices 0,1 confirmed; indices 2,3 still `probe_required`).
- `validate_avb_routing` — now returns `status: 'observed'` with full stream block assignments and device-specific labels.
  Confidence: `observed` (key + value mapping + labels all confirmed from hardware).

---

## Layer C — Not verifiable

| Item | Confidence | Reason |
|---|---|---|
| Physical cable connections | `not_verifiable_with_current_adapter` | Software cannot see hardware patch bay |
| AVB stream assignments without 32R | `not_verifiable_with_current_adapter` | Requires physical 32R stagebox |
| Output patch source names | `not_verifiable_with_current_adapter` until probe run, then `probe_required` | Source index 0–27 known; mapping to bus names requires probe diff |

---

## Planned / backlog items

The following routing-related items have requirements but are not yet implemented
in the MCP backend. They are classified as `planned` in the inventory.

| Item | Status | Note |
|---|---|---|
| AUX channel extraction (aux bus mixer state) | `planned` — state-mapper.ts TODO line ~528 | AUX/FX/SUB/MAIN channel extraction is Phase P1.4 work |
| FX bus channel extraction | `planned` | Part of the same P1.4 diff workflow |
| SUB bus mixer state | `planned` | `list_sub_groups` already covers fixed topology; full extraction planned |
| MAIN bus mixer state | `planned` | Not yet extracted |

---

## Promotion path

```
planned ──► stub ──► probe_required ──► inferred ──► observed
                                                        ▲
                                             HIL evidence required
```

**HIL is required to promote any confidence level to `observed`.** Do not
change confidence from `inferred`, `probe_required`, or `guessed` to `observed`
without:

1. Hardware probe session on physical StudioLive hardware
2. Evidence captured in `captures/` with required metadata
   (see `docs/hil-validation.md` and the `hil-validation` skill)
3. Test updated with evidence reference

---

## Probe workflow

To promote a routing item:

1. Connect to mixer: `pnpm probe:dev discover`
2. Capture baseline: `pnpm probe:dev dump-state -d <ip> --out captures/baseline.json`
3. Change the control in UC Surface (e.g. drag AUX 1 send for channel 1)
4. Capture after: `pnpm probe:dev dump-state -d <ip> --out captures/after.json`
5. Diff: `pnpm probe:dev diff-state --before captures/baseline.json --after captures/after.json`
6. Map the changed key to the parameter
7. Update `state-mapper.ts` constant and confidence annotation
8. Update this document and `docs/generated/capability-inventory.json` (run `pnpm inventory`)

Or use the live probe tools:

- `start_routing_probe` — capture baseline (5-min TTL)
- `complete_routing_probe` — diff against baseline, return changed keys

---

## References

- `packages/presonus-domain/src/schemas/routing.ts` — `RoutingConfidenceSchema`
- `packages/presonus-adapter/src/state-mapper.ts` — confidence annotations
- `packages/presonus-mcp-server/src/tools.ts` — Layer B stubs
- `packages/presonus-mcp-server/src/__tests__/routing-layer-b-confidence.test.ts` — invariant test
- ADR-008: Two-layer routing model (Layer A / Layer B)
- `.github/skills/routing-confidence-probe-promotion/SKILL.md` — routing skill
