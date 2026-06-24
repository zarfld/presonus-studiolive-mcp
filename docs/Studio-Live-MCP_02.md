Will the server auto-discover mixers, or use a configured IP? - auto-disover (fallback: configure IP); Can multiple mixers be present? - yes. What is the stable identity: serial, IP, or configured alias? IP can change; serial is better if available. Should agents see all mixers or only the active FOH mixer? yes the agent should be able to validate routing between those mixers, but we need to take care that we are operating the "right" mixer for operations. add info the idea is that the agent should be able to prepare a show based on multiple rider information provided, or help during soundcheck but don't do actual live mixing

## Updated design assumption

Your MCP server should operate in this mode:

```text
Multi-mixer visibility
+ show-preparation intelligence
+ routing validation
+ soundcheck assistance
− no autonomous live mixing
− no unrestricted remote-control surface
```

That changes the architecture. The agent should be allowed to **inspect all detected mixers**, correlate them, validate routing, compare rider requirements against current mixer state, and produce proposed changes. Actual mixer mutations should be either disabled or require an explicit “apply this prepared change set” step.

The `featherbear/presonus-studiolive-api` package fits the discovery/state-control layer because it is an unofficial Node.js API for StudioLive III consoles and is documented as tested with StudioLive 32SC, 16R, and 24R devices. It also exposes discovery data including `name`, `serial`, `ip`, `port`, and `timestamp`, which is directly useful for stable mixer identity. ([featherbear.cc][1])

---

# Revised critical requirements

## 1. Multi-device inventory model

Because multiple mixers may be present, the MCP server needs a first-class **device registry**, not just a single `Client`.

```ts
type MixerIdentity = {
  deviceId: string;          // internal stable UUID
  serial?: string;           // preferred stable identity
  configuredAlias?: string;  // e.g. "FOH-32SC", "Stagebox-32R"
  model?: string;
  name?: string;
  ip: string;
  port: number;
  lastSeen: string;
  role?: "FOH" | "STAGEBOX" | "MONITOR" | "UNKNOWN";
  trustedForControl: boolean;
};
```

### Identity rule

Use this priority:

```text
1. serial + model
2. configured alias + serial
3. configured alias + static IP
4. IP + port as temporary fallback only
```

IP alone should never be treated as a stable identity.

---

## 2. Auto-discovery with configured fallback

Discovery should be the normal path, but the server should support pinned devices.

```yaml
discovery:
  enabled: true
  timeoutMs: 5000
  rescanIntervalSec: 30

devices:
  - alias: "FOH-32SC"
    expectedSerial: "..."
    fallbackIp: "192.168.10.50"
    role: "FOH"
    allowControl: true

  - alias: "Stagebox-32R"
    expectedSerial: "..."
    fallbackIp: "192.168.10.51"
    role: "STAGEBOX"
    allowControl: false
```

The API documentation explicitly supports standalone discovery for finding devices without connecting, including name, serial, IP, port, and timestamp fields. ([featherbear.cc][1])

---

## 3. Separate **visible mixers** from **controllable mixer**

The agent may inspect all mixers, but write operations must be bound to a specific allowed target.

```text
Readable:
  FOH-32SC
  Stagebox-32R
  Monitor mixer if present
  Discovered unknown mixers

Writable:
  only explicitly configured/control-authorized mixer
```

### Requirement

Every write-capable tool must require:

```json
{
  "deviceId": "FOH-32SC",
  "expectedSerial": "...",
  "expectedRole": "FOH",
  "target": "...",
  "operation": "...",
  "dryRun": true
}
```

This prevents the agent from accidentally muting or changing the wrong mixer when multiple StudioLive devices are visible.

---

# MCP resource/tool split

MCP resources are intended to expose contextual data to models, while tools are model-invocable actions against external systems. That distinction matters here: mixer state, rider analysis, patch plans, and routing diagnostics should be resources; fader/mute/scene operations should be tools and therefore much more restricted. ([Model Context Protocol][2]) MCP tools are model-controlled and may be invoked automatically by the model, so the spec recommends clear exposure, visible invocation, confirmation prompts, and a human in the loop for trust and safety. ([Model Context Protocol][3])

## Resources

Expose these freely in read-only mode:

