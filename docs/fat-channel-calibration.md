# Fat Channel Calibration

This document records what is known (observed), what is estimated (guessed),
and what the probe workflow is to promote guesses to observations.

> **KEY RULE**: Do not change `parameterConfidence` from `'guessed'` to
> `'observed'` without completing the probe-fat-channel workflow described
> below and linking the evidence artifact.

---

## Model identification

Fat Channel model identity is decoded from two live state keys:

| Key | Formula | Confirmed hardware |
|---|---|---|
| `line.chN.opt.compmodel` | `index = Math.round(raw × 10)` (11 slots: 3 factory + 8 add-on) | StudioLive 32SC fw 3.3.0.109659 |
| `line.chN.opt.eqmodel` | `index = Math.round(raw × 9)` (10 slots: 3 factory + 7 add-on) | StudioLive 32SC fw 3.3.0.109659 |

### Compressor models — confidence by evidence source

| Index | Model | Confidence | Evidence |
|---|---|---|---|
| 0 | STANDARD | `observed` | Confirmed on 32SC fw 3.3.0.109659 by UC Surface cross-validation |
| 1 | TUBE | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 2 | FET | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 3 | BRIT\_COMP | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 4 | CLASSIC\_COMPRESSOR | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 5 | COMP\_160 | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 6 | EVEREST\_C100A | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 7 | FC\_670 | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 8 | RC\_500\_COMPRESSOR | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 9 | TUBE\_CB | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 10 | VT\_1\_COMPRESSOR | `observed` | Confirmed on 32SC fw 3.3.0.109659 |

### EQ models — confidence by evidence source

| Index | Model | Confidence | Evidence |
|---|---|---|---|
| 0 | STANDARD (EQ) | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 1 | PASSIVE | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 2 | VINTAGE | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 3 | ALPINE\_EQ\_550 | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 4 | BAXANDALL\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 5 | RC\_500\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 6 | SOLAR\_69\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 7 | TUBE\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 8 | VINTAGE\_3\_BAND\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |
| 9 | VT\_1\_EQ | `observed` | Confirmed on 32SC fw 3.3.0.109659 |

**Scene/cache GUIDs confirmed on 32SC captures**: `STANDARD`, `TUBE`, `FET`,
`COMP_160`, `EVEREST_C100A`, `STANDARD EQ`, `PASSIVE EQ`, `BUS_EQ`.
Remaining add-on model GUIDs are in the decoder table but not yet confirmed
in scene/cache files (live-index-only evidence).

---

## DSP parameter values — calibration status

Primarily calibrated from guided HIL probe on StudioLive 32R fw **3.4.0.111374**
(dense guided runs, 2026-07-03), with 32SC cross-check context where available.
Evidence: `captures/cal-32r-guided/` and related guided fixtures.

Scope note: formulas below are confirmed for 32R on fw 3.4.0.111374. Cross-model
behavior (including 32SC) is currently assumed compatible but not fully proven.

