# Fader / Preamp Calibration Notes

> **Status**: Calibration COMPLETE. Formulas implemented and tested.
> Evidence committed: `test/fixtures/32sc/fader-preamp/fader-preamp-calibration.json`

## Device

| Property | Value |
|---|---|
| Mixer model | PreSonus StudioLive 32SC |
| Serial | SD7E21010066 |
| Firmware | 3.4.0.111374 |
| Date | 2026-07-01 |
| IP | 157.247.3.12 |
| Capture method | Live HIL probe: `captures/probe-fader-preamp-cal/` (gitignored) |

## Captured channels

Channels were set to known fader and preamp positions by the operator during the
HIL session of 2026-07-01. These are UI-level values as displayed in UC Surface;
the corresponding raw state-key values need to be read by a `probe-routing dump`
at each position to establish the calibration mapping.

## Confirmed formulas

### Preamp gain (OBSERVED, 5/5 anchor points match)

| Parameter | Value |
|---|---|
| State key | `line.chN.preampgain.value` |
| Scale | Normalized 0–1 |
| Formula | `dB = value × 60` (linear) |
| Range | 0–60 dB |
| Confidence | `observed` (all 5 anchor points match exactly) |
| Evidence | `test/fixtures/32sc/fader-preamp/fader-preamp-calibration.json` |

### Fader level (inferred, 5 anchor points, max residual 0.025 dB)

| Parameter | Value |
|---|---|
| State key | `line.chN.volume` |
| Scale | Raw 0–100 (NOT 0–1) |
| Behavior | SCENE-STORED — reflects last saved scene, not live fader position |
| Formula (below unity) | `max(-84, 57.98 × log10(v / 73.36))` |
| Formula (at/above unity) | `(v - 73.36) / 26.64 × 10` |
| Unity raw value | 73.36 (= 0 dB) |
| Min/max dB | -84 dB (v=0) / +10 dB (v=100) |
| Confidence | `inferred` (taper shape confirmed from 2 intermediate anchor points) |
| Evidence | `test/fixtures/32sc/fader-preamp/fader-preamp-calibration.json` |

## Anchor points (fader)

| Channel | Raw value | UI dB | Notes |
|---|---:|---:|---|
| Ch 1 | 0 | −84 | Minimum stop (floor) |
| Ch 29 | 23.77 | −28.4 | Intermediate |
| Ch 21 | 59.28 | −5.36 | Intermediate |
| Ch 3 | 73.36 | 0 | Unity gain |
| Ch 2 | 100 | +10 | Maximum |

## State key mapping

Both keys confirmed:
- Fader: `line.chN.volume` (0–100 raw scale, scene-stored)
- Preamp gain: `line.chN.preampgain.value` (0–1 normalized, linear formula)

## Calibration formula status

| Parameter | Key | Formula | Status |
|---|---|---|---|
| Fader level | `line.chN.volume` | Piecewise: log10 below unity, linear above | `inferred` (5 anchor points) |
| Preamp gain | `line.chN.preampgain.value` | `dB = value × 60` | `observed` (5 exact matches) |

## Next task scope

```
Complete fader and preamp gain calibration.

Use the known-state points above as calibration anchors:
- Ch1 fader at −84 dB (min), 0 dB (unity), +10 dB (max)
- Ch5 preamp at 0 dB (min), Ch13 preamp at 60 dB (max)

For each point:
1. Set the UC Surface to that position
2. Run probe-routing dump
3. Diff against a reference to isolate the key
4. Record raw value vs UI value pair

Then fit the taper/gain formula, update INPUT_SRC_LABELS analogue for volume,
add golden fixture tests, and update routing-confidence-model.md.

Do NOT promote general StudioLive III support beyond StudioLive 32SC fw 3.4.0.111374.
```
