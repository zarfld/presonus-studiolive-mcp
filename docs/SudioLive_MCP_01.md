## Core framing

For your use case, the MCP server should **not primarily be a remote-control API**. It should be a **mixer-state/context provider** with a deliberately limited, permission-gated control surface.

MCP has three relevant server primitives: **Resources** for context/data, **Tools** for executable actions, and **Prompts** for reusable workflows. That maps well to StudioLive: current scene, channel names, mute states, routing, Fat Channel settings and metering summaries should be **resources**; muting, fader moves, scene recall, etc. should be **tools**; workflows like “analyze FOH gain structure” or “prepare monitor feedback checklist” should be **prompts**. ([Model Context Protocol][1])

The `featherbear/presonus-studiolive-api` package is a good starting point because it already provides discovery, connection, events, state access, metering, mute/solo/fader/pan operations, project/scene listing and recall. It is unofficial, TypeScript/Node-based, and has been tested with StudioLive 16, 16R, 24R and 32SC, which includes your 32SC class of mixer. ([featherbear.cc][2])

---

# Critical requirements

## 1. Strict separation: **observe vs control**

### Read/context operations should be default-safe

Expose these as MCP **resources**:

```text
presonus://devices
presonus://device/{deviceId}/overview
presonus://device/{deviceId}/channels
presonus://device/{deviceId}/channel/{type}/{number}
presonus://device/{deviceId}/mixes
presonus://device/{deviceId}/scene/current
presonus://device/{deviceId}/meters/summary
presonus://device/{deviceId}/health
```

These should be safe to auto-read because they only describe the mixer.

### Control operations must be gated

Expose these as MCP **tools**, but mark them clearly as mutating:

```text
mixer_set_mute
mixer_set_fader
mixer_set_pan
mixer_set_solo
mixer_recall_scene
mixer_recall_project
mixer_set_channel_color
mixer_link_channels
```

MCP tools are model-controlled, meaning the model can discover and invoke them automatically; the MCP spec therefore recommends a human-in-the-loop with clear UI, visible tool invocation, and confirmation for operations. For mixer control this is not optional in practice, because a bad tool call can mute FOH, recall the wrong scene, change monitor levels, or trigger feedback. ([Model Context Protocol][3])

**Requirement:** start with **read-only mode**. Add write tools later behind explicit configuration.

---

## 2. Stable mixer identity and device discovery

The PreSonus API supports device discovery and returns fields like name, serial, IP, port and timestamp. StudioLive control uses TCP port `53000`; metering is UDP; discovery packets are broadcast periodically. ([featherbear.cc][2])

You need a device model like:

```ts
type MixerDevice = {
  id: string;              // stable internal ID
  serial?: string;
  name: string;
  model: string;
  host: string;
  port: number;            // normally 53000
  lastSeen: string;
  connected: boolean;
  firmware?: string;
};
```

**Critical questions:**

| Question                                                      | Why it matters                                     |
| ------------------------------------------------------------- | -------------------------------------------------- |
| Will the server auto-discover mixers, or use a configured IP? | Broadcast discovery may fail across VLANs/subnets. |
| Can multiple mixers be present?                               | You have 32SC + 32R use cases.                     |
| What is the stable identity: serial, IP, or configured alias? | IP can change; serial is better if available.      |
| Should agents see all mixers or only the active FOH mixer?    | Avoid accidental control of the wrong device.      |

---

## 3. State cache is mandatory

Do **not** query the mixer synchronously for every AI request. Keep a local state cache that is updated from PreSonus events.

The featherbear API exposes data events, lifecycle events, a `state.get(key)` API, and a cached internal device state; it also receives compressed ZLIB state when connecting. ([featherbear.cc][2])

### Required state layers

```text
Raw device state
  ↓
Normalized mixer model
  ↓
AI-safe summaries
  ↓
MCP resources
```

### Example normalized model

```ts
type ChannelState = {
  id: string;              // line.ch1
  type: "LINE" | "AUX" | "FX" | "SUB" | "MAIN" | "RETURN" | "FXRETURN" | "TALKBACK";
  number: number;
  name?: string;
  mute?: boolean;
  solo?: boolean;
  faderDb?: number;
  pan?: number;
  linked?: boolean;
  color?: string;
  inputMeterDb?: number;
  gainStructureHint?: "no-signal" | "low" | "ok" | "hot" | "clipping";
};
```

**Requirement:** AI agents should mostly consume **normalized, bounded, semantic state**, not the raw `zlib.parsed` key/value tree.

---

## 4. Metering must be summarized, not streamed raw into context

The PreSonus API can subscribe to metering events via `client.meterSubscribe()` and listens for `meter` events; metering is UDP-based. ([featherbear.cc][2])

