which workflow should i use to create that MCP i mean somehow we need to find out which endpoints the API provides, and need to the json structures need to exactly match. i think we would also require an enumeration for EQ or compressor models of FatChannels

# Recommended workflow

You need a **schema-first + probe-driven** workflow.

Do **not** start by writing MCP tools. First build a small project that discovers the actual PreSonus API surface, captures real mixer state, and generates stable schemas from that evidence.

Also: with `featherbear/presonus-studiolive-api`, “endpoints” mostly means **TypeScript client methods, events, message types, state keys, and raw protocol payloads**, not HTTP REST endpoints. The library exposes `Client`, `Discovery`, `MeterServer`, constants and types, and the documented client API includes connection, mute/solo/fader/pan/link/color, project/scene, metering, discovery and state access. ([GitHub][1]) ([featherbear.cc][2]) ([featherbear.cc][2]) ([featherbear.cc][2])

---

# 1. Use three schema layers

You should not expose the raw PreSonus structure directly as MCP. Use this boundary:

```text
Raw PreSonus protocol/API layer
  Exact observed keys, packets, values, raw enums, raw numbers

Adapter layer
  Typed wrapper around featherbear API

Normalized mixer domain model
  Stable AI-facing model: channels, mixes, Fat Channel, routing, meters

MCP layer
  Tools/resources/prompts with explicit JSON Schema
```

## Why three layers?

The PreSonus API docs explicitly say that unknown or not-yet-exposed state can be accessed through `client.state.get(key)`, and that users should refer to `zlib.parsed` or `client.state._data` for known keys/intellisense. That means the real state surface is partly empirical, not fully declared in public docs. ([featherbear.cc][2])

So:

| Layer       | Purpose                                       | Strictness                          |
| ----------- | --------------------------------------------- | ----------------------------------- |
| Raw capture | Preserve exact mixer/API data                 | Must not lose fields                |
| Adapter     | Convert raw values into typed internal values | Strict but tolerant                 |
| MCP         | Give agents safe, meaningful context          | Stable and intentionally simplified |

---

# 2. Start with a discovery harness, not the MCP server

Build a separate CLI first:

```text
presonus-probe
```

Its job:

```text
1. Auto-discover mixers
2. Connect read-only
3. Dump full state
4. Dump available projects/scenes/presets
5. Subscribe to state events
6. Subscribe to meters
7. Save all observations as timestamped JSON
8. Diff before/after changes made manually in UC Surface
```

The library already supports discovery with fields like `name`, `serial`, `ip`, `port`, and `timestamp`; standalone discovery is also supported. ([featherbear.cc][2]) ([featherbear.cc][2])

Suggested output:

```text
captures/
  2026-06-24_32sc_boot/
    discovery.json
    connect-info.json
    state.dump.json
    state.keys.txt
    current-project.json
    current-scene.json
    channel-presets.json
    meters-10s.jsonl
    events-60s.jsonl
```

This becomes your **golden dataset**.

---

# 3. Static API inventory

Create a second CLI:

```text
presonus-api-inventory
```

It should inspect the installed package and generate:

```text
docs/generated/presonus-api-surface.md
docs/generated/presonus-types.md
schemas/generated/presonus-exported-types.json
```

Use:

```text
ts-morph
typescript compiler API
typedoc
or direct .d.ts parsing
```

Inventory these things:

```text
Exported classes
Exported enums/constants
Exported types/interfaces
Client methods
Event names
Message codes
Channel selector shape
Meter data shape
Project/scene methods
State access methods
```

The public documentation already gives important anchors: `MessageCode` includes JSON `JM`, setting `PV`, device list `PL`, file resource `FR`/`FD`, zlib `ZB`, mute `MB`, and fader/meter `MS`; `ChannelTypes` include `LINE`, `RETURN`, `FXRETURN`, `TALKBACK`, `AUX`, `FX`, `SUB`, and `MAIN`. ([featherbear.cc][2])

