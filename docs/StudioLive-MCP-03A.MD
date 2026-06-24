which workflow should i use to create that MCP i mean somehow we need to find out which endpoints the API provides, and need to the json structures need to exactly match. i think we would also require an enumeration for EQ or compressor models of FatChannels

## Recommended workflow

Do **not** start with the MCP server. Start with a **PreSonus protocol/state inspector**. The MCP server should be the last layer, after you have a verified mixer-state contract.

```text
1. API reconnaissance
2. Runtime state capture
3. State-key catalogue
4. Normalized domain model
5. Fat Channel model/parameter mapping
6. MCP resource/tool design
7. Contract tests with real fixtures
8. Optional write/control tools
```

The reason: `featherbear/presonus-studiolive-api` is not a REST API with clean “endpoints”. It is a Node.js client for the StudioLive control protocol. It exposes client methods, event streams, meter streams and a cached device-state tree. The docs explicitly show state access through `client.state.get("...")`, mention `dumpState()`, and point to `zlib.parsed` / `client.state._data` for known or discoverable state keys. ([featherbear.cc][1])

---

# 1. Build an API/state inspector first

Create a small CLI tool before the MCP server.

## `presonus-inspect`

Functions:

```text
presonus-inspect discover
presonus-inspect connect --device <serial|ip|alias>
presonus-inspect dump-state --out fixtures/32sc-state.json
presonus-inspect watch-events --out captures/events.ndjson
presonus-inspect watch-meters --seconds 30 --out captures/meters.ndjson
presonus-inspect diff-state --before A.json --after B.json
presonus-inspect probe-fat-channel --channel LINE:1
```

This tool should connect to your 32SC and 32R, dump the raw state, subscribe to all events, and save everything as fixtures.

The library already supports discovery with device fields such as `name`, `serial`, `ip`, `port`, and `timestamp`, and it also has standalone discovery via a `Discovery` client. ([featherbear.cc][1])

---

# 2. Catalogue the real API surface

Treat the available API surface as three groups.

## Discovery / connection

Document:

```ts
discover(timeout)
new Discovery()
discoveryClient.start()
new Client({ host, port })
client.connect()
client.close()
```

The docs show that control uses TCP port `53000`, UDP is used for metering, and discovery packets are emitted periodically by the console. ([featherbear.cc][1])

## Read/state/event surface

Document:

```ts
client.state.get(key)
client.dumpState()
client.on("data", ...)
client.on(MessageCode.Setting, ...)
client.on("meter", ...)
client.meterSubscribe()
client.currentProject
client.currentScene
client.getProjects()
client.getScenesOfProject()
client.getChannelPresets()
```

The docs explicitly show examples such as `global.mixer_name` and `line.ch1.mute`, and they say `state.get()` can extract data not yet wrapped by higher-level methods. ([featherbear.cc][1])

## Write/control surface

Document, but do **not** expose directly through MCP yet:

```ts
mute()
unmute()
toggleMute()
setMute()
getSolo()
toggleSolo()
setSolo()
setChannelVolumeLogarithmic()
setChannelVolumeLinear()
setLink()
setColor()
setPan()
recallProject()
recallProjectScene()
```

Those methods are listed in the client API documentation, including fader, mute, solo, pan, link, color, project recall and scene recall. ([featherbear.cc][1])

---

# 3. Generate a state-key catalogue

This is the most important part.

Create a catalogue like this:

```json
{
  "key": "line.ch1.mute",
  "type": "boolean",
  "channelType": "LINE",
  "channel": 1,
  "semantic": "channelMute",
  "readable": true,
  "writableVia": "setMute",
  "observedOn": ["StudioLive 32SC firmware ...", "StudioLive 32R firmware ..."],
  "examples": [false, true]
}
```

## How to discover keys

Use this loop:

```text
1. Dump full state.
2. Change exactly one thing in UC Surface or on the mixer.
3. Dump state again.
4. Diff the two dumps.
5. Name the changed key semantically.
6. Repeat for every feature.
```

Example matrix:

| Mixer action                    | Expected discovered keys              |
| ------------------------------- | ------------------------------------- |
| Rename channel 1                | name/string keys                      |
| Mute channel 1                  | mute key                              |
| Move channel 1 fader            | fader/level key                       |
| Pan channel 1                   | pan key                               |
| Select compressor model         | compressor model key + parameter keys |
| Change EQ model                 | EQ model key + parameter keys         |
| Enable phantom                  | phantom/preamp key, if exposed        |
| Route 32R input to 32SC channel | routing/AVB source key, if exposed    |

Do not assume key names from memory. Let the mixer tell you.

---

# 4. Keep raw JSON and normalized JSON separate

You need two schemas:

```text
Raw PreSonus state schema
  = whatever the mixer/API actually emits

Normalized MCP/domain schema
  = stable, agent-safe representation
```

Do **not** force MCP resources to mirror the raw `zlib.parsed` tree. That raw tree is useful for validation and reverse engineering, but the agent should consume normalized state.

