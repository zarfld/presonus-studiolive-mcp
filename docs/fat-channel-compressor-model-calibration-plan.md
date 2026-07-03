# Fat Channel Compressor Model Calibration Plan (Screenshot-Derived Models)

## Purpose

This plan defines model-specific guided calibration priorities for the eight screenshot-derived compressor models captured as front-panel baselines in [packages/presonus-domain/src/schemas/compressor-panel-specs.ts](packages/presonus-domain/src/schemas/compressor-panel-specs.ts).

Scope of this plan:

- prioritize which controls to probe first
- classify expected control behavior before probing
- define evidence needed to promote confidence from baseline-only metadata

Scope note:

- This table covers model-specific dynamics controls only.
- Generic side-chain, key-listen, key-filter, and processor on/off controls are intentionally excluded unless their behavior differs by compressor model.
- Those generic controls remain covered by panel baseline metadata and future generic control probes.

This plan does not enable write tools or claim calibrated mappings.

## Model set

The eight screenshot-derived models covered here are:

- COMP_160
- BRIT_COMP
- CLASSIC_COMPRESSOR
- EVEREST_C100A
- FC_670
- RC_500_COMPRESSOR
- TUBE_CB
- VT_1_COMPRESSOR

`TUBE` and `FET` are intentionally not part of this eight-model uncalibrated screenshot calibration plan.

## Behavior class key

- continuous: expected monotonic analog-style curve over raw 0..1
- discrete: expected stepped positions or enumerated values
- continuous_or_stepped_unknown: likely sweep-like behavior, but stepped detents are not ruled out yet
- discrete_or_continuous_unknown: panel/readout suggests selectable states, but continuous interpolation is not ruled out yet
- ratio_or_limiter_curve_unknown: ratio-style control that may transition into limiter-style behavior near upper range
- qualitative: labels likely describe behavior classes rather than fixed numeric units
- mode-dependent: mapping branch depends on a mode selector

## Priority rubric

- P1: highest risk to write correctness or ambiguity; probe first
- P2: important shaping controls; probe after P1
- P3: lower-risk or secondary controls; probe after P2

## Global probe method

1. Use guided calibration with dense points for likely continuous controls.
2. Use ordered single-step or focused sweep for likely discrete/mode controls.
3. Capture raw socket stream and UI evidence in parallel.
4. Restore channel state after each probe run.
5. Repeat at least once on a second hardware/firmware target before promotion.

Recommended command family:

- `pnpm probe:dev probe-fat-guided-calibration`
- `pnpm probe:dev probe-raw-socket`

## Calibration table

