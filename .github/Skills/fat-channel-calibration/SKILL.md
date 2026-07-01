# Fat Channel Calibration

## Purpose

Use this skill to replace guessed or inferred Fat Channel mappings with measured, documented, tested raw-to-semantic conversions.

Fat Channel parameters must not be guessed. EQ, dynamics, filters, and processing state affect the actual mix and must be calibrated against real mixer behavior or documented protocol evidence.

## Applies to

- `get_fat_channel`
- `validate_fat_channel_for_source`
- `set_fat_channel_parameter`
- `apply_fat_channel_preset`
- HPF
- gate
- compressor
- limiter
- EQ frequency/gain/Q
- pan/fader scaling if shared conversion code exists

## Calibration targets

At minimum, inspect:

```text
HPF enable
HPF frequency
gate enable
gate threshold
gate range/depth
gate attack
gate release
compressor enable
compressor threshold
compressor ratio
compressor attack
compressor release
compressor gain
limiter enable
EQ band enable
EQ frequency
EQ gain
EQ Q
EQ filter shape/type
```

## Evidence hierarchy

Use this priority order:

1. official PreSonus/protocol documentation,
2. HIL measurement against real hardware,
3. captured real-device fixture with matching UI values,
4. confirmed third-party adapter behavior with independent validation,
5. inference.

Only levels 1-3 may produce `observed`.

Inference must remain `inferred` or `probe_required`.

## Required workflow

1. Inventory all Fat Channel fields exposed by the adapter.
2. Identify raw value ranges and data types.
3. For each parameter, capture multiple UI values and corresponding raw values.
4. Use one-parameter-at-a-time HIL procedure.
5. Build a calibration table.
6. Derive formula only when enough data points support it.
7. Add conversion functions with explicit tolerance.
8. Add fixture-based tests.
9. Add MCP response confidence per parameter.
10. Update capability matrix and release checklist.

## Required calibration table

Every calibrated parameter must have:

| Parameter | UI value | Raw value | Formula/mapping | Tolerance | Evidence | Confidence |
|---|---:|---:|---|---:|---|---|

Example:

| Parameter | UI value | Raw value | Formula/mapping | Tolerance | Evidence | Confidence |
|---|---:|---:|---|---:|---|---|
| HPF frequency | 80 Hz | `0.1234` | pending | n/a | `probe-fat-channel-parameter-map` | `probe_required` |

## Minimum data points

For continuous parameters, capture enough points to verify non-linearity:

```text
minimum
low
mid-low
mid
mid-high
high
maximum
```

For stepped parameters, capture all possible steps if practical. If not practical, capture enough to identify the step table and mark remaining values as unverified.

## Required MCP response behavior

Return per-parameter confidence:

```json
{
  "parameter": "eq1.frequency",
  "value": 1000,
  "unit": "Hz",
  "rawValue": 0.4567,
  "confidence": "observed",
  "evidence": "docs/hil/2026-07-01-probe-fat-channel-parameter-map"
}
```

For guessed formulas:

```json
{
  "parameter": "compressor.ratio",
  "value": null,
  "rawValue": 0.42,
  "confidence": "inferred",
  "warning": "Raw-to-ratio mapping is not calibrated for this model/firmware."
}
```

## Required tests

Add tests for:

```text
raw-to-ui conversion
ui-to-raw conversion
round-trip tolerance
unknown raw values
out-of-range UI requests
per-parameter confidence
MCP response warnings
```

Suggested files:

```text
fat-channel-calibration.unit.test.ts
fat-channel-response.tool.test.ts
fat-channel-write-safety.test.ts
```

## Write-specific rule

Fat Channel writes must also satisfy `mcp-write-safety-gate`.

Do not permit Fat Channel writes when:

- the parameter formula is guessed,
- raw-to-UI mapping is not calibrated,
- post-write readback is unavailable,
- no rollback data exists,
- target channel/source is uncertain.

## Acceptance criteria

A Fat Channel parameter can be marked `observed` only when:

- raw field is identified,
- UI value mapping is measured or documented,
- enough calibration points exist,
- formula/table is tested,
- tolerance is defined,
- model and firmware are recorded,
- MCP response exposes confidence.

## Stop conditions

Stop and report a blocker if:

- formulas are guessed,
- UI and raw values do not correlate,
- firmware/model are unknown,
- adapter exposes transformed values without raw traceability,
- writing a parameter cannot be verified by readback,
- calibration evidence is narrower than the claim.
