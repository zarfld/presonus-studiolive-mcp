# Routing Reverse Engineering

## Purpose

Use this skill to implement or verify local input routing, AVB/stagebox routing, output patch routing, aux/mix routing, and semantic mapping of raw route indices.

This is a high-risk area. A sound-engineer agent cannot act correctly unless it knows what physical or AVB source feeds each channel and what output path receives each mix.

## Applies to

- `get_input_routing`
- `validate_avb_routing`
- `validate_output_routing`
- routing graph/resource tools
- input-list validation tools
- stagebox / AVB tools
- adapter route parsing
- source index mapping

## Required questions

For each routing capability, answer:

1. What raw adapter data is used?
2. What does each raw index mean?
3. Is the mapping observed, inferred, or unknown?
4. Can the tool distinguish local analog input from AVB/stagebox input?
5. Can it identify wrong patching?
6. Can it report confidence per route?
7. Does the result match mixer UI / UC Surface / audible behavior?
8. Is there HIL evidence for the exact model and firmware?

## Required workflow

1. Inventory existing routing tools and adapter data.
2. Identify exposed stubs or `probe_required` paths.
3. Build a raw-data map:
   - raw field name,
   - observed values,
   - semantic interpretation,
   - evidence.
4. Create or update HIL probes for unknowns.
5. Implement semantic mapping only where evidence exists.
6. For unknown mappings, return explicit uncertainty.
7. Add golden fixtures from captured device state.
8. Add unit tests for mapping logic.
9. Add integration tests for MCP response shape.
10. Update capability matrix and release checklist.

## Required routing evidence table

Every routing change must produce this table:

| Route type | Raw source | Raw value | Semantic meaning | Evidence | Confidence |
|---|---|---:|---|---|---|
| Local input | `<field>` | `0` | `Local Input 1` | `<fixture/probe>` | `observed` |
| AVB receive | `<field>` | `?` | unknown | none | `probe_required` |

## Required MCP response behavior

A routing tool must never silently return guessed routes as facts.

Use this shape or equivalent:

```json
{
  "status": "ok",
  "capability": "observed",
  "model": "StudioLive 32SC",
  "firmware": "3.3.0.109659",
  "routes": [
    {
      "channel": 1,
      "sourceType": "local",
      "sourceName": "Local Input 1",
      "rawValue": 0,
      "confidence": "observed",
      "evidence": "docs/hil/..."
    }
  ],
  "warnings": []
}
```

For unknowns:

```json
{
  "status": "probe_required",
  "capability": "probe_required",
  "routes": [],
  "reason": "AVB source index mapping is not verified for this model/firmware.",
  "nextProbe": "probe-avb-routing-32sc-32r",
  "safeToUseForLiveDecisions": false
}
```

## Implementation rules

1. Keep raw values in the output when useful for debugging.
2. Keep semantic names separate from raw indices.
3. Do not assume contiguous routing maps unless proven.
4. Do not assume 32SC mappings apply to 32R/24R/16R.
5. Do not assume local routing and AVB routing use the same index scheme.
6. Do not treat "audio passes" as equivalent to "route semantically identified".
7. Do not validate a rider or input list using uncertain route data without warning.

## Required tests

At minimum:

```text
routing-map.unit.test.ts
get-input-routing.tool.test.ts
validate-avb-routing.tool.test.ts
validate-output-routing.tool.test.ts
```

Fixtures should include:

```text
tests/fixtures/studiolive-32sc/local-routing-observed.json
tests/fixtures/studiolive-32sc/output-source-map-observed.json
tests/fixtures/studiolive-32sc-32r/avb-routing-observed.json
```

If the fixture does not come from real hardware, name it clearly as synthetic.

## Acceptance criteria

Routing can be marked `observed` only when:

- raw adapter field is identified,
- semantic mapping is known,
- HIL evidence or real fixture exists,
- tests cover expected and wrong routes,
- MCP response includes confidence,
- docs identify model and firmware scope.

## Stop conditions

Stop and report a blocker if:

- raw route fields cannot be found,
- route values cannot be semantically mapped,
- only guessed names are available,
- AVB stream presence is confused with channel assignment,
- output source names remain `null`,
- tool output would let an agent make unsafe live routing decisions.