| Parameter group | Formula | Confidence | Notes |
|---|---|---|---|
| EQ gain | `(raw−0.5)×30` → ±15 dB | **observed** | 5 points, max error 0.005 dB |
| EQ frequency | `36×500^raw` → 36 Hz–18 kHz | **calibrated\_inferred** | Dense guided anchors on 32R; low residual fit |
| HPF frequency | `24×42^raw` → 24 Hz–1 kHz | **calibrated\_inferred** | 6 pts, max 0.46% |
| EQ Q factor | `clamp(0.0272×522^raw, 0.10, 10.00)` | **calibrated\_inferred** | Dense guided anchors on 32R; clamped to display range |
| EQ band type | `round(raw×3)` → 3 types in STANDARD EQ | **observed** | BELL(1.0), LOW\_SHELF(0.333), HIGH\_SHELF(0.667) confirmed. LOW\_PASS (raw=0.0) not observed in STANDARD EQ testing on 32SC fw 3.4.0.111374 |
| Comp threshold (STANDARD) | `(raw−1)×56` → -56 to 0 dBFS | **confirmed** ✅ | 3 pts exact (0%): raw=0/-56dB, raw=0.505/-27.72dB, raw=1/0dB. 32R guided cal 2026-07-02 |
| Comp makeup (STANDARD) | `raw×28.0` → 0–28 dB | **confirmed** ✅ | 4 pts exact (0%): raw=0/0dB, raw=0.315/8.82dB, raw=0.490/13.72dB, raw=1/28dB. Corrected from raw×27.6 |
| Comp attack (STANDARD) | `0.20 + 149.8×raw^2.922` ms | **confirmed** ✅ | Dense guided anchors on 32R; old 32SC mismatch attributed to stale ZLIB/display mismatch |
| Comp sidechain keyfilter | `40×400^raw` Hz; raw=0→off | **calibrated\_inferred** | 3 pts: raw=0/off, raw=0.010/42.47Hz, raw=0.495/776.4Hz, raw=1/16kHz. 32R guided cal 2026-07-02 |
| Gate threshold | `(raw−1)×84` → -84 to 0 dBFS | **calibrated\_inferred** | 2 pts; max 0.007 dB. liveObserved via raw-socket probe 2026-07-02 |
| **Comp ratio (STANDARD)** | Quadratic-log fit (10 guided anchors) | **calibrated\_inferred** | Max error ~3.1%, RMS ~1.6% on confirmed anchors |
| **Comp release (STANDARD)** | `2.5 + 897.5×raw^2.605` ms | **confirmed** ✅ | 5 pts exact: raw≈0/2.5ms, raw=0.530/174ms, raw=0.720/384ms, raw=1/900ms. 32R guided 2026-07-02 |
| **Gate attack** | Piecewise interpolation, 0.02–500 ms anchors | **calibrated\_inferred** | Dedicated gate mapping; do not reuse compressor attack formula |
| **Gate release** | `50 + 1950×raw^1.583` ms | **calibrated\_inferred** | 7 pts, max error <3ms: 50ms–2000ms. liveObserved via raw-socket 2026-07-02 |
| **Gate range (GATE mode)** | Piecewise interpolation, 16 anchors | **calibrated\_inferred** | GATE mode (expander=false) validated on 32R; EXPANDER mode unverified |
| **Limiter threshold** | `(raw−1)×28` → -28 to 0 dBFS | **calibrated\_inferred** | Guided 32R anchors, exact at display precision |
| Fader taper | `volumeRaw100ToDb(v)` | **calibrated\_inferred** | `line.chN.volume` is 0–100 scene-stored; see `docs/hil/fader-preamp-calibration-notes.md` |

> **Phase 2 Opportunistic Calibration Evidence**: `test/fixtures/32sc/fat-channel/fat-channel-phase2-calibration.json`
> Device: StudioLive 32SC SD7E21010066 fw 3.4.0.111374, captured 2026-07-02.
> Endpoints guided-probed; intermediate points from session context.
> Not a full guided calibration (min/25%/50%/75%/max procedure).
> Phase 2 data is retained as historical context only where superseded by dense guided 32R runs.
>
> **Live Event Probe Evidence** (2026-07-02): `test/fixtures/32sc/fat-channel/live-events/live-event-probe-evidence.json`
> No PV/JM/data event for the watched `line.*` Fat Channel keys was observed through featherbear
> during a 60-second UC Surface knob-movement probe on 32SC fw 3.4.0.111374.
> The featherbear ZLIB snapshot reflects the last saved scene value, not the live knob position.
> Classification: `sceneStored` — confirmed through featherbear live-event probing on 32SC fw 3.4.0.111374 (UC Surface).
> ⚠️ Scope: UC Surface knob movement only. Physical mixer knob movement and raw packet layer not independently tested.
> Not automatically proven for other StudioLive III models or other firmware versions.
> See fixture for full analysis and scope limitations.

> **IMPORTANT: FET vs STANDARD compressor key difference**
> - STANDARD/TUBE/etc.: threshold key = `comp.threshold`, makeup key = `comp.gain`
> - FET model: threshold-like key = `comp.input`, gain-like key = `comp.output`
> - The adapter now tries `comp.threshold` first, falls back to `comp.input`.

The `ChannelFatStateSchema.parameterConfidence` field in
`packages/presonus-domain/src/schemas/fat-channel.ts` propagates this
uncertainty to consumers. Raw state values are accessible via the
`mixer-raw-state` resource (`presonus://mixer/{id}/raw/state`).

---

## SL-Edit Reference Investigation (2026-07-02)

Reference: `featherbear/SL-Edit` (GitHub) + pinned `presonus-studiolive-api@fb289d4`

### What SL-Edit is

A **prototype web UI** for StudioLive III (SvelteKit, 5 years old). Most routes are stubs.
It wraps the same `presonus-studiolive-api` library — no proprietary extensions.
Classification: **prototype observer + limited writer** (not offline editor; not a live DSP reference).

### Findings Table