```text
presonus://mixers
presonus://mixer/{deviceId}/identity
presonus://mixer/{deviceId}/overview
presonus://mixer/{deviceId}/channels
presonus://mixer/{deviceId}/mixes
presonus://mixer/{deviceId}/routing
presonus://mixer/{deviceId}/scene/current
presonus://mixer/{deviceId}/meters/summary
presonus://mixer/{deviceId}/health
presonus://show/current/rider
presonus://show/current/input-list
presonus://show/current/patch-plan
presonus://show/current/soundcheck-plan
presonus://show/current/routing-validation
```

## Tools

Initial MVP tools should be non-destructive:

```text
discover_mixers
refresh_mixer_state
validate_mixer_identity
analyze_rider
generate_input_list
generate_patch_plan
validate_routing
generate_soundcheck_checklist
compare_rider_to_current_scene
```

Later, optional controlled tools:

```text
prepare_change_set
dry_run_change_set
apply_change_set
```

Avoid exposing low-level direct tools like `set_fader`, `set_mute`, or `recall_scene` to the agent initially.

---

# Show-preparation workflow

The strongest use case is not “AI mixes the show”. It is:

```text
Rider(s)
  ↓
normalized input requirements
  ↓
mixer capability/state inspection
  ↓
patch plan
  ↓
scene preparation checklist
  ↓
routing validation
  ↓
soundcheck checklist
  ↓
human applies or confirms changes
```

## Required show data model

```ts
type ShowInput = {
  inputNo?: number;
  sourceName: string;          // "Kick In", "Snare Top", "Lead Vox"
  performer?: string;
  micPreference?: string;
  phantomRequired?: boolean;
  standRequired?: boolean;
  monitorImportance?: "low" | "normal" | "critical";
  notes?: string;
};

type RiderPlan = {
  showName: string;
  bands: BandRider[];
  mergedInputList: ShowInput[];
  conflicts: RiderConflict[];
  requiredMixerChannels: number;
  requiredAuxMixes: number;
  requiredFX: string[];
};
```

## Critical rider questions

| Question                                       | Requirement                                |
| ---------------------------------------------- | ------------------------------------------ |
| Multiple bands per show?                       | Support per-band scenes or scene notes.    |
| Changeover time?                               | Affects patch-plan design.                 |
| Shared drum kit/backline?                      | Needed for merged input list.              |
| Are inputs physically repatched between bands? | Determines whether scene recall is enough. |
| Are monitor mixes per band or shared?          | Critical for soundcheck planning.          |
| Does the 32R act as stagebox for the 32SC?     | Needed for routing validation.             |

---

# Routing validation requirements

Since the agent should validate routing between mixers, the MCP server needs a graph model.

```ts
type AudioRoute = {
  sourceDeviceId: string;
  sourcePort: string;
  destinationDeviceId: string;
  destinationPort: string;
  signalName?: string;
  expected?: boolean;
  actual?: boolean;
  status: "ok" | "missing" | "unexpected" | "ambiguous" | "unknown";
};
```

## Required validations

```text
1. Mixer identity validation
2. FOH mixer selected correctly
3. Stagebox/rack mixer present
4. Expected input channels available
5. Expected AVB/network/audio routes present
6. Channel names match input list
7. Phantom power requirements flagged
8. Monitor aux count sufficient
9. FX returns not conflicting with input requirements
10. Main outputs / subgroups / matrix routes plausible
```

## Important limitation

The `featherbear/presonus-studiolive-api` may give you mixer state, but complete AVB routing validation may require additional sources depending on what the API exposes reliably. You may eventually need a second adapter for UCNET/AVB/AVDECC/Milan information, especially if you want to validate 32SC ↔ 32R routing at network-stream level.

Given your AVB/Milan work, this is where your own `libmedia-network-standards`, AVDECC discovery, or Milan entity inspection could later become a parallel MCP resource provider.

---

# Soundcheck-assistance requirements

The agent should help with **diagnosis and procedure**, not perform live mixing.

## Safe during soundcheck

Allow the agent to answer:

```text
"Which channels are silent?"
"Which vocal mic is clipping?"
"Which expected rider inputs are missing?"
"Which channels are muted unexpectedly?"
"Is the lead vocal routed to the right monitor aux?"
"Which channels look swapped?"
"Does the scene match the input list?"
```

