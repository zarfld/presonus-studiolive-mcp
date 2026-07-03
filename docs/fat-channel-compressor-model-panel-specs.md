# Fat Channel Compressor Model Panel Specs

This document defines front-panel label baseline metadata for known Fat Channel compressor model IDs.

The eight screenshot-derived add-on models are baseline-only. `STANDARD`, `TUBE`, and `FET` are also present for completeness and do not override existing calibrated mappings elsewhere in the domain layer.

## Known calibrated/partly calibrated models

`TUBE` and `FET` are included as descriptive panel metadata for already-known models. Their front-panel entries are more complete in this baseline set, but they remain metadata only.

This panel metadata does not override existing formula calibration in the domain mapping layer.

## Scope and intent

- These specs are panel label baselines only.
- They are not calibrated formulas.
- They do not define write-ready raw mappings.
- They do not change write registration policy.

## Status contract

All model specs in [packages/presonus-domain/src/schemas/compressor-panel-specs.ts](packages/presonus-domain/src/schemas/compressor-panel-specs.ts) use:

- source: uc_surface_screenshot
- sourceConfidence: visual_label_observed
- mappingStatus: front_panel_labels_only
- calibrationStatus: front_panel_baseline_only

## Raw protocol reminder

Mixer protocol controls are normalized raw values in the 0..1 range.

Panel labels alone are not enough to infer exact numeric taper. A labeled knob can still be:

- stepped or quantized
- non-linear
- mode-dependent
- sign-ambiguous

## Why this is not calibration

Sparse panel labels and endpoint text like FAST/SLOW do not determine the full control transfer function.

For model-specific calibration, future work must probe anchor pairs of:

1. raw protocol values
2. displayed panel labels and/or measured audio behavior

Only then can model formulas be promoted to observed or calibrated_inferred.

## Calibration follow-up requirements

Before any model-specific write mapping is used in production:

1. Capture guided raw anchors against displayed labels on real hardware.
2. Validate monotonicity and mode-dependent branches.
3. Confirm model variants across supported mixer/firmware combinations.
4. Add formula tests and confidence classification updates.
5. Keep production write tools unchanged until those checks are complete.

See the model-specific probe sequencing and class-by-class promotion rules in [docs/fat-channel-compressor-model-calibration-plan.md](docs/fat-channel-compressor-model-calibration-plan.md).