## Example

Raw:

```json
{
  "line.ch1.mute": false,
  "line.ch1.name": "Kick",
  "global.mixer_name": "StudioLive 32SC"
}
```

Normalized:

```json
{
  "deviceId": "serial:...",
  "alias": "FOH-32SC",
  "channels": [
    {
      "id": "line.ch1",
      "type": "LINE",
      "number": 1,
      "name": "Kick",
      "mute": false
    }
  ]
}
```

This makes MCP safer and less brittle.

---

# 5. Use Zod or JSON Schema from day one

Since the MCP TypeScript SDK uses schemas for tool arguments, define the contracts once and reuse them. The official TypeScript SDK documentation says the SDK supports servers exposing tools, resources and prompts, and uses schema libraries such as Zod-compatible “Standard Schema” for tool and prompt schemas. ([GitHub][2])

Recommended packages:

```text
packages/
  presonus-adapter/
  presonus-inspector/
  presonus-domain/
  presonus-mcp-server/
  fixtures/
```

## `presonus-domain`

```ts
export const ChannelSelectorSchema = z.object({
  type: z.enum(["LINE", "AUX", "FX", "SUB", "MAIN", "RETURN", "FXRETURN", "TALKBACK"]),
  channel: z.number().int().positive()
});

export const MixerIdentitySchema = z.object({
  deviceId: z.string(),
  serial: z.string().optional(),
  alias: z.string().optional(),
  model: z.string().optional(),
  ip: z.string(),
  port: z.number().int(),
  role: z.enum(["FOH", "STAGEBOX", "MONITOR", "UNKNOWN"]),
  controllable: z.boolean()
});
```

Then all MCP tools/resources use these same schemas.

---

# 6. Fat Channel: build enums, but verify numeric IDs empirically

Yes: you need explicit enumerations for Fat Channel compressor and EQ models. But there are two different problems:

```text
A. Human model names
B. Mixer internal model IDs / state-key values
```

The human names can be seeded from PreSonus documentation. The internal IDs must be discovered by state diffs.

## Known add-on compressor models

PreSonus lists these additional Fat Channel compressor models:

```ts
export const FatChannelCompressorModelName = z.enum([
  "BRIT_COMP",
  "CLASSIC_COMPRESSOR",
  "COMP_160",
  "EVEREST_C100A",
  "FC_670",
  "RC_500_COMPRESSOR",
  "TUBE_CB",
  "VT_1_COMPRESSOR"
]);
```

These are listed in the StudioLive Series III Fat Channel Plug-ins Addendum. 

## Known add-on EQ models

PreSonus lists these additional Fat Channel EQ models:

```ts
export const FatChannelEqModelName = z.enum([
  "ALPINE_EQ_550",
  "BAXANDALL_EQ",
  "RC_500_EQ",
  "SOLAR_69_EQ",
  "TUBE_EQ",
  "VINTAGE_3_BAND_EQ",
  "VT_1_EQ"
]);
```

These are also listed in the Fat Channel Plug-ins Addendum. 

## Also include factory models

The addendum states that authorized plug-ins appear alongside the factory models that came with the mixer.  Therefore your enum should be open enough for factory and unknown models:

```ts
export const FatChannelCompressorModelSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), name: FatChannelCompressorModelName }),
  z.object({ kind: z.literal("factory"), name: z.string() }),
  z.object({ kind: z.literal("unknown"), rawId: z.union([z.string(), z.number()]) })
]);
```

I would not hard-code numeric model IDs until you have captured them from your own 32SC and 32R.

---

# 7. Fat Channel parameters must be model-specific

Do **not** define one universal compressor schema. Different models expose different parameters.

For example, the addendum shows that Brit Comp exposes controls such as threshold, attack, ratio, release, makeup, key filter, key on/off and sidechain; Classic Compressor has a different control set with gain, recovery and ratio; Comp 160 has threshold, compression, output gain, key listen, key filter and sidechain. 

Use discriminated unions:

```ts
const BritCompSchema = z.object({
  model: z.literal("BRIT_COMP"),
  enabled: z.boolean().optional(),
  thresholdDb: z.number().optional(),
  attackMs: z.number().optional(),
  ratio: z.number().optional(),
  releaseSec: z.number().optional(),
  makeupDb: z.number().optional(),
  keyFilterHz: z.number().optional(),
  keyEnabled: z.boolean().optional(),
  sidechain: z.string().optional()
});

const Comp160Schema = z.object({
  model: z.literal("COMP_160"),
  enabled: z.boolean().optional(),
  thresholdDb: z.number().optional(),
  compression: z.number().optional(),
  outputGainDb: z.number().optional(),
  keyListen: z.boolean().optional(),
  keyFilterHz: z.number().optional(),
  sidechain: z.string().optional()
});

export const FatChannelCompressorStateSchema = z.discriminatedUnion("model", [
  BritCompSchema,
  Comp160Schema,
  // more models
  z.object({
    model: z.literal("UNKNOWN"),
    rawModelId: z.union([z.string(), z.number()]),
    rawParams: z.record(z.string(), z.unknown())
  })
]);
```