## Avoid during soundcheck

Do not let the agent autonomously:

```text
move faders
change preamp gain
recall scenes
alter monitor sends
mute/unmute channels without confirmation
enable phantom power
change routing
```

## Meter summaries

Expose metering as summaries, not raw live streams:

```ts
type MeterSummary = {
  windowSec: number;
  silentChannels: string[];
  activeChannels: string[];
  clippingChannels: string[];
  hotChannels: string[];
  noSignalButExpected: string[];
  signalButUnexpected: string[];
};
```

The PreSonus API documentation notes that fader-position packets are also used for metering and reporting signal levels, so a summary layer is the right abstraction for AI context. ([featherbear.cc][1])

---

# Control policy for your stated use case

Since you explicitly said **“help during soundcheck but don’t do actual live mixing”**, I would define three modes.

## Mode 1 — `prepare`

Used at home or before the show.

```text
Read all configured/discovered mixers
Analyze riders
Generate patch plan
Generate scene checklist
Generate proposed changes
No direct mixer write required
```

## Mode 2 — `soundcheck_assist`

Used during setup and soundcheck.

```text
Read current state
Read meter summaries
Detect missing/silent/clipping/misnamed channels
Validate routing
Suggest actions
Require human execution
```

## Mode 3 — `control_locked`

Used during the actual show.

```text
Read-only
No fader tools
No mute tools
No scene recall
No routing changes
No phantom changes
```

Suggested config:

```yaml
operationMode: soundcheck_assist

control:
  defaultWriteAccess: false
  allowDuringShow: false
  allowSceneRecall: false
  allowFaderMoves: false
  allowMuteChanges: false
  allowRoutingChanges: false
  allowPhantomChanges: false

fohLock:
  requiredRole: "FOH"
  requiredAlias: "FOH-32SC"
  requiredSerial: "..."
```

---

# Change-set model instead of direct control

For your use case, the agent should produce **proposed change sets**, not directly execute operations.

```ts
type ProposedChangeSet = {
  id: string;
  targetDeviceId: string;
  targetAlias: string;
  targetSerial?: string;
  purpose: "show-prep" | "soundcheck-fix" | "routing-fix";
  changes: ProposedMixerChange[];
  risk: "low" | "medium" | "high";
  requiresConfirmation: true;
};

type ProposedMixerChange = {
  kind:
    | "rename-channel"
    | "set-channel-color"
    | "set-mute"
    | "set-fader"
    | "set-routing"
    | "recall-scene"
    | "set-phantom";
  target: string;
  currentValue?: unknown;
  proposedValue: unknown;
  reason: string;
  risk: "low" | "medium" | "high";
};
```

Example:

```json
{
  "purpose": "soundcheck-fix",
  "targetAlias": "FOH-32SC",
  "changes": [
    {
      "kind": "rename-channel",
      "target": "LINE 1",
      "currentValue": "Ch 1",
      "proposedValue": "Kick",
      "reason": "Matches rider input 1",
      "risk": "low"
    },
    {
      "kind": "set-mute",
      "target": "LINE 8",
      "currentValue": true,
      "proposedValue": false,
      "reason": "Lead vocal expected active during soundcheck but channel is muted",
      "risk": "medium"
    }
  ]
}
```

Then execution is a separate tool:

```text
apply_change_set(changeSetId, confirmationToken)
```

For now, you can simply omit `apply_change_set`.

---

# Updated unanswered questions

These are now the key questions to resolve before implementation.

## Mixer topology

| Question                                                                         | Why it matters                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Is the 32R normally an AVB stagebox for the 32SC?                                | Determines routing model.                                    |
| Is the 32R independently mixed, or controlled as part of FOH?                    | Determines whether it is read-only or part of the FOH graph. |
| Do you use fixed IPs for mixer devices?                                          | Simplifies fallback and safety checks.                       |
| Are mixers on a dedicated VLAN?                                                  | Discovery/routing validation depends on this.                |
| Should unknown discovered mixers be hidden, read-only, or visible with warnings? | Prevents wrong-device operation.                             |

## Show preparation