---

# 4. Runtime probe/diff workflow

This is the most important part.

For each mixer model you care about — your 32SC, 32R, possibly RME/AVB later — run controlled tests.

## Example test sequence

```text
Baseline:
  dump full state

Manual change in UC Surface:
  rename channel 1 to "Kick"

Probe:
  dump full state again
  save event stream
  diff baseline vs after

Manual change:
  select compressor model on channel 1

Probe:
  dump full state again
  diff baseline vs after
```

You need one stimulus per property:

```text
Channel name
Mute
Solo
Fader
Pan
Link
Color
Input source/routing
Phantom power
Gate on/off
Compressor on/off
Compressor model
Compressor threshold
Compressor ratio
EQ on/off
EQ model
EQ band parameters
Limiter
Aux send level
Aux send mute
FX send level
Scene recall
Project recall
```

The featherbear API listens to specific data events and also supports a generic `data` event plus meter events. ([featherbear.cc][2]) This lets you build a reliable “what changed?” recorder.

---

# 5. Fat Channel enumeration workflow

Yes, you need explicit enums for Fat Channel compressor and EQ models — but with an important caveat:

```text
Official product model names ≠ protocol enum values
```

PreSonus documents Fat Channel XT as having Standard, Tube, and FET compressor choices, and Standard, Passive, and Vintage EQ choices. ([PreSonus][3]) PreSonus also documents the Fat Channel Collection Vol. 1 as adding models such as Baxandall EQ, Vintage 3-band EQ, Tube EQ, Alpine EQ-550, Solar 69 EQ, Comp 160, Everest C100A, Classic Compressor, Tube CB, FC-670, and Brit Comp, and states that these work in StudioLive Series III mixers. ([PreSonus][4])

But your MCP server must discover the **actual raw codes** used by your mixer firmware.

## Fat Channel enum extraction process

For every channel type where Fat Channel exists:

```text
1. Dump baseline state.
2. Select channel in UC Surface.
3. Change compressor model manually.
4. Dump state.
5. Diff all keys containing:
   comp
   compressor
   dyn
   model
   type
   fat
   strip
6. Repeat for every available compressor model.
7. Repeat for every EQ model.
8. Build observed enum table:
   raw key
   raw value
   normalized enum
   display name
   supported mixer
   firmware version
```

## Store both raw and normalized values

Do **not** only store this:

```ts
compressorModel: "FET"
```

Store this:

```ts
compressorModel: {
  normalized: "FET",
  rawValue: 2,
  rawPath: "line.ch1.fat.comp.model",
  displayName: "FET",
  confidence: "observed"
}
```

That protects you if firmware or plugin licensing changes the value set.

---

# 6. Proposed enum structure

Start with known/expected values, but allow unknowns.

```ts
export const FatCompressorModel = z.enum([
  "STANDARD",
  "TUBE",
  "FET",

  "BRIT_COMP",
  "CLASSIC_COMPRESSOR",
  "COMP_160",
  "EVEREST_C100A",
  "FC_670",
  "TUBE_CB",

  "UNKNOWN"
]);

export const FatEqModel = z.enum([
  "STANDARD",
  "PASSIVE",
  "VINTAGE",

  "BAXANDALL_EQ",
  "VINTAGE_3_BAND_EQ",
  "TUBE_EQ",
  "ALPINE_EQ_550",
  "SOLAR_69_EQ",

  "UNKNOWN"
]);
```

Then model the value as a discriminated object:

```ts
const FatModelRefSchema = z.object({
  normalized: z.string(),
  rawValue: z.union([z.number(), z.string(), z.boolean(), z.null()]),
  rawPath: z.string(),
  displayName: z.string().optional(),
  confidence: z.enum(["documented", "observed", "guessed", "unknown"]),
});
```

This is better than a closed enum alone. For live hardware, closed enums are brittle.

---