| Finding | Source | Evidence | Impact for MCP |
|---|---|---|---|
| `clientOptions` is `???` | `MessageProtocol.ts` | Field documented as unknown even by API author | Cannot confidently add DSP subscription tokens; unknown effect |
| Write path via PV packets | `Client.ts:setMuteState()` | `sendPacket(MESSAGETYPES.Setting, key+\0+value)` | Fat Channel writes are technically feasible using PV |
| Boolean encoding: `[0x00,0x00,0x80,0x3f]` = true | `MessageProtocol.ts:onOffCode()` | Returns 1.0f LE for true, 0.0f LE for false | Mute/on-off writes use 4-byte LE float encoding |
| Float encoding: 4-byte LE float | `Client.ts:onOffEval()` | Returns raw bytes when not boolean | Normalized (0–1) params written as `Buffer.from(new Float32Array([value]).buffer)` |
| `ACTIONS` enum only: MUTE, VOLUME(DCA), GAIN(preamp) | `constants/actions.ts` | No comp/gate/EQ action keys defined | Fat Channel write actions not implemented in reference; must implement our own |
| `GateValues` confirmed: `range, release, threshold, attack, ratio, reduction` | `zlibType.ts:GateValues` | TypeScript interface matches state dump keys | Confirms valid ZLIB key names |
| `LimitValues` missing `release` (old firmware) | `zlibType.ts:LimitValues` | Only `limiteron, threshold, reduction` — no `release` | `limit.release` likely added in later firmware; treat as present in 3.4.0.111374 |
| STANDARD comp GUID confirmed | `zlibType.ts:CompClassID` | `{870D04F7-212E-4F9C-ADBB-39A97216433F}` = STANDARD | Matches `COMPRESSOR_MODEL_BY_CLASSID` in codebase ✓ |
| STANDARD EQ GUID confirmed | `zlibType.ts:EqClassID` | `{A0A8A068-14F0-4B04-BB6F-AF8329D0E8EE}` = STANDARD | Matches `EQ_MODEL_BY_CLASSID` in codebase ✓ |
| **No Fat Channel formulas found** | All SL-Edit files | No `Math.pow`, `Math.exp`, `log`, Hz, ms conversion code | No formula reference to compare against MCP formulas |
| No FR/FD path for Fat Channel | `Client.ts:sendList()` | `sendList` uses FR only for scene file directory listing | Fat Channel is NOT accessible via FR/FD requests |
| Mute echo hypothesis | `Client.ts` IDEA comment | "Send unmute and see if there's a response" — author expected PV echo from writes | Writes via PV likely DO get echoed back; live read possible via write-and-observe |

### Formula Comparison
No Fat Channel formulas found in SL-Edit. All formulas remain `reference_inferred` or better per existing HIL evidence.

### Protocol Paths Not Used by MCP

The write path (`MESSAGETYPES.Setting` / `PV` with `key\x00\x00\x00value`) is not yet
used by the MCP for Fat Channel parameters. Float value encoding:
```typescript
// Write normalized float param (e.g. comp.release = 0.5)
const buf = Buffer.allocUnsafe(4)
buf.writeFloatLE(normalizedValue, 0)
sendPacket('PV', Buffer.concat([Buffer.from(`${key}\x00\x00\x00`), buf]))
```
**Do not implement Fat Channel writes until the write path is verified with a dedicated probe.**

### Next Steps from SL-Edit Analysis
1. ✅ **Write-triggered PV echo CONFIRMED** (2026-07-02): Writing comp.release via PV causes the mixer to echo the change back as a decoded PV event with correct float value. client.state updated. See `test/fixtures/32sc/fat-channel/live-events/write-echo-evidence.json`.
2. **`clientOptions` investigation**: Passive observation still shows no echoes — the write-echo path works only for active writes, not passive UC Surface monitoring.
3. **limit.release key**: Confirmed `line.chN.limit.release` is present in 3.4.0.111374 state (confirmed in session dumps).

---

## PV Write-Echo Probe Results (2026-07-02)

Evidence: `test/fixtures/32sc/fat-channel/live-events/write-echo-evidence.json`
Command: `pnpm probe:dev probe-fat-write-echo --device <ip> --channel line.ch11 --key comp.release --delta 0.01 --duration 8000 --allow-unmuted`

**Result: `writeAccepted_echoObserved`** — all flags YES.

| Key | Write accepted | PV echo observed | Raw packet observed | client.state updated | Restore verified | Classification |
|---|---|---|---|---|---|---|
| `line.ch11.comp.release` | YES | YES | YES | YES (decoded 0.51) | YES (decoded 0.5) | `writeAccepted_echoObserved` |

### Revised Write-Echo Calibration Status (2026-07-02)