This is more work, but it prevents wrong JSON structures.

---

# 8. Build the Fat Channel probe workflow

For every compressor/EQ model:

```text
1. Select LINE ch1.
2. Dump state.
3. Select compressor model in UC Surface.
4. Dump state.
5. Diff state.
6. Move each visible parameter one at a time.
7. Dump/diff after each move.
8. Store mapping:
   - raw key
   - raw value range
   - unit
   - normalized name
   - model dependency
```

Example output:

```json
{
  "processor": "compressor",
  "modelName": "BRIT_COMP",
  "rawModelKey": "line.ch1.fat.comp.model",
  "rawModelValue": 7,
  "parameters": [
    {
      "rawKey": "line.ch1.fat.comp.threshold",
      "normalized": "thresholdDb",
      "unit": "dB",
      "range": [-60, 0],
      "observedValues": [-18, -12, -6]
    }
  ]
}
```

Do this on both:

```text
StudioLive 32SC
StudioLive 32R
```

because model availability can depend on firmware, installed plug-ins and authorization. The addendum states plug-ins must be installed and authorized per mixer, and authorized plug-ins become available in UC Surface / console model menus. 

---

# 9. MCP design after the contract is stable

Once the domain model exists, implement MCP.

## Resources

```text
presonus://mixers
presonus://mixer/{deviceId}/identity
presonus://mixer/{deviceId}/channels
presonus://mixer/{deviceId}/fat-channel
presonus://mixer/{deviceId}/meters/summary
presonus://mixer/{deviceId}/routing
presonus://show/{showId}/input-list
presonus://show/{showId}/routing-validation
```

## Tools

Initially only:

```text
discover_mixers
refresh_mixer_state
validate_mixer_identity
compare_rider_to_mixer
generate_input_list
generate_patch_plan
validate_routing
generate_soundcheck_checklist
prepare_change_set
```

Avoid raw tools like:

```text
set_fader
set_mute
recall_scene
set_fat_channel_model
```

at the start. MCP tools are model-invocable, and the MCP spec explicitly describes tools as model-controlled and recommends human confirmation for operations. ([Model Context Protocol][3])

---

# 10. Contract tests are mandatory

Create fixture tests like this:

```text
fixtures/
  32sc/
    discovery.json
    initial-state.json
    after-line1-muted.json
    after-line1-brit-comp.json
    after-line1-alpine-eq.json
  32r/
    discovery.json
    initial-state.json
    after-line1-muted.json
```

Test levels:

```text
Raw fixture parses
Raw-to-normalized conversion works
Normalized schema validates
MCP resource output validates
MCP tool input schema rejects invalid commands
Diff tests detect expected changed keys
Unknown keys are logged, not fatal
Unknown Fat Channel models survive as UNKNOWN
```

Critical test rule:

```text
No MCP JSON structure is accepted unless it validates against the schema.
No raw mixer key is trusted unless it exists in at least one real fixture.
```

---

# 11. Practical implementation order

## Phase 0 — repo skeleton

```text
presonus-mcp/
  packages/
    presonus-adapter/
    presonus-domain/
    presonus-inspector/
    presonus-mcp-server/
  fixtures/
  docs/
    api-surface.md
    state-key-catalog.md
    fat-channel-model-map.md
```

## Phase 1 — inspector

Implement discovery, connect, dump-state, event-watch, meter-watch, diff-state.

## Phase 2 — state-key catalogue

Manually operate the mixer and create a reliable mapping for:

```text
identity
channels
names
mute
solo
fader
pan
link
meters
current project
current scene
basic routing
Fat Channel model IDs
Fat Channel parameters
```

## Phase 3 — domain schemas

Write Zod schemas and converters:

```text
RawState → MixerSnapshot
MeterData → MeterSummary
RawFatChannel → FatChannelState
RawRoutes → RoutingGraph
```

## Phase 4 — read-only MCP

Expose resources and analysis tools only.

## Phase 5 — show-prep layer

Add rider import, input-list generation, patch-plan comparison, soundcheck checklist.

## Phase 6 — change-set proposals

Generate proposed changes, but do not execute them.

---

# Key design decision

Your MCP server should not wrap `featherbear/presonus-studiolive-api` one-to-one.

It should wrap this:

```text
Verified PreSonus state catalogue
  ↓
typed raw schemas
  ↓
normalized mixer model
  ↓
show-prep/routing/soundcheck analysis
  ↓
MCP resources + safe tools
```

That workflow gives you exact JSON structures where they matter, while avoiding a brittle agent interface tied directly to undocumented mixer internals.

[1]: https://featherbear.cc/presonus-studiolive-api/ "API Documentation"
[2]: https://github.com/modelcontextprotocol/typescript-sdk "GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients · GitHub"
[3]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools "Tools - Model Context Protocol"
