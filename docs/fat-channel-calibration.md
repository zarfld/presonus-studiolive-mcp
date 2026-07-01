# Fat Channel Calibration

This document records what is known (observed), what is estimated (guessed),
and what the probe workflow is to promote guesses to observations.

> **KEY RULE**: Do not change `parameterConfidence` from `'guessed'` to
> `'observed'` without completing the probe-fat-channel workflow described
> below and linking the evidence artifact.

---

## Model identification

Fat Channel model identity is decoded from two live state keys:

| Key | Formula | Confirmed hardware |
|---|---|---|
| `line.chN.opt.compmodel` | `index = Math.round(raw × 10)` (11 slots: 3 factory + 8 add-on) | StudioLive 32SC fw 3.3.0.109659 |
| `line.chN.opt.eqmodel` | `index = Math.round(raw × 9)` (10 slots: 3 factory + 7 add-on) | StudioLive 32SC fw 3.3.0.109659 |

### Compressor models — confidence by evidence source

| Index | Model | Confidence | Evidence |
|---|---|---|---|
| 0 | STANDARD | `observed` | Confirmed on 32SC fw 3.3.0.109659 by UC Surface cross-validation |
| 1 | TUBE | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 2 | FET | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 3 | BRIT\_COMP | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 4 | CLASSIC\_COMPRESSOR | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 5 | COMP\_160 | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 6 | EVEREST\_C100A | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 7 | FC\_670 | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 8 | RC\_500\_COMPRESSOR | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 9 | TUBE\_CB | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 10 | VT\_1\_COMPRESSOR | `observed` | Confirmed on 32SC fw 3.3.0.109659 |

### EQ models — confidence by evidence source

| Index | Model | Confidence | Evidence |
|---|---|---|---|
| 0 | STANDARD (EQ) | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 1 | PASSIVE | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 2 | VINTAGE | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 3 | ALPINE\_EQ\_550 | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 4 | BAXANDALL\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 5 | RC\_500\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 6 | SOLAR\_69\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 7 | TUBE\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 8 | VINTAGE\_3\_BAND\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 9 | VT\_1\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |

**Scene/cache GUIDs confirmed on 32SC captures**: `STANDARD`, `TUBE`, `FET`,
`COMP_160`, `EVEREST_C100A`, `STANDARD EQ`, `PASSIVE EQ`, `BUS_EQ`.
Remaining add-on model GUIDs are in the decoder table but not yet confirmed
in scene/cache files (live-index-only evidence).

---

## DSP parameter values — calibration status

All continuous parameter values (EQ gain/freq/Q, comp threshold/ratio/attack/release/makeup,
gate, limiter) are currently `parameterConfidence: 'guessed'`.

This means the de-normalization formulas in
`packages/presonus-adapter/src/state-mapper.ts` and
`packages/presonus-domain/src/schemas/fat-channel.ts` are **best estimates
only** — they have not been verified against actual hardware measurements.

| Parameter group | Formula (guessed) | Source | Status |
|---|---|---|---|
| EQ gain | `(raw - 0.5) × 36` → ±18 dB | state-mapper.ts | `guessed` |
| EQ frequency | `20 × 1000^raw` → 20 Hz–20 kHz (log) | state-mapper.ts | `guessed` |
| EQ Q | `0.1 × 160^raw` → 0.1–16 (log) | state-mapper.ts | `guessed` |
| Comp threshold | `(raw - 1) × 60` → −60 to 0 dBFS | state-mapper.ts | `guessed` |
| Comp makeup | `raw × 24` → 0–24 dB | state-mapper.ts | `guessed` |
| Comp ratio | `1 + raw × 15` → 1×–16× | state-mapper.ts | `guessed` |
| Comp/gate attack | `raw × 150` → 0–150 ms | state-mapper.ts | `guessed` |
| Comp/gate/lim release | various | state-mapper.ts | `guessed` |
| Gate threshold | `(raw - 1) × 80` → −80 to 0 dBFS | state-mapper.ts | `guessed` |
| Gate range | `raw × −80` → 0 to −80 dB | state-mapper.ts | `guessed` |
| Limiter threshold | `(raw - 1) × 20` → −20 to 0 dBFS | state-mapper.ts | `guessed` |
| Fader taper | Log law assumed (0.75 ≈ unity) | state-mapper.ts | `guessed` |

The `ChannelFatStateSchema.parameterConfidence` field in
`packages/presonus-domain/src/schemas/fat-channel.ts` propagates this
uncertainty to consumers. Raw state values are accessible via the
`mixer-raw-state` resource (`presonus://mixer/{id}/raw/state`).

---

## Unverified add-on model scene GUIDs

The following model GUIDs appear in the live decoder table but have NOT been
confirmed in scene/cache file `__classid` fields:

- Compressor: `FC_670`, `RC_500_COMPRESSOR`, `TUBE_CB`, `VT_1_COMPRESSOR`
- EQ: `ALPINE_EQ_550`, `BAXANDALL_EQ`, `RC_500_EQ`, `SOLAR_69_EQ`, `TUBE_EQ`, `VINTAGE_3_BAND_EQ`, `VT_1_EQ`

Do not claim scene file support for these until a scene capture with those
models active is collected and the `__classid` field confirmed.

---

## Probe-fat-channel calibration workflow

To promote parameter calibration from `guessed` to `observed`:

### Prerequisites

- Physical StudioLive 32SC (or other III-series) connected to LAN
- UC Surface running and showing the mixer

### Procedure

For each parameter (e.g. EQ band 1 gain):

1. Set a specific value in UC Surface (e.g. EQ band 1 gain = +6 dB)
2. Capture state: `pnpm probe:dev dump-state -d <ip> --out captures/fat-calibration/eq-gain-6db.json`
3. Note the raw value of `line.ch1.eq.eqgain1`
4. Repeat for multiple values (e.g. −12 dB, 0 dB, +12 dB)
5. Fit the formula to the raw→display mapping
6. Update the corresponding `normalizedTo*()` function in `fat-channel.ts`
7. Update tests to assert the new formula
8. Record evidence in `captures/` with required metadata (see hil-validation skill)
9. Change `parameterConfidence` from `'guessed'` to `'observed'` for that parameter
10. Update this document with the confirmed formula and evidence reference

### Required capture metadata

```yaml
mixerModel: "StudioLive 32SC"
firmware: "3.3.0.109659"
serialRedacted: true
connection: "LAN TCP 53000"
serverCommit: "<git-sha>"
nodeVersion: "<node-version>"
command: "pnpm probe:dev dump-state"
capturedAt: "<ISO-8601>"
purpose: "Fat Channel probe — EQ gain calibration"
```

---

## References

- `packages/presonus-domain/src/schemas/fat-channel.ts` — schemas and de-norm helpers
- `packages/presonus-adapter/src/state-mapper.ts` — `extractFatChannelState()`
- `packages/presonus-domain/src/schemas/fat-channel.ts` — `COMPRESSOR_MODEL_BY_INDEX`, `EQ_MODEL_BY_INDEX`
- ADR-004: Fat Channel Collection and model identification
- `.github/skills/presonus-fat-channel-selection/SKILL.md` — Fat Channel selection skill
- `.github/skills/hil-validation/SKILL.md` — HIL evidence requirements