# 7. Define your canonical MCP JSON structures with Zod

The current MCP TypeScript SDK supports building servers with tools/resources/prompts and uses schema libraries such as Zod v4 through Standard Schema-compatible tool/prompt schemas. ([GitHub][5]) The MCP spec also states that tool definitions include `inputSchema` and optional `outputSchema`, and those schemas follow JSON Schema rules. ([Model Context Protocol][6])

So your source of truth should be:

```text
src/schemas/
  identity.ts
  channel.ts
  fat-channel.ts
  routing.ts
  metering.ts
  show.ts
  tools.ts
```

Example:

```ts
import * as z from "zod/v4";

export const ChannelTypeSchema = z.enum([
  "LINE",
  "RETURN",
  "FXRETURN",
  "TALKBACK",
  "AUX",
  "FX",
  "SUB",
  "MAIN",
]);

export const ChannelSelectorSchema = z.object({
  type: ChannelTypeSchema,
  channel: z.number().int().positive(),
  mixType: z.enum(["AUX", "FX"]).optional(),
  mixNumber: z.number().int().positive().optional(),
});

export const MixerChannelSchema = z.object({
  id: z.string(),
  selector: ChannelSelectorSchema,
  name: z.string().optional(),
  mute: z.boolean().optional(),
  solo: z.boolean().optional(),
  fader: z.object({
    db: z.number().optional(),
    linear: z.number().min(0).max(100).optional(),
    raw: z.unknown().optional(),
  }),
  pan: z.number().min(0).max(100).optional(),
  linked: z.boolean().optional(),
  color: z.string().optional(),
});
```

For MCP output, prefer **stable normalized JSON**. Keep raw data available through a separate diagnostic resource:

```text
presonus://mixer/{id}/raw/state
presonus://mixer/{id}/raw/events
```

---

# 8. MCP workflow architecture

## Phase A — probe-only

No MCP yet.

```text
presonus-probe discover
presonus-probe dump --device FOH-32SC
presonus-probe listen --device FOH-32SC --seconds 60
presonus-probe diff before.json after.json
```

Goal:

```text
Know actual keys
Know actual value types
Know Fat Channel model codes
Know meter array layout
Know which state fields are reliable
```

## Phase B — adapter

Build:

```text
src/presonus/
  PresonusDiscoveryService.ts
  PresonusClientManager.ts
  PresonusStateCache.ts
  PresonusStateMapper.ts
  PresonusMeterSummarizer.ts
  PresonusFatChannelMapper.ts
```

This layer consumes featherbear API and returns **your** schemas.

## Phase C — read-only MCP

Expose only:

```text
resources/list
resources/read
tools/list
tools/call for safe analysis tools
```

Initial MCP resources:

```text
presonus://mixers
presonus://mixer/{id}/overview
presonus://mixer/{id}/channels
presonus://mixer/{id}/fat-channel-summary
presonus://mixer/{id}/meters/summary
presonus://mixer/{id}/routing
presonus://show/{showId}/patch-plan
```

Initial tools:

```text
discover_mixers
refresh_mixer_state
compare_rider_to_mixer
generate_patch_plan
validate_routing
generate_soundcheck_checklist
```

## Phase D — proposed changes only

Do not implement direct fader/mute/scene operations first.

Implement:

```text
prepare_change_set
validate_change_set
export_change_set
```

Output:

```json
{
  "changeSetId": "showprep-2026-06-24-001",
  "targetMixer": {
    "alias": "FOH-32SC",
    "serial": "..."
  },
  "changes": [
    {
      "kind": "rename-channel",
      "target": {
        "type": "LINE",
        "channel": 1
      },
      "currentValue": "Ch 1",
      "proposedValue": "Kick",
      "reason": "Rider input 1 is Kick",
      "risk": "low"
    }
  ]
}
```

Only later add `apply_change_set`.

---

# 9. Test strategy

## Golden-file tests