| Model | Control | Priority | Expected class | Why first | Probe notes |
|---|---|---|---|---|---|
| COMP_160 | compression | P1 | ratio_or_limiter_curve_unknown | Includes infinity endpoint label and may not behave as a normal ratio curve. | Dense points plus endpoint checks; verify where `∞` appears in raw domain and if transition is stepped. |
| COMP_160 | threshold | P1 | continuous | Primary dynamics threshold anchor needed for model usability. | Probe dense anchors and verify sign/unit labeling against UI. |
| COMP_160 | output_gain | P2 | continuous | Output trim usually monotonic but taper may be non-linear. | Probe dense points; verify endpoints and center feel. |
| BRIT_COMP | ratio | P1 | discrete_or_continuous_unknown | Classic compressor-style ratio often switches among fixed ratios. | Use ordered sweeps; confirm finite set of states and raw breakpoints. |
| BRIT_COMP | threshold | P1 | continuous | Required to align effective compression onset. | Probe dense points; validate monotonicity and endpoint labels. |
| BRIT_COMP | attack | P2 | continuous | Time constants may be log-like and model-specific. | Probe dense points with extra low-end anchors near raw 0..0.1. |
| BRIT_COMP | release | P2 | continuous | Same risk profile as attack, often highly non-linear. | Probe dense points with high-end anchors near raw 0.9..1.0. |
| BRIT_COMP | makeup | P3 | continuous | Usually monotonic and lower ambiguity than ratio/time controls. | Probe standard dense anchors and verify endpoint units. |
| CLASSIC_COMPRESSOR | threshold | P1 | qualitative | Known sign ambiguity in panel labeling must be resolved first. | Capture UI text at each anchor; define canonical sign convention before formula work. |
| CLASSIC_COMPRESSOR | ratio | P1 | continuous_or_stepped_unknown | High impact on perceived behavior and tool expectations. | Probe dense anchors; check for hidden stepped regions. |
| CLASSIC_COMPRESSOR | attack | P2 | continuous | Time-control curve likely non-linear. | Probe dense anchors and compare with release shape. |
| CLASSIC_COMPRESSOR | release | P2 | continuous | Non-linearity and endpoint interpretation risk. | Probe dense anchors with endpoint repeats for stability. |
| EVEREST_C100A | attack_toggle | P1 | discrete | Toggle semantics must be exact before any numeric assumptions. | Explicitly test each toggle state and record corresponding raw values. |
| EVEREST_C100A | release_toggle | P1 | discrete | Same as attack toggle; branch control for mapping. | Verify state count and stable raw transitions. |
| EVEREST_C100A | gain | P2 | continuous | Main drive/input style control influences compression curve. | Probe dense points, confirm monotonic and endpoint labeling. |
| EVEREST_C100A | gain_reduction | P2 | qualitative | Label may represent behavior target rather than direct dB. | Probe with UI+audio context; avoid premature numeric claim. |
| FC_670 | time_constant | P1 | discrete | Likely stepped program constants rather than smooth knob. | Ordered sweep to enumerate states; map raw intervals to labels. |
| FC_670 | threshold | P1 | continuous | Core dynamics anchor needed for practical control. | Probe dense points and verify directionality of effect. |
| FC_670 | input_gain | P2 | continuous | May have non-linear taper tied to vintage emulation. | Probe dense points, include extra anchors near extremes. |
| RC_500_COMPRESSOR | attack | P1 | continuous | High sensitivity control; curve uncertainty affects inverse accuracy. | Dense anchors with low-end emphasis near fast region. |
| RC_500_COMPRESSOR | release | P1 | continuous | Similar high uncertainty and strong curve non-linearity risk. | Dense anchors with high-end emphasis near slow region. |
| RC_500_COMPRESSOR | threshold | P2 | continuous | Core envelope threshold, likely monotonic. | Standard dense anchors plus endpoint validation. |
| RC_500_COMPRESSOR | makeup | P3 | continuous | Lower ambiguity than time controls. | Standard dense anchors. |
| TUBE_CB | attack_release_select | P1 | mode-dependent | Fixed/manual selector changes control semantics. | Verify two states (`fixed`, `manual`) and branch-specific control availability. |
| TUBE_CB | ratio | P1 | mode-dependent | Ratio behavior may differ by mode branch. | Probe separately per mode and compare curve family. |
| TUBE_CB | threshold | P2 | mode-dependent | Threshold may shift behavior depending on mode. | Dense anchors in each mode; maintain separate fit candidates. |
| TUBE_CB | gain | P2 | continuous | Output/drive style control likely monotonic but may be mode-influenced. | Probe in both modes to confirm invariance or branch split. |
| VT_1_COMPRESSOR | ratio | P1 | discrete_or_continuous_unknown | Panel ratios include named fixed values (`1:1`, `4:1`) suggesting steps. | Ordered sweep and enumerate all selectable ratio states. |
| VT_1_COMPRESSOR | attack | P2 | continuous | Time constant likely non-linear. | Dense anchors with low-end emphasis. |
| VT_1_COMPRESSOR | release | P2 | continuous | Non-linear slow-end behavior expected. | Dense anchors with high-end emphasis. |
| VT_1_COMPRESSOR | threshold | P2 | continuous | Core envelope anchor needed for complete mapping. | Standard dense anchors and endpoint checks. |
| VT_1_COMPRESSOR | gain | P3 | continuous | Usually straightforward trim-like mapping. | Standard dense anchors. |

## Promotion criteria by control class

### Continuous controls

Promote from baseline-only when all are true:

- monotonic raw-to-label progression confirmed
- repeatability verified across at least two runs
- candidate forward and inverse formulas pass tolerance tests
- no device/firmware contradiction in sampled targets

### Discrete controls

Promote when all are true:

- complete state set enumerated
- raw transition boundaries stable across runs
- state labels match UI exactly
- no hidden intermediate states observed

### Qualitative controls

Promote cautiously when all are true:

- explicit definition of what label means in agent/API semantics
- reproducible raw anchor behavior and directionality
- confidence notes include unresolved semantic caveats, if any

### Mode-dependent controls

Promote when all are true:

- mode selector raw states fully enumerated
- each branch calibrated independently
- branch selection logic tested and deterministic
- switching modes does not contaminate branch formulas

## Evidence and artifact checklist

For each model/control pair:

- raw capture file path under `captures/`
- probe command used
- UI evidence reference (screenshot/video note)
- derived anchor table (raw, observed label, timestamp)
- decision on class (continuous/discrete/qualitative/mode-dependent)
- promotion decision with confidence rationale

## Non-goals

- Do not alter production write tool registration.
- Do not claim observed/calibrated mappings from label text alone.
- Do not collapse mode-dependent behavior into a single formula without branch evidence.
