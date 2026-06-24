# MCP Interface and Domain Schemas

This reference documents the read-only StudioLive MCP interface and Fat Channel state schemas. Load it for current-state inspection, raw parameter access, or implementation work.

# MCP Interface — Tools and Resources

### Overview

The MCP server is **read-only by default** (ADR-005, REQ-NF-002). Fat Channel data is exposed exclusively through resources. No write tools for setting compressor or EQ models exist in the current version.

```
MCP Tools:     3 (none touch Fat Channel directly)
MCP Resources: 5 (2 expose Fat Channel data)
Write tools:   0 (intentionally absent — see Write Capability below)
```

---

### MCP Tools (All Read-Only)

#### `discover_mixers`

Discovers StudioLive III mixers on the local network.

```typescript
// Input schema (all fields optional)
{
  timeoutMs?: number   // positive integer, ms; default: 5000
}

// Returns: JSON array of mixer identity objects
[
  {
    deviceId: string,        // e.g. "StudioLive32SC-SD7E21010066"
    serial: string,          // e.g. "SD7E21010066"
    model: string,           // e.g. "StudioLive 32SC"
    firmware: string,        // e.g. "3.3.0.109659"
    role: "FOH" | "STAGEBOX" | "MONITOR" | "UNKNOWN",
    ipAddress: string,
    port: number
  }
]
```

**Fat Channel relevance**: None — use this first to obtain a `deviceId` for subsequent resource reads.

---

#### `refresh_mixer_state`

Reconnects to a mixer and rebuilds its state cache, including Fat Channel model decoding.

```typescript
// Input schema (all fields required)
{
  deviceId: string   // from discover_mixers — e.g. "StudioLive32SC-SD7E21010066"
}

// Returns: JSON object
{
  success: boolean,
  channelCount: number,     // number of channels in refreshed snapshot
  capturedAt: string        // ISO 8601 timestamp of snapshot
}
```

**Fat Channel relevance**: After calling this tool, the channels resource will reflect the latest `compModelName` and `eqModelName` for every LINE channel. Call this before reading Fat Channel state if the mixer state may be stale.

---

#### `validate_mixer_identity`

Validates that a connected mixer matches an expected serial number and role.

```typescript
// Input schema
{
  deviceId:       string,                                          // required
  expectedSerial: string?,                                         // optional
  expectedRole:   "FOH" | "STAGEBOX" | "MONITOR" | "UNKNOWN"?    // optional
}

// Returns: JSON object
{
  valid: boolean,
  reasons: string[]    // empty when valid; describes mismatches when not valid
}
```

**Fat Channel relevance**: None — use for pre-flight safety checks before any channel operation.

---

### MCP Resources (Read-Only)

Resources are read by URI. Fat Channel data appears in two resources.

---

#### `presonus://mixer/{deviceId}/channels` ← **Primary Fat Channel resource**

Returns all normalized channels for a connected mixer. This is the main resource for Fat Channel state.

**URI pattern**: `presonus://mixer/StudioLive32SC-SD7E21010066/channels`

**Response schema** — array of `MixerChannel` objects:

```typescript
MixerChannel {
  id:      string,          // "line.ch1", "aux.ch3", "sub.ch1", etc.
  selector: {
    type:      "LINE" | "RETURN" | "FXRETURN" | "TALKBACK" | "AUX" | "FX" | "SUB" | "MAIN",
    channel:   number,      // 1-based channel number
    mixType?:  "AUX" | "FX",    // present for send-context channels
    mixNumber?: number
  },
  name?:   string,          // channel label from mixer (e.g. "Kick In")
  mute?:   boolean,
  solo?:   boolean,
  fader?: {
    db?:     number | null,   // dBFS level; null if unknown
    linear?: number | null,   // 0.0–1.0 linear value; null if unknown
    raw?:    unknown          // raw mixer value for diagnostics
  },
  pan?:    number,          // 0.0 = full left, 0.5 = center, 1.0 = full right
  linked?: boolean,         // true = stereo-linked with adjacent channel
  color?:  string,          // RGBA hex, e.g. "ffff0000" = red

  // ── Fat Channel fields ──────────────────────────────────────────────────
  compModelName?: string,   // e.g. "FET", "COMP_160", "BRIT_COMP", "UNKNOWN"
  eqModelName?:   string,   // e.g. "STANDARD", "ALPINE_EQ_550", "PASSIVE"

  rawExtra?: Record<string, unknown>   // unmapped raw fields
}
```