| Question                                                                       | Why it matters                            |
| ------------------------------------------------------------------------------ | ----------------------------------------- |
| Will riders be PDF, text, images, Excel, or all of these?                      | Determines ingestion pipeline.            |
| Should the system merge multiple band riders into one master patch plan?       | Important for festivals/multi-band shows. |
| Should the MCP server store show projects persistently?                        | Needed for recall and comparison.         |
| Should it generate PreSonus scene changes or only human-readable instructions? | Determines tool risk.                     |
| Should it produce print-ready input lists and stage plots?                     | Useful for FOH workflow.                  |

## Soundcheck

| Question                                             | Why it matters                                         |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Should the agent monitor expected-but-silent inputs? | Useful and safe.                                       |
| Should it detect clipping/hot channels?              | Useful and safe.                                       |
| Should it detect possible channel swaps?             | Requires correlation between rider and meter activity. |
| Should it advise monitor-send checks?                | Useful, but control should remain manual.              |
| Should it ever unmute a channel?                     | I would default to no.                                 |

## Control boundary

| Operation            | Recommended default                  |
| -------------------- | ------------------------------------ |
| Read mixer state     | Allow                                |
| Read meters          | Allow                                |
| Read scenes/projects | Allow                                |
| Rename channels      | Dry-run only initially               |
| Change colors        | Optional low-risk                    |
| Mute/unmute          | Suggest only                         |
| Fader moves          | Suggest only                         |
| Monitor sends        | Suggest only                         |
| Phantom power        | Suggest only / confirmation required |
| Routing changes      | Suggest only                         |
| Scene recall         | Disabled                             |
| Project recall       | Disabled                             |

---

# Practical MVP definition

## MVP 1: read-only multi-mixer context

Implement:

```text
discover_mixers
list_mixers
connect_mixer_readonly
get_mixer_overview
get_channel_state
get_scene_summary
get_meter_summary
```

Resources:

```text
presonus://mixers
presonus://mixer/{id}/overview
presonus://mixer/{id}/channels
presonus://mixer/{id}/meters/summary
```

## MVP 2: rider-aware preparation

Add:

```text
import_rider
extract_input_list
merge_riders
generate_patch_plan
compare_patch_plan_to_mixer
generate_soundcheck_checklist
```

Resources:

```text
presonus://show/{showId}/riders
presonus://show/{showId}/input-list
presonus://show/{showId}/patch-plan
presonus://show/{showId}/soundcheck-checklist
```

## MVP 3: routing validation

Add:

```text
validate_expected_inputs
validate_channel_names
validate_stagebox_presence
validate_foh_target
validate_routing_graph
```

Resources:

```text
presonus://show/{showId}/routing-validation
presonus://mixer-graph/current
```

## MVP 4: controlled proposals

Add only proposal generation, not execution:

```text
prepare_scene_change_set
prepare_channel_rename_set
prepare_soundcheck_fix_set
```

No direct live-control tools yet.

---

# Core architecture

```text
MCP Server
│
├── Discovery Service
│   ├── auto-discovery
│   ├── fallback IP config
│   └── stable identity registry
│
├── PreSonus Adapter
│   ├── featherbear API client per mixer
│   ├── state cache
│   ├── meter summarizer
│   └── reconnect handling
│
├── Mixer Graph Model
│   ├── devices
│   ├── roles
│   ├── routes
│   ├── channels
│   └── expected vs actual state
│
├── Show Model
│   ├── riders
│   ├── input lists
│   ├── patch plans
│   ├── scene notes
│   └── soundcheck checklist
│
├── MCP Resources
│   ├── mixer state
│   ├── routing validation
│   ├── show prep data
│   └── meter summaries
│
└── MCP Tools
    ├── discovery
    ├── analysis
    ├── validation
    └── proposed change generation
```

## Most important rule

```text
Agents may inspect many mixers.
Agents may reason about the whole mixer graph.
Agents may propose changes.
Agents may not directly live-mix.
Agents may only operate the explicitly locked FOH mixer, and only if write mode is deliberately enabled.
```

[1]: https://featherbear.cc/presonus-studiolive-api/ "API Documentation"
[2]: https://modelcontextprotocol.io/specification/2025-06-18/server/resources "Resources - Model Context Protocol"
[3]: https://modelcontextprotocol.io/specification/draft/server/tools "Tools - Model Context Protocol"