**New command**: `pnpm probe:dev probe-fat-guided-calibration --device <ip> --channel line.ch11 --key comp.release --points 0,0.25,0.5,0.75,1 --restore`

**Additional findings from guided calibration run** (32SC SD7E21010066 fw 3.4.0.111374):
- Only the first echo was received (1/5); TCP reconnection disrupted subsequent echoes in multi-point sequences. Echo reliability across reconnects is low.
- UC Surface display did **NOT** update in response to probe PV writes; use scene-save+dump for display calibration.

**Revised calibration status for `comp.release`:**

| Approach | Works? | Notes |
|---|---|---|
| Write-echo (raw confirmation) | YES — for single writes | Only confirms raw accepted; reliable for single probe, not multi-point sequences |
| Write-echo (display readback) | **NO** | UC Surface does not update display from probe writes |
| Scene-save + dump (raw + display) | YES | User sets knob → saves scene → probe reads ZLIB raw. Still the required method for display calibration. |

**Correction (2026-07-02):** The earlier "403ms" note was a **gate display misread**, not
`comp.release`. That contradictory anchor is invalid and should not be used for comp release fitting.

The Phase 2 formula remains the current best estimate for `comp.release` pending proper live-PV calibration (now possible with UC Control closed — see 32R live PV evidence above).

Evidence: `test/fixtures/32sc/fat-channel/guided/comp-release.json`

---

## Related Repository Analysis (2026-07-02)

Investigation of `zarfld/presonus-studiolive-api` and `zarfld/presonus-studiolive-api-c-`
to determine whether either repo received live Fat Channel PV events.

| Repo | Evidence found | Fat Channel live PV observed? | Raw packet observed? | Snapshot-only? | Classification |
|---|---|---|---|---|---|
| `zarfld/presonus-studiolive-api` | `transformers.ts:76` `"**.gate.*": DEFAULTS.float` (fromPV transformer); `simple/index.ts:90` `value instanceof Buffer → readFloatLE()` for unknown PV; `SubscriptionOptions.ts:23` `clientOptions: '???'` | NO — no test logs, no captured session with Fat Channel live PV | No captured evidence | No — has PV infrastructure but no snapshot-only path | `genericPVOnly` |
| `zarfld/presonus-studiolive-api-c-` | `debug-output.log:1965-2003` — ALL Fat Channel params (comp.threshold/ratio/attack/release/gain, eqgain/eqfreq/eqtype/eqq, limit.threshold/release, gate.range/release/threshold) in ZLIB snapshot parse; `debug-output.log:27855+` uses `state.get()` snapshot fallback | NO | No | YES — application is snapshot reader + channel list exporter | `snapshotOnly` |

### Evidence Details

**zarfld/presonus-studiolive-api** (`repos/presonus-studiolive-api/`):
- `src/lib/util/transformers.ts:74-76`: `"**.gate.keylisten": DEFAULTS.boolean`, `"**.gate.expander": DEFAULTS.boolean`, `"**.gate.*": DEFAULTS.float` — gate parameters have `fromPV: float` transformer; if PV arrived, they would be decoded correctly.
- `src/lib/util/transformers.ts:71`: `"**.filter.hpf": DEFAULTS.float` — HPF has PV transformer.
- No `comp.*`, `eq.*`, or `limit.*` transformers — these would arrive as raw Buffer.
- `src/simple/index.ts:90-96`: Handles raw Buffer PV values with `value.readFloatLE()` — same approach confirmed by our `probe-fat-write-echo` on 32SC fw 3.4.0.111374.
- `src/lib/types/SubscriptionOptions.ts:23`: `clientOptions: '???'` — still unknown.
- No test session logs with Fat Channel live PV evidence.

**zarfld/presonus-studiolive-api-c-** (`presonus-studiolive-api-c-/`):
- `debug-output.log:1965-2003` (fw 3.3.0.109659): ZLIB UBJSON parsing logs `Set property: eqgain1 = 0.6855...`, `eqfreq1 = 0.2531...`, `eqtype1 = 0.333...`, `comp.threshold = 0.4440...`, `comp.ratio = 0.8629...`, `comp.release = 0.3966...`, `limit.threshold = 0.6149...`, `limit.release = 0.5`. ALL from initial snapshot.
- `debug-output.log:27855+`: Queries use `state.get()` fallback (ZLIB snapshot only), never live PV.
- `UBJSON_Issue_Report.md`: Documents crash on fw 3.2.0.108461 during ZLIB parse (type 0x49='I'). No live PV evidence.
- `MixerObjectModel.cs:461-515`: EQ properties (`eqgain1`, `eqfreq1`, etc.) mapped via `[JsonPropertyName(...)]` from JSON/ZLIB only.
- **Conclusion**: Pure snapshot reader; no live event infrastructure for Fat Channel.

