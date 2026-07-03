# Fat Channel EQ Model Calibration Plan

This plan prioritizes guided calibration work for screenshot-derived EQ models represented in [packages/presonus-domain/src/schemas/eq-panel-specs.ts](packages/presonus-domain/src/schemas/eq-panel-specs.ts).

This plan covers all nine screenshot-derived EQ model specs.

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
| VINTAGE_3_BAND_EQ | Pointer-only frequency/gain controls with HI_Q/EQL/PHASE switches and possible stepped frequency/filter behavior. | lf_frequency, lf_gain, mf_frequency, mf_gain, hf_frequency, hf_gain, filter, hi_q, eql, phase |

## Execution table

Expected class vocabulary used here:

- continuous
- discrete
- continuous_or_stepped_unknown
- qualitative
- mode_or_branch_dependent

Current value source vocabulary is copied from `eq-panel-specs.ts`:

- exact_digital_readout
- exact_discrete_state
- visual_pointer_estimate
- qualitative_endpoint_only

| Model | Control | Priority | Expected class | Current value source | Probe notes |
|---|---|---|---|---|---|
| PASSIVE | low_boost | first | continuous | exact_digital_readout | Use dense anchors; fit forward/inverse after repeatability check. |
| PASSIVE | low_atten | first | continuous | exact_digital_readout | Verify monotonicity and endpoint stability across runs. |
| PASSIVE | bandwidth | first | continuous | exact_digital_readout | Check taper shape against readout and detect any hidden stepping. |
| PASSIVE | high_boost | first | continuous | exact_digital_readout | Probe full range with repeated endpoint samples. |
| PASSIVE | high_atten | first | continuous | exact_digital_readout | Confirm readout precision and repeatability before any formula fitting. |
| PASSIVE | low_frequency | first | discrete | exact_discrete_state | Enumerate all listed states and validate raw transition boundaries. |
| PASSIVE | high_frequency | first | discrete | exact_discrete_state | Enumerate all listed states and verify no hidden intermediate states. |
| PASSIVE | atten_sel | first | discrete | exact_discrete_state | Validate 5/10/20 state mapping and ordering. |
| VINTAGE | lf_frequency | first | discrete | exact_discrete_state | Probe button states individually and confirm stable state readback. |
| VINTAGE | lmf_frequency | first | discrete | exact_discrete_state | Verify full state set and deterministic transitions. |
| VINTAGE | hmf_frequency | first | discrete | exact_discrete_state | Confirm no duplicate raw encodings across button states. |
| VINTAGE | lf_gain | first | continuous | exact_digital_readout | Dense anchors with center and endpoint repeats for drift check. |
| VINTAGE | lmf_gain | first | continuous | exact_digital_readout | Same as LF gain; verify sign handling around 0 dB. |
| VINTAGE | hmf_gain | first | continuous | exact_digital_readout | Confirm monotonicity and per-step readout granularity. |
| VINTAGE | hf_gain | first | continuous | exact_digital_readout | Validate endpoint clamps and linearity assumptions. |
| VT_1_EQ | band1_frequency | second | continuous_or_stepped_unknown | visual_pointer_estimate | Treat pointer values as estimates until discrete/continuous behavior is proven. |
| VT_1_EQ | band1_gain | second | continuous_or_stepped_unknown | visual_pointer_estimate | Run dense anchors and look for quantization plateaus. |
| VT_1_EQ | band2_frequency | second | continuous_or_stepped_unknown | visual_pointer_estimate | Check for non-linear taper and possible stepped regions. |
| VT_1_EQ | band2_gain | second | continuous_or_stepped_unknown | visual_pointer_estimate | Validate behavior symmetry around nominal center if present. |
| VT_1_EQ | band3_frequency | second | continuous_or_stepped_unknown | visual_pointer_estimate | Include extra anchors near pointer tick boundaries. |
| VT_1_EQ | band3_gain | second | continuous_or_stepped_unknown | visual_pointer_estimate | Repeat mid-range samples for stability scoring. |
| VT_1_EQ | band4_frequency | second | continuous_or_stepped_unknown | visual_pointer_estimate | Verify upper-band taper and endpoint behavior. |
| VT_1_EQ | band4_gain | second | continuous_or_stepped_unknown | visual_pointer_estimate | Confirm no branch behavior linked to HF/LF peak switches. |
| RC_500_EQ | low_frequency | second | continuous_or_stepped_unknown | visual_pointer_estimate | Probe separately under low_peak_shelf states to detect branching. |
| RC_500_EQ | low_gain | second | continuous_or_stepped_unknown | visual_pointer_estimate | Capture anchors with both low_peak_shelf states active. |
| RC_500_EQ | mid_frequency | second | continuous_or_stepped_unknown | visual_pointer_estimate | Evaluate for stepped frequency buckets versus continuous sweep. |
| RC_500_EQ | mid_gain | second | continuous_or_stepped_unknown | visual_pointer_estimate | Confirm monotonicity and any dead zones. |
| RC_500_EQ | high_frequency | second | continuous_or_stepped_unknown | visual_pointer_estimate | Probe with high_peak_shelf branch permutations. |
| RC_500_EQ | high_gain | second | continuous_or_stepped_unknown | visual_pointer_estimate | Compare curves across high_peak_shelf states. |
| RC_500_EQ | low_peak_shelf | second | mode_or_branch_dependent | exact_discrete_state | Enumerate branch state and verify which controls are affected. |
| RC_500_EQ | high_peak_shelf | second | mode_or_branch_dependent | exact_discrete_state | Same as low branch; confirm independent branch effects. |
| VINTAGE_3_BAND_EQ | lf_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Probe for stepped detents versus smooth movement. |
| VINTAGE_3_BAND_EQ | lf_gain | third | qualitative | visual_pointer_estimate | Treat minus/plus around 0 dB as qualitative until calibrated. |
| VINTAGE_3_BAND_EQ | mf_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Validate whether listed frequencies are true discrete states. |
| VINTAGE_3_BAND_EQ | mf_gain | third | qualitative | visual_pointer_estimate | Check center behavior and any hidden quantization. |
| VINTAGE_3_BAND_EQ | hf_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Verify discrete vs continuous operation from raw transitions. |
| VINTAGE_3_BAND_EQ | hf_gain | third | qualitative | visual_pointer_estimate | Use repeated sweeps to bound uncertainty near center. |
| VINTAGE_3_BAND_EQ | filter | third | continuous_or_stepped_unknown | visual_pointer_estimate | Explicitly test OFF and all listed kHz marks for state boundaries. |
| VINTAGE_3_BAND_EQ | hi_q | third | mode_or_branch_dependent | exact_discrete_state | Confirm Q branch impact on MF/LF/HF behavior. |
| VINTAGE_3_BAND_EQ | eql | third | mode_or_branch_dependent | exact_discrete_state | Confirm branch semantics and affected control set. |
| VINTAGE_3_BAND_EQ | phase | third | mode_or_branch_dependent | exact_discrete_state | Verify phase state encoding and interaction with EQ enable path. |
| BAXANDALL_EQ | low_cut_hz | third | qualitative | visual_pointer_estimate | OUT/CUT/SHELF-like labels require cautious qualitative handling. |
| BAXANDALL_EQ | low_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Determine whether SHELF behaves as discrete endpoint or branch. |
| BAXANDALL_EQ | low_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Probe near 0 dB for stability and symmetry. |
| BAXANDALL_EQ | high_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Same as low_gain with upper-band context. |
| BAXANDALL_EQ | high_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Validate SHELF endpoint and tick-to-raw behavior. |
| BAXANDALL_EQ | high_cut_khz | third | qualitative | visual_pointer_estimate | OUT/CUT states must be verified before any numeric interpretation. |
| TUBE_EQ | low_peak_selector | third | discrete | visual_pointer_estimate | Selector labels exist but active state is pointer-derived; verify true stepping. |
| TUBE_EQ | low_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Probe with selector states held constant to isolate mapping. |
| TUBE_EQ | mid_dip_selector | third | discrete | visual_pointer_estimate | Enumerate nominal selector points and confirm raw boundaries. |
| TUBE_EQ | mid_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Evaluate taper separately per selector branch where needed. |
| TUBE_EQ | high_peak_selector | third | discrete | visual_pointer_estimate | Validate full selector state set and any skipped states. |
| TUBE_EQ | high_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Confirm behavior consistency across high peak selector states. |
| SOLAR_69_EQ | bass_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Includes flat endpoint; verify if endpoint is discrete branch. |
| SOLAR_69_EQ | bass_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Probe taper in low and high ranges for non-linearity. |
| SOLAR_69_EQ | mid_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Validate candidate stepped frequencies versus continuous interpolation. |
| SOLAR_69_EQ | mid_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Repeat anchors around center and upper range for stability. |
| SOLAR_69_EQ | high_10khz_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Check sign behavior around 0 dB and endpoint clamps. |
| SOLAR_69_EQ | level_adjust | third | continuous_or_stepped_unknown | visual_pointer_estimate | Verify scale interpretation from -20..0 under repeated runs. |
| SOLAR_69_EQ | level_mode | third | mode_or_branch_dependent | qualitative_endpoint_only | Treat plus/neutral/minus as qualitative until protocol-level state proof exists. |
| SOLAR_69_EQ | peak_trough | third | mode_or_branch_dependent | exact_discrete_state | Verify branch effects on dependent controls before formula work. |
| ALPINE_EQ_550 | lf_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Slider position only; confirm whether movement is truly continuous. |
| ALPINE_EQ_550 | mf_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Test across all printed marks and midpoints. |
| ALPINE_EQ_550 | hf_frequency | third | continuous_or_stepped_unknown | visual_pointer_estimate | Validate tick behavior near endpoints and center marks. |
| ALPINE_EQ_550 | lf_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Probe gain curve and potential stepped detents. |
| ALPINE_EQ_550 | mf_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Same as lf_gain with branch switches fixed. |
| ALPINE_EQ_550 | hf_gain | third | continuous_or_stepped_unknown | visual_pointer_estimate | Same as mf_gain with repeatability checks. |
| ALPINE_EQ_550 | filter | third | mode_or_branch_dependent | exact_discrete_state | Confirm filter switch branch behavior against affected controls. |

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
