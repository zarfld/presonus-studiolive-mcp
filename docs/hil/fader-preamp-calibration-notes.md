# Fader / Preamp Calibration Notes

> **Status**: Raw observations captured. Not yet converted into a calibration formula.
> This file is committed evidence for the next calibration task.
> Do **not** fabricate continuity — use only the raw values below.

## Device

| Property | Value |
|---|---|
| Mixer model | PreSonus StudioLive 32SC |
| Serial | SD7E21010066 |
| Firmware | 3.4.0.111374 |
| Date | 2026-07-01 |
| IP | 157.247.3.12 |
| Capture method | Live UC Surface observation during HIL routing probe session |

## Captured channels

Channels were set to known fader and preamp positions by the operator during the
HIL session of 2026-07-01. These are UI-level values as displayed in UC Surface;
the corresponding raw state-key values need to be read by a `probe-routing dump`
at each position to establish the calibration mapping.

## Raw observations

| Channel | UI fader (dB) | UI preamp gain (dB) | Notes |
|---|---:|---:|---|
| Ch 1 | −84 (min) | 32 | Fader at minimum stop |
| Ch 2 | +10 (max) | 22 | Fader at maximum stop |
| Ch 3 | 0 (unity) | 22 | Fader at 0 dB / unity gain |
| Ch 5 | — | 0 (min) | Overhead — preamp at minimum stop |
| Ch 13 | — | 60 (max) | Preamp at maximum stop |

> **Note**: "—" means the fader or preamp position was not explicitly recorded for
> that channel at the time of capture.

## State key mapping (still required)

To convert the UI values above into raw normalized adapter values, run:

```bash
# Set Ch1 fader to each calibration point in UC Surface, then:
pnpm probe:dev probe-routing dump --device 157.247.3.12 --out captures/probe-fader-cal/ch1-min.json
# Repeat for ch1-unity, ch1-max, ch2-max, ch3-unity

# Similarly for preamp gain:
pnpm probe:dev probe-routing dump --device 157.247.3.12 --out captures/probe-preamp-cal/ch5-min.json
# Repeat for ch13-max
```

Expected state keys (to be confirmed by diff):
- Fader: `line.chN.volume` (normalized 0–1, formula suspected log law)
- Preamp gain: `line.chN.preamp.gain` or similar (key pattern unconfirmed)

## Calibration formula status

| Parameter | Key | Formula | Status |
|---|---|---|---|
| Fader level | `line.chN.volume` (suspected) | Unknown log taper | `probe_required` |
| Preamp gain | Unknown key pattern | Unknown linear/log | `probe_required` |

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