Raw meter data is high-rate and context-expensive. For agents, expose summaries:

```text
meters.current
meters.peak_1s
meters.peak_10s
meters.rms_10s
meters.clip_events_since
meters.silent_channels
meters.hot_channels
meters.feedback_risk_candidates
```

### Critical metering questions

| Question                              | Recommendation                                          |
| ------------------------------------- | ------------------------------------------------------- |
| Should agents get live meter streams? | No, not via normal context. Use summaries.              |
| What window sizes?                    | 1s, 10s, 60s are useful.                                |
| Should clipping be latched?           | Yes. Agents need event history, not only current level. |
| Should meters be converted to dB?     | Yes. Avoid opaque linear values.                        |
| Should meter data be persisted?       | Short ring buffer only, unless doing show logging.      |

---

## 5. Tool safety policy

The dangerous operations are not equal. Classify tools by risk.

| Risk class        | Operations                                             | Default                                |
| ----------------- | ------------------------------------------------------ | -------------------------------------- |
| Safe read         | discover devices, read state, read meters, list scenes | Enabled                                |
| Low-risk write    | set channel color, rename local alias                  | Optional                               |
| Medium-risk write | mute/unmute, fader move, pan                           | Confirmation required                  |
| High-risk write   | solo, scene recall, project recall, link/unlink        | Disabled unless explicitly enabled     |
| Show-critical     | main fader, monitor sends, talkback, global mute       | Require stronger confirmation or block |

The featherbear API includes mutating operations such as mute/unmute/toggle mute, solo, fader level, pan, channel color, stereo linking, and project/scene recall. ([featherbear.cc][2])

**Requirement:** every write tool needs:

```ts
{
  dryRun: boolean;
  reason: string;
  requireConfirmation: boolean;
  maxDeltaDb?: number;
  targetLock?: string;
}
```

For example: block fader jumps greater than 6 dB unless explicitly overridden.

---

## 6. Explicit handles, not implicit sessions

MCP states that servers should not rely on implicit per-connection session state for tool calls; if state is needed across calls, return explicit handles and validate authorization against them each time. ([Model Context Protocol][3])

For your server:

```text
discover_mixers → returns device_id
connect_mixer(device_id) → returns connection_handle
read_channel(connection_handle, selector)
set_mute(connection_handle, selector, state)
```

This prevents the model from assuming “the mixer” when multiple devices exist.

---

## 7. Authorization and local network boundaries

MCP authorization is optional but recommended when the server exposes sensitive data, administrative actions, auditing, user consent, or enterprise-style access control. ([Model Context Protocol][4])

For a local StudioLive MCP server, you can initially use:

```text
Local-only STDIO MCP server
Config file allowlist
Read-only by default
No remote HTTP binding
No public network exposure
```

Later, for a remote HTTP/SSE or streamable HTTP MCP server:

```text
OAuth / token auth
TLS
per-user permissions
audit log
tool allowlist
IP allowlist
rate limits
```

**Requirement:** do not expose a write-capable mixer MCP server on an untrusted network.

---

## 8. Audit logging

Every mutating action should be logged:

```json
{
  "timestamp": "2026-06-24T12:00:00+02:00",
  "agent": "claude-desktop",
  "tool": "mixer_set_fader",
  "device": "StudioLive 32SC",
  "target": "LINE 1",
  "before": -12.0,
  "after": -9.0,
  "reason": "Raise lead vocal slightly",
  "confirmedByUser": true
}
```

For a live mixer, audit logs are not bureaucracy. They are your undo/debug trail.

---

## 9. Scene/project recall must be treated as destructive

The API exposes project and scene listing plus recall operations. ([featherbear.cc][2])

For MCP, scene recall should require:

```text
1. Current project/scene readback
2. Target project/scene exact match
3. Dry-run summary
4. Explicit confirmation
5. Optional snapshot/export before recall
```

**Default:** expose scene/project listing as resources, but keep recall tools disabled until your state model and confirmation path are solid.

---

## 10. Conflict handling with UC Surface / hardware operation

The StudioLive can also be controlled by UC Surface or other remote clients. PreSonus documents Series III mixers as LAN-controllable using UC Surface/QMix-UC. ([PreSonus][5])

Critical questions:

| Question                                                         | Why it matters                               |
| ---------------------------------------------------------------- | -------------------------------------------- |
| What happens if UC Surface changes a fader while the agent acts? | Need state freshness and conflict detection. |
| Can multiple API clients connect at once safely?                 | Must be tested.                              |
| Should MCP tools refuse stale state?                             | Yes. Use `stateVersion` / timestamp.         |
| Should write tools require “expected before value”?              | Yes for safety-critical changes.             |

