# HIL Probe Design

## Purpose

Use this skill whenever mixer behavior cannot be proven from source code, unit tests, or existing captured real-device fixtures.

HIL means hardware-in-loop. This repository controls or inspects a real PreSonus StudioLive mixer. Routing, AVB patching, Fat Channel scaling, fader taper, aux behavior, and writes must be validated against actual hardware before being claimed as supported.

## Applies to

- StudioLive 32SC
- StudioLive 32R / 24R / 16R
- StudioLive III consoles and rack mixers
- AVB/stagebox routing
- local input routing
- output patch routing
- Fat Channel parameters
- fader/mute/aux write behavior
- adapter protocol reverse engineering

## Required probe document template

Create or update a probe document using this structure:

```markdown
# HIL Probe: <probe-name>

## Target behavior
What behavior is being measured?

## Capability impact
Which tools/features can change state if the probe passes?

## Required hardware
- Mixer model:
- Firmware version:
- Stagebox/rack mixer:
- Network path:
- Computer OS:
- Node/pnpm version:

## Safety classification
- Read-only / write
- Live-safe: yes/no
- Required backup/scene save:

## Preconditions
Exact mixer state required before starting.

## Procedure
1. Step-by-step instructions.
2. Each step changes only one variable.
3. Record expected UI/audio/API observations.

## Data to capture
- raw adapter JSON:
- MCP tool response:
- mixer UI screenshot if useful:
- UC Surface screenshot if useful:
- audio observation if useful:

## Pass criteria
Measurable pass conditions.

## Fail criteria
Measurable fail conditions.

## Result recording format
Where to store logs, dumps, fixtures, and summary.

## Capability matrix update
Exact state transition allowed by a passing result.
```

## Required probe output artifacts

A completed probe must produce at least:

```text
docs/hil/<date>-<probe-name>/README.md
docs/hil/<date>-<probe-name>/raw-adapter-state.json
docs/hil/<date>-<probe-name>/mcp-tool-output.json
docs/hil/<date>-<probe-name>/result.md
```

When practical, also produce:

```text
tests/fixtures/<model>/<probe-name>.json
```

## Naming convention

Use stable probe names:

```text
probe-input-routing-32sc
probe-avb-routing-32sc-32r
probe-output-source-name-map
probe-fat-channel-parameter-map
probe-fader-taper-map
probe-aux-send-pre-post
probe-mute-write-roundtrip
probe-fader-write-roundtrip
probe-aux-send-write-roundtrip
```

## Probe design rules

1. Change one mixer parameter at a time.
2. Capture before and after states.
3. Include model and firmware in every artifact.
4. Do not use live show state.
5. Save/export a scene before any write test.
6. For writes, define rollback before executing.
7. For routing, test both expected and intentionally wrong patches.
8. For Fat Channel, capture enough points to derive or reject formulas.
9. For fader taper, capture multiple points across the full range, not only min/max.
10. For AVB, distinguish network stream availability from channel routing.

## Minimum required probes before release claims

Before the repository may claim useful real sound-engineer-agent operation, these probes must exist and pass for at least one target setup:

| Probe | Blocks |
|---|---|
| `probe-input-routing-32sc` | `get_input_routing`, input-list validation |
| `probe-avb-routing-32sc-32r` | stagebox validation, AVB diagnostics |
| `probe-output-source-name-map` | output patch validation |
| `probe-fat-channel-parameter-map` | EQ/dynamics read/write confidence |
| `probe-fader-taper-map` | fader read/write accuracy |
| `probe-aux-send-pre-post` | monitor mix correctness |
| `probe-mute-write-roundtrip` | basic write safety |
| `probe-fader-write-roundtrip` | level write safety |

## Acceptance criteria

A HIL probe is acceptable only if:

- another engineer can repeat it,
- hardware/firmware are recorded,
- data artifacts are stored,
- pass/fail criteria are explicit,
- the capability impact is stated,
- no broad claim is made from a narrow test.

## Stop conditions

Stop and report unresolved if:

- the required hardware is not available,
- firmware version is unknown,
- the probe would alter live show state,
- rollback cannot be defined for a write test,
- results contradict existing capability claims.

## Capability update rule

A passing probe may upgrade capability only within the tested scope.

Example:

- `StudioLive 32SC fw 3.3.0.109659 input routing observed`
- does not imply:
  - `StudioLive 32R observed`,
  - `all StudioLive III models observed`,
  - `AVB routing observed`.

Scope must remain narrow.
