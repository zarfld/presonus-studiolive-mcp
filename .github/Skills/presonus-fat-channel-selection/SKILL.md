---
name: presonus-fat-channel-selection
description: Use this skill when a task involves PreSonus StudioLive III or StudioLive 32SC Fat Channel compressor/EQ model selection, MCP mixer-state inspection, scene/GUID mapping, or channel-by-channel mix recommendations for kick, snare, bass, guitars, vocals, buses, wedges, IEMs, or raw Fat Channel state. Use it even if the user asks indirectly for “which compressor,” “which EQ,” “Fat Channel models,” “UC Surface settings,” or “scene file class IDs.” Do not use it for unrelated DAW plugin advice or generic mixing questions with no StudioLive/Fat Channel context.
compatibility: Agent Skills format; designed for coding/audio agents with optional access to the StudioLive MCP server described in references/mcp-interface-and-schemas.md.
metadata:
  version: "1.0.0"
  domain: "PreSonus StudioLive III Fat Channel"
  source-device: "StudioLive 32SC"
---

# PreSonus Fat Channel Selection Skill

## Purpose

Help an agent choose, inspect, or explain StudioLive III / 32SC Fat Channel compressor and EQ models without hallucinating capabilities.

This skill covers:

- Selecting compressor and EQ model families for a channel, bus, monitor mix, or mix target.
- Reading current model state through the StudioLive MCP resources when available.
- Mapping model names to live indices and `__classid` GUIDs for scene-file work.
- Explaining what the human operator should change in UC Surface when MCP writes are not available.

## Default behavior

Use a recommendation-first workflow. Do **not** present every available model as an equal menu. Pick a primary recommendation, give one fallback when useful, and explain the tradeoff in source-specific terms.

When the user asks for current mixer state, inspect resources first. When the user asks for offline advice, make an explicit assumption list and proceed without MCP reads.

## Required inputs

Extract these from the user request or mixer state:

1. **Source**: kick, snare, bass DI, bass amp, guitar, vocal, drum bus, mix bus, aux/wedge/IEM, etc.
2. **Goal**: transparent control, punch, warmth, glue, vintage color, feedback resistance, monitor comfort, or sidechain/ducking.
3. **Channel context**: line input, aux, sub, FX return, main, linked stereo pair, bus, or scene file.
4. **Availability constraint**: factory-only vs. Fat Channel Collection add-ons allowed. If unknown, prefer factory-safe options or mark add-on picks as “if installed.”

Ask for clarification only when a missing input changes the recommendation materially. Otherwise use sensible defaults and state them briefly.

## High-level workflow

1. Classify the request:
   - **Recommend**: choose model(s) and explain why.
   - **Inspect**: read current mixer state via MCP resources.
   - **Scene/GUID**: map names to live indices and `__classid` values.
   - **Debug/validate**: check whether state, schemas, or channel type support the requested operation.
2. Check the hard constraints in **Gotchas** before answering.
3. Use the quick selector below for first-pass model choice.
4. Load reference files only as needed:
   - Read `references/fat-channel-model-catalog.md` for detailed model descriptions and selector tables.
   - Read `references/mcp-interface-and-schemas.md` for MCP tools, resources, raw key paths, schemas, and write-status details.
   - Read `references/guid-mapping.md` for exact GUID/class ID values.
5. Return an actionable answer with either manual UC Surface steps or a read-only MCP inspection summary.
6. Run the validation checklist before finalizing.

## Gotchas

