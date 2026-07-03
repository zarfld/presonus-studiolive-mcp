# Fat Channel EQ Model Panel Specs

This document defines front-panel label baseline metadata for known Fat Channel EQ model IDs.

The screenshot-derived EQ models are baseline-only. These specs are not calibrated formulas and are not write-ready mappings.

## Scope and intent

- These specs are panel label baselines only.
- They are not calibrated formulas.
- They do not define write-ready raw mappings.
- They do not change write registration policy.
- They must not be used by production write tools.

## Status contract

All model specs in [packages/presonus-domain/src/schemas/eq-panel-specs.ts](packages/presonus-domain/src/schemas/eq-panel-specs.ts) use:

- source: uc_surface_screenshot
- sourceConfidence: visual_label_observed
- mappingStatus: front_panel_labels_only
- calibrationStatus: front_panel_baseline_only

## Current value source semantics

Every control records how confidently the current displayed value can be read from the screenshot/UI state.

- exact_digital_readout: digital number/text is explicitly shown in UI
- exact_discrete_state: selected button/switch/selector state can be read exactly
- visual_pointer_estimate: value inferred from knob/slider pointer position only
- qualitative_endpoint_only: only qualitative endpoints/classes are visible; exact numeric value not readable

## Raw protocol reminder

Mixer protocol controls are normalized raw values in the 0..1 range unless calibration proves otherwise.

## Why this is not calibration

Panel labels and pointer positions do not determine full transfer functions. A control may still be:

- non-linear
- quantized/stepped
- mode-dependent
- sign-ambiguous

Calibration must later capture at least:

1. raw protocol value
2. UI label/readout or discrete state at that raw value
3. repeatability across runs and hardware/firmware targets

Only then can mappings be promoted beyond front_panel_labels_only.

## Model coverage

The screenshot-derived model set covered is:

- PASSIVE (Passive EQ)
- VINTAGE (Vintage EQ)
- ALPINE_EQ_550 (Alpine 550 EQ)
- BAXANDALL_EQ (Baxandall EQ)
- RC_500_EQ (RC 500 EQ)
- SOLAR_69_EQ (Solar 69 EQ)
- TUBE_EQ (Tube EQ)
- VINTAGE_3_BAND_EQ (Vintage 3-Band EQ)
- VT_1_EQ (VT1 EQ)

See [docs/fat-channel-eq-model-calibration-plan.md](docs/fat-channel-eq-model-calibration-plan.md) for calibration sequencing priorities.