**Key Fat Channel fields**:

| Field | Source raw key | Decoding |
|---|---|---|
| `compModelName` | `line.chN.opt.compmodel.value` | `Math.round(value × 10)` → index 0–10 → model name |
| `eqModelName` | `line.chN.opt.eqmodel.value` | `Math.round(value × 9)` → index 0–9 → model name |

> **NOTE**: `compModelName` and `eqModelName` are **read-only decoded strings** — they tell you which model is active. They do not expose the compressor or EQ parameter values (threshold, ratio, attack, etc.). For those, read from `raw/state` (see below).

---

#### `presonus://mixer/{deviceId}/raw/state` ← **Diagnostic / parameter access**

Full raw state dump. Use for reading actual compressor/EQ parameter values. Not intended for agent reasoning logic — always prefer the normalized channels resource for model identification.

**URI pattern**: `presonus://mixer/StudioLive32SC-SD7E21010066/raw/state`

**Relevant raw key paths for Fat Channel**:

```
line.chN.opt.compmodel         { value: float, strings: int }   ← compressor model selector
line.chN.opt.eqmodel           { value: float, strings: int }   ← EQ model selector
line.chN.opt.swapcompeq        0 | 1                            ← signal chain order

line.chN.comp.on               0 | 1                            ← compressor enabled
line.chN.comp.input            float (dB threshold)
line.chN.comp.output           float (dB makeup gain)
line.chN.comp.attack           float (seconds)
line.chN.comp.release          float (seconds)
line.chN.comp.ratio            float or int (model-dependent)
line.chN.comp.keyfilter        float (Hz)
line.chN.comp.keylisten        0 | 1

line.chN.eq.eqallon            0 | 1                            ← EQ enabled
line.chN.eq.eqgain1-4          float (dB)
line.chN.eq.eqfreq1-4          float (Hz)
line.chN.eq.eqq1-4             float (Q factor)
line.chN.eq.eqbandon1-4        0 | 1 (per-band enable)
line.chN.eq.eqbandop1-4        0 | 1 (bell/shelf type)

line.chN.gate.on               0 | 1
line.chN.gate.threshold        float (dB)
line.chN.gate.attack           float (seconds)
line.chN.gate.release          float (seconds)
line.chN.gate.range            float (dB)
line.chN.gate.expander         0 | 1 (gate vs. expander mode)

line.chN.limit.limiteron       0 | 1
line.chN.limit.threshold       float (dB)
line.chN.limit.release         float (seconds)

line.chN.filter.hpf            float (Hz cutoff frequency)
```

Replace `N` with the 1-based channel number (e.g. `line.ch1.comp.input`).
For aux/sub channels substitute `aux.chN`, `sub.chN`, etc.

---

#### Other Resources (Fat Channel not directly relevant)

| Resource URI | Contents |
|---|---|
| `presonus://mixers` | All connected mixer identities |
| `presonus://mixer/{deviceId}/meters/summary` | Channel meter classification (silent/active/hot/clipping) |
| `presonus://mixer/{deviceId}/scene/current` | Current project and scene names |

---

### Accepted Properties per Model — Compressor

These are the schema-validated fields accepted by `FatCompressorStateSchema` in the domain model (used when the adapter decodes raw state into structured objects).

#### `STANDARD`, `TUBE`, `FET` — Base compressor schema

```typescript
{
  model:       "STANDARD" | "TUBE" | "FET",   // required discriminator
  enabled?:    boolean,
  thresholdDb?: number,                        // dB threshold
  ratio?:      number,                         // compression ratio (e.g. 4.0 = 4:1)
  attackMs?:   number,                         // attack time in milliseconds
  releaseSec?: number,                         // release time in seconds
  makeupDb?:   number                          // makeup gain in dB
}
```

#### `BRIT_COMP` — Adds sidechain fields