- **No write tools currently exist** in the described MCP server. Do not claim that the agent can set Fat Channel models or parameters autonomously. Advise the human operator what to change manually unless a future write tool is explicitly present.
- `presonus://mixer/{deviceId}/channels` exposes decoded model names only. It does **not** expose threshold, ratio, attack, release, EQ frequency, or Q values.
- Use `presonus://mixer/{deviceId}/raw/state` for actual parameter values such as `line.chN.comp.input`, `line.chN.comp.ratio`, `line.chN.eq.eqfreq1-4`, and `line.chN.eq.eqq1-4`.
- `line.chN.opt.compmodel.value` decodes as `Math.round(value * 10)` → compressor index `0..10`.
- `line.chN.opt.eqmodel.value` decodes as `Math.round(value * 9)` → EQ index `0..9`.
- `BUS_EQ` is only for aux, sub, FX, and bus contexts. Do not recommend it for line input channels.
- Add-on models require Fat Channel Collection Vol. 1. If availability is unknown, provide a factory-safe fallback.
- `STANDARD` is both a compressor name and an EQ name. Always qualify as `STANDARD compressor` or `STANDARD EQ` when ambiguity matters.
- Several add-on compressor/EQ models are currently decoded as `UNKNOWN` in the domain schema. For these, read raw parameters directly and avoid pretending the normalized schema supports them.
- Do not over-compress monitor wedges or IEM channels. For feedback-prone vocals, prioritize EQ/HPF/monitor strategy and conservative compression.

## Quick compressor selector

| Source / goal | Primary compressor | Fallback | Reason |
|---|---|---|---|
| Kick drum | `COMP_160` | `FET` | Tight VCA punch; FET if more aggressive transient clamp is wanted. |
| Snare top | `FET` | `BRIT_COMP` | Crack, fast control, attack shaping. |
| Snare bottom | `COMP_160` | `STANDARD` | Clean control without adding excess dirt. |
| Room mics | `FET` | `FC_670` | Slammed room energy or vintage depth. |
| Drum bus | `BRIT_COMP` | `FC_670` | Glue and punch; FC_670 for vintage smoothness. |
| Bass DI | `COMP_160` | `TUBE_CB` | Stable low-end control; tube option for warmth. |
| Bass amp | `TUBE_CB` | `CLASSIC_COMPRESSOR` | Warm smoothing or clean live control. |
| Electric guitar | `RC_500_COMPRESSOR` | `BRIT_COMP` | Controlled pick dynamics and bus-like cohesion. |
| Acoustic guitar | `TUBE` | `TUBE_CB` | Smooth leveling without harshness. |
| Lead vocal | `TUBE_CB` | `TUBE` / `VT_1_COMPRESSOR` | Smooth vocal leveling; VT-1 for polished tube bus character. |
| Backing vocals | `CLASSIC_COMPRESSOR` | `STANDARD` | Even levels without excessive color. |
| Speech | `STANDARD` | `CLASSIC_COMPRESSOR` | Transparent control. |
| Mix bus | `BRIT_COMP` | `FC_670` / `VT_1_COMPRESSOR` | Modern glue or vintage/tube cohesion. |

## Quick EQ selector

| Source / goal | Primary EQ | Fallback | Reason |
|---|---|---|---|
| Feedback notch / surgical correction | `STANDARD EQ` | — | Precise cuts and corrective work. |
| Broad warmth or air | `BAXANDALL_EQ` | `PASSIVE` | Gentle tonal balance. |
| Kick/bass low-end shaping | `PASSIVE` | `STANDARD EQ` | Broad low-end enhancement; use STANDARD for precise cleanup. |
| Rock/metal drums | `ALPINE_EQ_550` | `SOLAR_69_EQ` | API-style punch or British warmth. |
| Snare presence | `SOLAR_69_EQ` | `ALPINE_EQ_550` | Warm midrange or aggressive cut. |
| Electric guitar | `ALPINE_EQ_550` | `RC_500_EQ` | Rock presence, low-mid control. |
| Vocal warmth/air | `SOLAR_69_EQ` | `TUBE_EQ` / `VT_1_EQ` | British presence or tube dimension. |
| Monitor comfort | `BAXANDALL_EQ` | `VINTAGE_3_BAND_EQ` | Fast, broad, non-surgical tonal shaping. |
| Mix bus | `BAXANDALL_EQ` | `VT_1_EQ` | Overall balance; tube option for color. |
| Aux/sub/FX bus only | `BUS_EQ` | `BAXANDALL_EQ` if available | Use only where bus EQ is valid. |

## Decision rules

### Corrective channel work

Use `STANDARD EQ` first for resonances, mud, harshness, or feedback. Pair with `STANDARD compressor` when the goal is transparent leveling. Switch to a character EQ/compressor only after the corrective problem is handled.

### Punch and transient control