Use captured mixer dumps:

```text
test/fixtures/32sc/state-full.json
test/fixtures/32r/state-full.json
test/fixtures/32sc/fat-channel-models.json
```

Tests:

```text
raw state parses
all known channels map
unknown fields are preserved
Fat Channel models map
meter summaries compute
MCP output validates against JSON Schema
```

## Hardware-in-loop tests

Run only when mixer is available:

```text
HIL_PRES0NUS=1 pnpm test:hil
```

Tests:

```text
discovery returns expected serial
connects to expected IP
state dump contains expected mixer name
current scene readable
meter subscription receives data
no write operation executed in read-only mode
```

## Contract tests

Every MCP tool/resource should have:

```text
input schema validation
output schema validation
example response fixture
failure response fixture
```

---

# 10. Suggested repository layout

```text
presonus-mcp/
  src/
    mcp/
      server.ts
      resources.ts
      tools.ts
      prompts.ts

    presonus/
      discovery.ts
      client-manager.ts
      state-cache.ts
      state-mapper.ts
      meter-summarizer.ts
      fat-channel-mapper.ts

    schemas/
      mixer.ts
      channel.ts
      fat-channel.ts
      routing.ts
      metering.ts
      show.ts
      tools.ts

    cli/
      probe.ts
      inventory.ts
      diff-state.ts

  captures/
    .gitignore

  docs/
    api-inventory.md
    state-key-map.md
    fat-channel-enum-map.md
    mcp-resources.md
    mcp-tools.md

  test/
    fixtures/
    unit/
    contract/
    hil/
```

---

# 11. Most important generated documents

You should maintain these as artifacts:

## `state-key-map.md`

```text
Raw key                         Type      Normalized field
line.ch1.mute                   boolean   channels[1].mute
line.ch1.volume                 number    channels[1].fader.linear
global.mixer_name               string    mixer.name
...
```

## `fat-channel-enum-map.md`

```text
Raw key                         Raw value   Normalized enum       Display name
line.ch1.comp.model             0           STANDARD              Standard
line.ch1.comp.model             1           TUBE                  Tube
line.ch1.comp.model             2           FET                   FET
...
```

## `mcp-tool-contracts.md`

```text
Tool: validate_routing
Input schema: ...
Output schema: ...
May mutate mixer: no
Requires mixer connection: yes
Safe during soundcheck: yes
Safe during show: read-only only
```

---

# 12. Practical first milestone

Your first useful milestone should be:

```text
Read-only MCP server that can:
1. auto-discover 32SC and 32R
2. identify them by serial
3. expose normalized channel list
4. expose current scene/project
5. expose meter summary
6. expose raw diagnostic state
7. compare a rider input list against mixer channels
8. produce a patch/soundcheck checklist
```

Do **not** implement write/control tools until after the probe/diff phase has proven the schemas and state mappings.

The immediate next coding task should be `presonus-probe`, not `server.ts`.

[1]: https://raw.githubusercontent.com/featherbear/presonus-studiolive-api/master/src/api.ts "raw.githubusercontent.com"
[2]: https://featherbear.cc/presonus-studiolive-api/ "API Documentation"
[3]: https://www.presonus.com/products/fat-channel-xt?srsltid=AfmBOooUZkNZq69MDalvpa1ayD-EUHc5twNyBummsDvTz8FZOKNlXnQg "
      Fat Channel XT
 – PreSonus"
[4]: https://www.presonus.com/products/fat-channel-collection-vol-1?srsltid=AfmBOooHHEWBilopeeoxZ-TACkdIytIwNstFKh5mQU7v9OFtRxDZwDLV "
      Fat Channel Collection - Vol. 1
 – PreSonus"
[5]: https://github.com/modelcontextprotocol/typescript-sdk "GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients · GitHub"
[6]: https://modelcontextprotocol.io/specification/2025-11-25/server/tools "Tools - Model Context Protocol"
