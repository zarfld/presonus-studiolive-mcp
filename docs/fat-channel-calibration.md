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

Calibrated from HIL probe on StudioLive 32SC SD7E21010066 fw **3.4.0.111374** (2026-07-01).
Evidence: `test/fixtures/32sc/fat-channel/fat-channel-calibration.json` (31 anchor points).

| Parameter group | Formula | Confidence | Notes |
|---|---|---|---|
| EQ gain | `(raw−0.5)×30` → ±15 dB | **observed** | 5 points, max error 0.005 dB |
| EQ frequency | `36×502^raw` → 36 Hz–18 kHz | **calibrated\_inferred** | 5 pts band-1, max 0.013% |
| HPF frequency | `24×42^raw` → 24 Hz–1 kHz | **calibrated\_inferred** | 6 pts, max 0.46% |
| EQ Q factor | `0.028×466^raw` → 0.03–13 | **calibrated\_inferred** | 5 pts, max 0.17 Q units |
| EQ band type | `round(raw×3)` → 4 types | **calibrated\_inferred** | BELL (1.0) and LOW\_SHELF (0.333) confirmed; others probe\_required |
| Comp threshold (STANDARD) | `(raw−1)×56` → -56 to 0 dBFS | **calibrated\_inferred** | 2 pts; key is `comp.threshold` |
| Comp makeup (STANDARD) | `raw×27.6` → 0–28 dB | **calibrated\_inferred** | 2 pts; key is `comp.gain` |
| Comp attack | `0.2×e^(10.3×raw)` ms | **calibrated\_inferred** | 2 pts; valid only raw 0.15–0.40 |
| Gate threshold | `(raw−1)×84` → -84 to 0 dBFS | **calibrated\_inferred** | 2 pts; max 0.007 dB |
| Comp ratio | probe\_required | **probe\_required** | 2 pts only (4.7:1, 10.2:1); range unconfirmed |
| Comp/gate release | probe\_required | **probe\_required** | 1 data point only |
| Gate range/depth | probe\_required | **probe\_required** | no calibration data |
| Limiter threshold | probe\_required | **probe\_required** | no calibration data |
| Fader taper | `volumeRaw100ToDb(v)` | **calibrated\_inferred** | `line.chN.volume` is 0–100 scene-stored; see `docs/hil/fader-preamp-calibration-notes.md` |

> **IMPORTANT: FET vs STANDARD compressor key difference**
> - STANDARD/TUBE/etc.: threshold key = `comp.threshold`, makeup key = `comp.gain`
> - FET model: threshold-like key = `comp.input`, gain-like key = `comp.output`
> - The adapter now tries `comp.threshold` first, falls back to `comp.input`.
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