Use `COMP_160`, `FET`, or `BRIT_COMP`. Prefer `COMP_160` for tight VCA control on kick/bass. Prefer `FET` for snare/room aggression. Prefer `BRIT_COMP` for bus glue.

### Warmth and musical character

Use `TUBE`, `TUBE_CB`, `FC_670`, `VT_1_COMPRESSOR`, or `EVEREST_C100A`. Pair with `PASSIVE`, `SOLAR_69_EQ`, `TUBE_EQ`, or `VT_1_EQ` depending on how much color is desired.

### Live vocal with feedback risk

Default to conservative compression. Use HPF and corrective EQ first. Avoid heavy makeup gain into wedges. For main vocals used as a sidechain source, keep the vocal channel stable and use sidechain compression on the ducked instruments, not on a group if the console/MCP cannot sidechain groups.

### Bus and group processing

Use bus-capable models and keep gain reduction conservative unless the user explicitly wants audible color. For buses, prefer broad EQ moves over surgical channel-style correction.

## MCP read workflow

Use this when the user asks what is currently active on the mixer or asks to validate the current scene.

1. Call `discover_mixers` if no `deviceId` is known.
2. Call `validate_mixer_identity` when a serial number, role, or FOH/stagebox identity matters.
3. Call `refresh_mixer_state({ deviceId })` before reading Fat Channel state if the cache may be stale.
4. Read `presonus://mixer/{deviceId}/channels` for `compModelName` and `eqModelName`.
5. Read `presonus://mixer/{deviceId}/raw/state` only when actual parameter values are needed.
6. Present findings as current-state facts, then recommendations separately.

## Output templates

### Recommendation answer

```markdown
## Recommendation

**Channel/source:** [source]
**Goal:** [goal]
**Compressor:** `[model]` — [one-sentence reason]
**EQ:** `[model]` — [one-sentence reason]

## Settings strategy

- Correct first: [HPF / notch / mud cleanup]
- Compress second: [control target, conservative/aggressive]
- Color last: [optional character move]

## Manual UC Surface steps

1. Select [channel/bus].
2. Choose `[compressor model]` in Fat Channel compressor model selector.
3. Choose `[EQ model]` in Fat Channel EQ model selector.
4. Adjust parameters by ear while watching gain reduction and output level.

## Caveats

[add-on availability, monitor feedback, bus-only restrictions, or schema/write limitations]
```

### MCP inspection answer

```markdown
## Current Fat Channel state

| Channel | Name | Compressor | EQ | Notes |
|---|---|---|---|---|
| line.chN | [name] | `[compModelName]` | `[eqModelName]` | [raw params if inspected] |

## Interpretation

[What this implies for the user’s stated goal.]

## Recommended next change

[Manual change; do not claim MCP can write unless a write tool exists.]
```

### Scene/GUID answer

```markdown
| Model type | Model | Live index | `__classid` |
|---|---:|---:|---|
| Compressor | `[model]` | [index] | `{GUID}` |
| EQ | `[model]` | [index] | `{GUID}` |
```

## Validation checklist

Before final answer, verify:

- [ ] The recommendation matches the source and target, not just generic taste.
- [ ] Factory-only vs add-on availability is handled.
- [ ] Line-channel vs bus-only constraints are respected.
- [ ] `STANDARD` compressor and `STANDARD EQ` are not confused.
- [ ] Current-state claims are supported by MCP reads or explicitly marked as assumptions.
- [ ] No autonomous write capability is claimed unless a write tool is actually present.
- [ ] Scene/GUID values are copied from `references/guid-mapping.md`, not reconstructed from memory.
- [ ] Parameter values for unsupported schemas are read from `raw/state` or described as unavailable.

## Reference loading rules

- Load `references/fat-channel-model-catalog.md` when detailed model behavior, source-specific alternatives, or complete selector tables are needed.
- Load `references/mcp-interface-and-schemas.md` when working with MCP tools/resources, raw paths, decoded model values, or accepted domain schemas.
- Load `references/guid-mapping.md` when creating or validating scene file class IDs.
- Load `assets/eval_queries.json` only when testing whether this skill triggers appropriately.