Example safer tool call:

```json
{
  "selector": { "type": "LINE", "channel": 1 },
  "targetDb": -8,
  "expectedCurrentDb": -10,
  "maxAllowedDeltaDb": 3
}
```

---

# Key design questions to answer before coding

## Product/use-case questions

1. **Read-only assistant or active control agent?**
2. Should it support **live show operation**, **offline scene analysis**, or both?
3. Which mixer is primary: **32SC**, **32R**, or both?
4. Should the AI see **all channels**, or only a filtered FOH-relevant view?
5. Do you want agents to answer questions like “why is there no vocal?” from meters + mute + routing?
6. Should the server be usable during a show, or only during prep/soundcheck?
7. Should it integrate with your existing show workflow for PreSonus 32SC?

## Mixer model questions

8. What canonical channel naming scheme will you use?
9. How do you represent Aux mixes, FX returns, subgroups and mains?
10. Do you need Fat Channel parameters exposed in detail?
11. Do you need routing/patching state?
12. Do you need AVB stream/routing context, or only mixer control state?
13. Should meter data be mapped to semantic states: silent, low, good, hot, clipping?
14. Should linked stereo channels appear as one logical channel?

## MCP interface questions

15. Which things are **resources**?
16. Which things are **tools**?
17. Which tools are disabled by default?
18. Which prompts are useful? Examples:

    * `analyze_gain_structure`
    * `find_muted_important_channels`
    * `prepare_soundcheck_checklist`
    * `detect_feedback_risk`
    * `summarize_current_scene`
19. Do you need resource subscriptions for changed mixer state?
20. Should clients receive raw JSON or human-readable summaries?

## Safety questions

21. Is write access globally disabled during live shows?
22. Which channels are protected? Main L/R, lead vocal, monitor sends?
23. Maximum fader delta per tool call?
24. Should mute/unmute always require confirmation?
25. Should solo be blocked completely?
26. Should scene recall require physical/local confirmation?
27. What is the emergency stop behavior?
28. Should the server automatically disconnect write tools if network jitter/reconnect occurs?

## Implementation questions

29. TypeScript MCP server directly, or C# wrapper around a Node bridge?
30. STDIO local server first, or HTTP server?
31. How is config stored?
32. How are device aliases persisted?
33. How are logs stored?
34. How is state replay/test simulation done without the mixer connected?
35. How do you regression-test against recorded mixer packets/state dumps?
36. How do you handle reconnects and stale handles?
37. How do you cap metering CPU/network/context cost?

---

# Suggested MVP

## Phase 1 — read-only context server

Implement only:

```text
discover_mixers
connect_mixer
get_mixer_overview
get_channel_list
get_channel_state
get_current_scene
get_meter_summary
```

Expose:

```text
presonus://devices
presonus://device/{id}/overview
presonus://device/{id}/channels
presonus://device/{id}/scene/current
presonus://device/{id}/meters/summary
```

No fader, mute, solo, scene recall.

## Phase 2 — low-risk tools

Add:

```text
mixer_set_channel_color
mixer_get_projects
mixer_get_scenes
mixer_dry_run_action
```

Still no actual destructive actions.

## Phase 3 — controlled write access

Add:

```text
mixer_set_mute
mixer_set_fader
mixer_set_pan
```

With:

```text
confirmation required
max delta limits
audit logging
expected-before-state checks
device allowlist
```

## Phase 4 — dangerous operations

Only after testing:

```text
mixer_set_solo
mixer_recall_scene
mixer_recall_project
mixer_link_channels
```

These should remain disabled by default.

---

# Most critical architectural decision

Use this boundary:

```text
PreSonus API adapter
  → raw state cache
  → normalized mixer domain model
  → AI-safe context/resources
  → carefully gated tools
  → audit log
```

Do **not** expose the featherbear API one-to-one as MCP tools. That would give the agent too much unstructured power over a live audio system.

[1]: https://modelcontextprotocol.io/specification/2025-11-25 "Specification - Model Context Protocol"
[2]: https://featherbear.cc/presonus-studiolive-api/ "API Documentation"
[3]: https://modelcontextprotocol.io/specification/draft/server/tools "Tools - Model Context Protocol"
[4]: https://modelcontextprotocol.io/docs/tutorials/security/authorization "Understanding Authorization in MCP - Model Context Protocol"
[5]: https://www.presonus.com/blogs/technical/how-to-network-studiolive-digital-mixers-for-remote-control?srsltid=AfmBOooU46pJ3Tq12MCK_zL5stxrP89EHxqQEGZDbUmmh3j68y6-6n2f&utm_source=chatgpt.com "How to Network StudioLive Digital Mixers for Remote Control"
