# Fat Channel EQ Model Calibration Plan

This plan prioritizes guided calibration work for screenshot-derived EQ models represented in [packages/presonus-domain/src/schemas/eq-panel-specs.ts](packages/presonus-domain/src/schemas/eq-panel-specs.ts).

## Priority tiers

### First priority

Reason: Controls expose exact digital readouts and/or clear discrete button states, which provide high-confidence anchors quickly.

| Model | Why first | Key controls to probe first |
|---|---|---|
| PASSIVE | Multiple exact digital value readouts and readable selector states. | low_boost, low_atten, bandwidth, high_boost, high_atten, low_frequency, high_frequency, atten_sel |
| VINTAGE | Frequency buttons are discrete and gain controls have digital readouts. | lf_frequency, lmf_frequency, hmf_frequency, lf_gain, lmf_gain, hmf_gain, hf_gain |

### Second priority

Reason: Clear numeric scales and likely monotonic behavior, but values are mostly pointer-derived today.

| Model | Why second | Key controls to probe first |
|---|---|---|
| VT_1_EQ | Clear per-band numeric scales across full four-band panel. | band1_frequency, band1_gain, band2_frequency, band2_gain, band3_frequency, band3_gain, band4_frequency, band4_gain |
| RC_500_EQ | Numeric frequency/gain scales with peak/shelf switches that require branch checks. | low_frequency, low_gain, mid_frequency, mid_gain, high_frequency, high_gain, low_peak_shelf, high_peak_shelf |

### Third priority

Reason: Labels are sparse, qualitative, selector-like, or pointer-only with higher interpretation risk.

| Model | Why third | Key controls to probe first |
|---|---|---|
| BAXANDALL_EQ | Mixed labels including OUT/CUT/SHELF with pointer-only readability. | low_cut_hz, low_frequency, high_frequency, high_cut_khz, low_gain, high_gain |
| TUBE_EQ | Selector-heavy panel and pointer-only frequency controls with no digital readout. | low_peak_selector, mid_dip_selector, high_peak_selector, low_frequency, mid_frequency, high_frequency |
| SOLAR_69_EQ | Qualitative controls and uncertain level_mode encoding. | bass_frequency, bass_gain, mid_frequency, mid_gain, high_10khz_gain, level_adjust, level_mode |
| ALPINE_EQ_550 | Slider/knob pointer-only controls and switch interaction risk. | lf_frequency, mf_frequency, hf_frequency, lf_gain, mf_gain, hf_gain, filter |

## Probe method and promotion guardrails

1. Run guided raw anchor sweeps for each control using normalized points in 0..1.
2. Capture UI state and raw socket stream together.
3. Repeat runs to verify stability and monotonicity.
4. Validate on more than one hardware/firmware target before promotion.
5. Keep mappingStatus/calibrationStatus unchanged until promotion evidence is complete.

Non-goals:

- No write tool enablement.
- No runtime write registration changes.
- No formula claims from screenshots alone.