### Interpretation for presonus-studiolive-mcp

Neither repo had encountered the live Fat Channel PV problem before. Both repos used the same snapshot-only path (ZLIB). The write-echo probe we ran on 2026-07-02 is the **first recorded evidence** that Fat Channel PV writes ARE echoed by the mixer — which no earlier repo had tested.

The following model GUIDs appear in the live decoder table but have NOT been
confirmed in scene/cache file `__classid` fields:

- Compressor: `FC_670`, `RC_500_COMPRESSOR`, `TUBE_CB`, `VT_1_COMPRESSOR`
- EQ: `ALPINE_EQ_550`, `BAXANDALL_EQ`, `RC_500_EQ`, `SOLAR_69_EQ`, `TUBE_EQ`, `VINTAGE_3_BAND_EQ`, `VT_1_EQ`

Do not claim scene file support for these until a scene capture with those
models active is collected and the `__classid` field confirmed.

---

## Probe-fat-channel calibration workflow

To promote parameter calibration from `guessed` to `observed`:

### Guided calibration for `sceneStored` DSP parameters

Fat Channel DSP parameters (`comp.release`, `gate.range`, `limiter.threshold`, etc.) are confirmed
`sceneStored` through featherbear live-event probing on 32SC fw 3.4.0.111374.
The featherbear state reflects the **last saved scene**, not the live knob position.

**Required sequence for each calibration anchor point:**

1. Set control to target position in UC Surface
2. Record the visible UC Surface display value (e.g. "150ms")
3. **Save the scene** (Store Scene in UC Surface or via the mixer hardware Store button)
4. Wait for save/settle (~1 second)
5. Capture state dump: `pnpm probe:dev probe-routing dump --device <ip> --out <file>`
6. Extract raw value for the key (e.g. `line.ch11.comp.release`)
7. Store matched pair: `{ display: "150ms", raw: 0.5, source: "sceneStored" }`

> ⚠️ If step 3 (scene save) is **skipped**, the dump will show the **old scene value**,
> not the current knob position. This was the root cause of conflicting readings in Phase 2.

### Guided calibration for live-updated parameters (EQ, threshold, etc.)

Parameters that emit PV events (EQ gain, HPF, comp threshold, comp makeup, gate threshold) update
`client.state` immediately. No scene save is required for these.

### Procedure for all parameters

**Prerequisites**: Physical StudioLive 32SC (or other III-series) connected to LAN; UC Surface running.

For each parameter (e.g. EQ band 1 gain):

1. Set a specific value in UC Surface (e.g. EQ band 1 gain = +6 dB)
2. Capture state: `pnpm probe:dev dump-state -d <ip> --out captures/fat-calibration/eq-gain-6db.json`
3. Note the raw value of `line.ch1.eq.eqgain1`
4. Repeat for multiple values (e.g. −12 dB, 0 dB, +12 dB)
5. Fit the formula to the raw→display mapping
6. Update the corresponding `normalizedTo*()` function in `fat-channel.ts`
7. Update tests to assert the new formula
8. Record evidence in `captures/` with required metadata (see hil-validation skill)
9. Change `parameterConfidence` from `'guessed'` to `'observed'` for that parameter
10. Update this document with the confirmed formula and evidence reference

### Required capture metadata

```yaml
mixerModel: "StudioLive 32SC"
firmware: "3.3.0.109659"
serialRedacted: true
connection: "LAN TCP 53000"
serverCommit: "<git-sha>"
nodeVersion: "<node-version>"
command: "pnpm probe:dev dump-state"
capturedAt: "<ISO-8601>"
purpose: "Fat Channel probe — EQ gain calibration"
```

---

## References

- `packages/presonus-domain/src/schemas/fat-channel.ts` — schemas and de-norm helpers
- `packages/presonus-adapter/src/state-mapper.ts` — `extractFatChannelState()`
- `packages/presonus-domain/src/schemas/fat-channel.ts` — `COMPRESSOR_MODEL_BY_INDEX`, `EQ_MODEL_BY_INDEX`
- ADR-004: Fat Channel Collection and model identification
- `.github/skills/presonus-fat-channel-selection/SKILL.md` — Fat Channel selection skill
- `.github/skills/hil-validation/SKILL.md` — HIL evidence requirements