```typescript
{
  model:        "BRIT_COMP",                   // required
  enabled?:     boolean,
  thresholdDb?: number,
  ratio?:       number,
  attackMs?:    number,
  releaseSec?:  number,
  makeupDb?:    number,
  // Additional fields:
  keyFilterHz?: number,                        // sidechain high-pass frequency (Hz)
  keyEnabled?:  boolean,                       // sidechain filter active
  sidechain?:   string                         // sidechain source channel id
}
```

#### `COMP_160` — Different parameter names (no manual attack/release)

```typescript
{
  model:         "COMP_160",                   // required
  enabled?:      boolean,
  thresholdDb?:  number,
  // NOTE: no ratio/attackMs/releaseSec — program-dependent in hardware
  compression?:  number,                       // compression amount (equivalent to ratio)
  outputGainDb?: number,                       // output/makeup gain in dB
  keyListen?:    boolean,                      // monitor the sidechain signal
  keyFilterHz?:  number,                       // sidechain HP filter frequency
  sidechain?:    string                        // sidechain source channel id
}
```

#### Other compressor models → `UNKNOWN` passthrough

Models `EVEREST_C100A`, `FC_670`, `RC_500_COMPRESSOR`, `TUBE_CB`, `VT_1_COMPRESSOR`, and `CLASSIC_COMPRESSOR` are not yet fully schema-defined. When decoded from live state they return:

```typescript
{
  model:      "UNKNOWN",
  rawModelId: string | number,           // the raw opt.compmodel.value float
  rawParams:  Record<string, unknown>    // all raw comp.* fields from state tree
}
```

Read parameter values directly from `raw/state` for these models until their schemas are added.

---

### Accepted Properties per Model — EQ

#### `STANDARD` EQ — Full parametric schema

```typescript
{
  model:          "STANDARD",              // required
  enabled?:       boolean,
  highGainDb?:    number,                  // high shelf gain (dB)
  highMidGainDb?: number,                  // high-mid peak gain (dB)
  lowMidGainDb?:  number,                  // low-mid peak gain (dB)
  lowGainDb?:     number                   // low shelf gain (dB)
}
```

> NOTE: Frequency and Q values are not yet in the normalized schema — read them from `line.chN.eq.eqfreq1-4` and `line.chN.eq.eqq1-4` in raw/state.

#### Other EQ models → `UNKNOWN` passthrough

Models `PASSIVE`, `VINTAGE`, `ALPINE_EQ_550`, `BAXANDALL_EQ`, `RC_500_EQ`, `SOLAR_69_EQ`, `TUBE_EQ`, `VINTAGE_3_BAND_EQ`, `VT_1_EQ` are not yet fully schema-defined. When decoded they return:

```typescript
{
  model:      "UNKNOWN",
  rawModelId: string | number,
  rawParams:  Record<string, unknown>,
  bands?:     Array<{
    frequencyHz?: number,
    gainDb?:      number,
    qFactor?:     number,
    enabled?:     boolean
  }>
}
```

Read EQ parameters from `line.chN.eq.*` in raw/state for these models.

---

### Write Capability — Current Status

> **No write tools exist.** Fat Channel model selection and parameter adjustment via MCP is **not yet implemented**.

This is intentional — ADR-005 (read-only-first policy) and REQ-NF-002 require that write tools only be added after a `ProposedChangeSet` + audit log + confirmation flow is implemented.

**What exists in code**: An empty `if (config.writeEnabled)` stub in `tools.ts` with a warning log. No set_fader, set_mute, set_fat_channel, or any other write tool is registered.

**What would be needed to implement Fat Channel writes**:
1. A `set_fat_channel_model` tool: `{ deviceId, channelId, compModel?, eqModel? }` — sets `opt.compmodel` and/or `opt.eqmodel` via the featherbear client
2. A `set_fat_channel_params` tool for threshold/ratio/attack/release etc.
3. Full `ProposedChangeSet` + audit log + optional confirmation flow per ADR-005
4. Tests updating REQ-NF-002 coverage

**Agent workflow for Fat Channel today**:
1. `discover_mixers` → get `deviceId`
2. `refresh_mixer_state({ deviceId })` → ensure state is fresh
3. Read `presonus://mixer/{deviceId}/channels` → check `compModelName` and `eqModelName` per channel
4. Read `presonus://mixer/{deviceId}/raw/state` → inspect parameter values
5. Advise the human operator what to change in UC Surface (cannot write autonomously)

---
