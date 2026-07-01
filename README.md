# presonus-studiolive-mcp

An **MCP (Model Context Protocol) server** that connects AI coding agents and assistants to **PreSonus StudioLive III** series mixers over the local network.

Exposes live mixer context — channel names, mute/solo/fader state, Fat Channel compressor/EQ models, meter activity, and scene information — as MCP resources and tools so that AI agents can read, reason about, and assist with live sound engineering without touching hardware autonomously.

> **Current status**: Experimental read-mostly backend (`v0.1.0`). Primary empirical inspection on **StudioLive 32SC firmware 3.3.0.109659**. Other StudioLive III models are expected-compatible but require additional HIL testing. Some routing and Fat Channel parameter values are confidence-tagged as `inferred` or `probe_required`. Write tools are gated and experimental.
>
> See [docs/capability-matrix.generated.md](docs/capability-matrix.generated.md) for the current generated MCP tool/resource inventory.

---

## Contents

- [What this does](#what-this-does)
- [Hardware requirements](#hardware-requirements)
- [Quick start](#quick-start)
- [Packages](#packages)
- [MCP server — tools and resources](#mcp-server--tools-and-resources)
- [Probe CLI](#probe-cli)
- [Fat Channel skill](#fat-channel-skill)
- [Development](#development)
- [Architecture](#architecture)

---

## What this does

The MCP server gives an AI agent these capabilities:

| Capability | How |
|---|---|
| Discover mixers on the network | `discover_mixers` tool |
| Verify FOH vs. stagebox identity | `validate_mixer_identity` tool |
| Refresh state cache on demand | `refresh_mixer_state` tool |
| Read channel names, mute, solo, fader, pan, color, Fat Channel models | `presonus://mixer/{id}/channels` resource |
| Read per-channel Fat Channel DSP state (EQ, comp, gate, limiter) | `get_fat_channel` tool / `presonus://mixer/{id}/fat-channel/{id}` resource |
| Validate Fat Channel settings for a source type | `validate_fat_channel_for_source` tool |
| Know mixer capacity (inputs, aux mixes, FX buses, stagebox) | `get_mixer_capabilities` tool |
| Validate rider capacity requirements | `check_required_setup` tool |
| Validate expected channel names, phantom, mute | `validate_channel_setup` tool |
| Validate an agent-provided input list against the mixer | `validate_input_list_against_mixer` tool |
| Validate a patch sheet for conflicts and range issues | `validate_patch_sheet` tool |
| Render a structured patch sheet for human printing | `render_patch_sheet_data` tool |
| Monitor signal activity (silent / active / hot / clipping) | `presonus://mixer/{id}/meters/summary` resource |
| Know which project and scene are loaded | `presonus://mixer/{id}/scene/current` resource |
| Diagnose a single channel (mute, fader, gate, signal) | `diagnose_channel` tool |
| Run a line-check step and observe meter results | `analyze_line_check_step` tool |
| Detect possible patch swaps during line check | `detect_possible_patch_swap` tool |
| Diagnose no-signal routing causes | `diagnose_no_signal_routing` tool |
| Inspect observable routing (AUX/FX/sub/main sends) | `get_routing_graph` tool / `presonus://mixer/{id}/routing` resource |
| Validate input routing (Layer A: name, meter, mute) | `validate_input_routing` tool |
| Validate stagebox connection | `validate_stagebox_routing` tool |
| Inspect output patch router (source index) | `presonus://mixer/{id}/routing/outputs` resource |
| Inspect AUX mixes (master, sends, levels) | `get_aux_mix` tool / `presonus://mixer/{id}/auxes` resource |
| Validate monitor send requirements | `validate_monitor_requirements` tool |
| Find missing / muted / hot monitor sends | `find_missing_monitor_sends`, `find_muted_monitor_sends`, `find_hot_monitor_sends` tools |
| Full aux mix audit | `validate_aux_mix` tool |
| Inspect FX send routing | `presonus://mixer/{id}/fx-sends` resource |
| Inspect flat channel-to-aux routing graph | `presonus://mixer/{id}/monitor-routing` resource |
| Raw diagnostic state dump | `presonus://mixer/{id}/raw/state` resource |
| Propose and apply an EQ change (write-enabled only) | `propose_eq_change` + `apply_change_set` tools |

By default agents **cannot** change mixer parameters. Write tools require `writeEnabled: true` and use a ProposedChangeSet workflow with 60 s TTL and operator confirmation — see ADR-006. All write tool responses include a `changeSetConfidence` field (`observed` / `inferred` / `guessed`) indicating how well-calibrated the proposed values are.

---

## Hardware requirements

| Requirement | Details |
|---|---|
| Mixer | PreSonus StudioLive III series (16, 16R, 24R, 32SC, 32R) |
| Network | Mixer and MCP server host on the **same LAN segment** |
| Protocol | TCP port **53000** (UC Surface / Studio One Remote protocol) |
| Coexistence | UC Surface, QMix-UC, and this server can connect simultaneously |
| Internet | Not required |

### Hardware validation status

| Model | Status |
|---|---|
| StudioLive 32SC firmware 3.3.0.109659 | Empirically inspected — state capture validated, routing and Fat Channel partially probed |
| StudioLive 32R | Expected-compatible (same protocol); requires HIL testing to confirm |
| StudioLive 24R | Expected-compatible; requires HIL testing to confirm |
| StudioLive 16R | Expected-compatible; requires HIL testing to confirm |
| StudioLive 16 | Expected-compatible; requires HIL testing to confirm |

See [docs/release-readiness-checklist.md](docs/release-readiness-checklist.md) for gates required before any model is claimed as "field-ready" or "fully supported".

---

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install and build

```bash
git clone https://github.com/zarfld/presonus-studiolive-mcp.git
cd presonus-studiolive-mcp
pnpm install          # installs all workspace packages + applies featherbear patch
pnpm build            # compiles all 4 packages
```

### Run the MCP server (stdio transport)

```bash
pnpm mcp:server
```

Or without a prior build, using `tsx`:

```bash
pnpm mcp:server:dev
```

The server logs to `stderr`, connects to discovered mixers on startup, and accepts MCP requests on `stdin`/`stdout`.

### Connect from Claude Desktop / VS Code

Add to your MCP client config:

```json
{
  "mcpServers": {
    "presonus-studiolive": {
      "command": "node",
      "args": ["<absolute-path>/packages/presonus-mcp-server/dist/index.js"]
    }
  }
}
```

### Probe the hardware first (optional but recommended)

```bash
pnpm probe:dev discover             # find mixers on your LAN
pnpm probe:dev dump-state -d <ip>   # dump full state tree to captures/
pnpm probe:dev probe-fat-channel -d <ip> -c LINE:1   # inspect Fat Channel state for ch1
```

---

## Packages

This is a pnpm monorepo with four packages under `packages/`. Dependencies flow one way: `domain` ← `adapter` ← `inspector` | `server`.

### `@presonus-mcp/domain`

Pure TypeScript/Zod schema library — the single source of truth for all data contracts.

- `MixerIdentitySchema` — deviceId, serial, IP, port, role, controllable
- `MixerChannelSchema` — name, mute, solo, fader (dB/linear/raw), pan, color, `compModelName`, `eqModelName`
- `MeterSummarySchema` — time-windowed channel activity classification
- `FatCompressorStateSchema` / `FatEqStateSchema` — discriminated unions per model
- `COMPRESSOR_MODEL_BY_CLASSID` / `EQ_MODEL_BY_CLASSID` — full GUID → model name maps for scene file decoding
- `decodeCompressorModel(value)` / `decodeEqModel(value)` — live state float → model name helpers

No runtime dependency on featherbear or the MCP SDK.

### `@presonus-mcp/adapter`

Hardware adapter wrapping `@featherbear/presonus-studiolive-api`. Manages connections, state, and meters.

- `discoverMixers({ timeoutMs? })` — UDP broadcast discovery
- `PresonusClientManager` — connects/disconnects clients; provides `getSnapshot()`, `getIdentity()`, `getSummarizer()`
- `flattenFeatherbearState()` — converts featherbear's nested `_data.internal.children.*` tree to flat dot-notation keys
- `PresonusMeterSummarizer` — ring-buffer of raw uint16 meter packets → time-windowed `MeterSummary`
- `mapRawStateToSnapshot()` — translates flat state keys to normalized `MixerSnapshot`

The featherbear dependency is patched (`patches/@featherbear__presonus-studiolive-api@1.8.0.patch`) to add UBJSON `I` (int16) and `D` (float64) type support missing from the original.

### `@presonus-mcp/inspector`

Probe CLI binary (`presonus-probe`) for hardware reconnaissance during development. See [Probe CLI](#probe-cli).

### `@presonus-mcp/server`

MCP server that wires the adapter to the MCP SDK over stdio transport. Registers resources and tools at startup (write tools registered only when `writeEnabled: true`). Runs background mixer discovery.

See [docs/capability-matrix.generated.md](docs/capability-matrix.generated.md) for the current generated tool and resource inventory.

---

## MCP server — tools and resources

### Tools

The current tool and resource inventory is generated from source — see **[docs/capability-matrix.generated.md](docs/capability-matrix.generated.md)**.

Write tools are registered only when `writeEnabled: true` (default: false). All write tools use the ProposedChangeSet workflow (propose → 60 s TTL → apply) and include a `changeSetConfidence` field so operators know how well-calibrated the proposed values are.

| Group | Tools |
|---|---|
| Discovery / identity | `discover_mixers`, `refresh_mixer_state`, `validate_mixer_identity` |
| Capabilities | `get_mixer_capabilities`, `check_required_setup` |
| Channel setup | `validate_channel_setup`, `diagnose_channel` |
| Input list / patch sheet | `validate_input_list_against_mixer`, `validate_patch_sheet`, `render_patch_sheet_data` |
| Fat Channel inspection | `get_fat_channel`, `validate_fat_channel_for_source` |
| Line check | `analyze_line_check_step`, `detect_possible_patch_swap` |
| Routing | `get_routing_graph`, `validate_input_routing`, `validate_stagebox_routing`, `diagnose_no_signal_routing`, `get_input_routing`\*, `validate_avb_routing`\*, `validate_output_routing`† |
| Monitor / aux | `get_aux_mix`, `validate_monitor_requirements`, `find_missing_monitor_sends`, `find_muted_monitor_sends`, `find_hot_monitor_sends`, `validate_aux_mix` |
| Write (gated) | `propose_eq_change`, `apply_change_set` |

\* Layer B stub — returns `not_verifiable_with_current_adapter` with probe instructions.  
† Layer B partial — source index known; source name requires probe.

#### `discover_mixers`

Trigger UDP discovery of StudioLive III mixers on the local network.

```typescript
{ timeoutMs?: number }    // discovery window in ms; default 5000
// → [{ deviceId, serial, model, firmware, role, ipAddress, port }]
```

#### `validate_mixer_identity`

Verify a connected mixer matches expected serial and/or role before proceeding.

```typescript
{ deviceId: string, expectedSerial?: string, expectedRole?: "FOH"|"STAGEBOX"|"MONITOR"|"UNKNOWN" }
// → { valid: boolean, reasons: string[] }
```

#### `validate_input_list_against_mixer`

Validate an agent-provided input list against actual mixer state. Returns name mismatches, phantom mismatches, mute issues, and printable patch rows.

```typescript
{
  deviceId: string,
  inputList: [{ inputNo: number, sourceName: string, phantomRequired: boolean, micPreference?: string, notes?: string }]
}
// → { status: "ok"|"warning"|"error", issues[], printablePatchRows[] }
```

#### `get_fat_channel`

Return the Fat Channel DSP state (EQ, compressor, gate, limiter, HPF) for a single channel.

```typescript
{ deviceId: string, channelId: string }   // channelId e.g. "line.ch1"
// → ChannelFatState (eqModel, compModel, eqBands, comp, gate, limiter, hpfFrequencyHz)
```

#### `validate_fat_channel_for_source`

Check Fat Channel settings against source-type expectations (HPF engaged, gate enabled, comp enabled, limiter enabled).

```typescript
{ deviceId: string, channelId: string, sourceType: "vocal"|"kick"|"snare"|"bass"|... }
// → { checks: [{ check, passed, detail }], warnings: string[], parameterConfidence }
```

---

### Resources

#### `presonus://mixers`

All connected mixer identities.

#### `presonus://mixer/{deviceId}/channels`

Normalized channel list. Each channel includes:

```typescript
{
  id:             string,       // "line.ch1", "aux.ch3", "sub.ch1", …
  selector:       { type, channel },
  name?:          string,       // label from mixer (e.g. "Kick In")
  mute?:          boolean,
  solo?:          boolean,
  fader?:         { db: number|null, linear: number|null },
  pan?:           number,       // 0.0 left … 0.5 center … 1.0 right
  linked?:        boolean,
  color?:         string,       // RGBA hex

  // Fat Channel — decoded from live opt.compmodel / opt.eqmodel
  compModelName?: string,       // e.g. "FET", "BRIT_COMP", "FC_670"
  eqModelName?:   string        // e.g. "STANDARD", "ALPINE_EQ_550", "SOLAR_69_EQ"
}
```

#### `presonus://mixer/{deviceId}/meters/summary`

Time-windowed meter classification (last 10 seconds):

```typescript
{
  windowSec:            number,
  computedAt:           string,       // ISO 8601
  silentChannels:       string[],     // channel ids with no signal
  activeChannels:       string[],     // signal in normal range
  hotChannels:          string[],     // approaching clip
  clippingChannels:     string[],     // at or above clip threshold
  noSignalButExpected:  string[],
  signalButUnexpected:  string[]
}
```

#### `presonus://mixer/{deviceId}/scene/current`

```typescript
{
  currentProject:    string | null,
  currentScene:      string | null,
  availableProjects: string[]
}
```

#### `presonus://mixer/{deviceId}/routing`

Per-channel AUX/FX/subgroup/main-LR send routing. `parameterConfidence: 'inferred'` until AUX fader de-normalization is probe-confirmed.

#### `presonus://mixer/{deviceId}/routing/outputs`

Output patch router — source index known for each analog/AVB output; `sourceName: null` until probe confirms source → index mapping.

#### `presonus://mixer/{deviceId}/auxes`

All aux mixes: master level/mute + per-channel send levels. `prePost: 'unknown'` until hardware probing confirms.

#### `presonus://mixer/{deviceId}/fx-sends`

Per-channel FX bus send state.

#### `presonus://mixer/{deviceId}/monitor-routing`

Flattened channel-to-aux routing graph for monitor mix planning.

#### `presonus://mixer/{deviceId}/fat-channel/{channelId}`

Fat Channel DSP state for a single channel (EQ, compressor, gate, limiter, HPF, model names). Use `get_fat_channel` tool instead when querying programmatically.

#### `presonus://mixer/{deviceId}/raw/state`

Full raw state dump (pre-normalized flat dot-notation). For diagnostics and development only — do not use for agent reasoning logic.

> **Layer A / Layer B routing model**: Layer A resources and tools return data directly observable from confirmed state keys. Layer B tools (`get_input_routing`, `validate_avb_routing`) return `not_verifiable_with_current_adapter` and include probe instructions — physical cable routing and AVB stream assignments cannot be verified by software alone.

---

## Probe CLI

`presonus-probe` is the hardware reconnaissance tool used during development. Run via `pnpm probe:dev <command>`.

| Command | Purpose |
|---|---|
| `discover` | Find all StudioLive III mixers on the LAN; print serial/model/IP/role |
| `dump-state -d <ip>` | Connect and dump full flat state tree as JSON to `captures/` |
| `watch-events -d <ip>` | Stream all featherbear data events as NDJSON |
| `watch-meters -d <ip>` | Capture raw meter stream as NDJSON |
| `diff-state --before <f> --after <f>` | Compare two state dumps; identify changed keys (workflow: change one control → dump-state → diff → name the key) |
| `probe-fat-channel -d <ip> -c <TYPE:N>` | Dump all Fat Channel state keys for a channel (e.g. `LINE:1`) |
| `read-scene -d <ip>` | List projects and scenes stored on the mixer |

> **Note**: Scene file content (`__classid` GUIDs) is not accessible over the network API — it returns 0 bytes. Fat Channel model identity must be read from live state via `opt.compmodel.value` / `opt.eqmodel.value`.

---

## Fat Channel skill

A VS Code / Copilot skill is included at `.github/Skills/PresonusFatChannelSelection/SKILL.md`.

It gives AI agents:
- Character, hardware archetype, best-use, and avoid-when for all **11 compressor models** (STANDARD, TUBE, FET, BRIT_COMP, CLASSIC_COMPRESSOR, COMP_160, EVEREST_C100A, FC_670, RC_500_COMPRESSOR, TUBE_CB, VT_1_COMPRESSOR)
- Character and use-case guidance for all **10 EQ models** (STANDARD, PASSIVE, VINTAGE, ALPINE_EQ_550, BAXANDALL_EQ, RC_500_EQ, SOLAR_69_EQ, TUBE_EQ, VINTAGE_3_BAND_EQ, VT_1_EQ)
- Quick-reference selector tables (source instrument → recommended model)
- Decision framework for choosing between transparency, punch, warmth, and bus treatment
- Full `__classid` GUID reference for all models (from `classID_Mapping.md`, empirically confirmed on 32SC firmware 3.3.0.109659)
- Exact MCP resource/tool schemas and accepted property lists per model

---

## Development

### Commands

```bash
pnpm install          # install + apply featherbear patch
pnpm build            # compile all packages
pnpm build:watch      # watch mode
pnpm clean            # remove all dist/ and tsbuildinfo

pnpm test             # unit tests (no hardware needed)
pnpm test:watch       # watch mode
pnpm test:coverage    # with coverage report
pnpm test:hil         # hardware-in-loop tests (requires HIL_PRESONUS=1 + physical mixer)

pnpm typecheck        # tsc dry-run

pnpm probe:dev discover                            # discover mixers
pnpm probe:dev dump-state -d <mixer-ip>            # capture state
pnpm probe:dev probe-fat-channel -d <ip> -c LINE:1 # inspect channel

pnpm mcp:server:dev   # run MCP server (tsx, no build needed)
pnpm mcp:server       # run MCP server (compiled dist/)
```

### Test strategy

| Test type | Command | Requires hardware |
|---|---|---|
| Unit (schema/adapter logic) | `pnpm test` | No |
| HIL (hardware-in-loop) | `pnpm test:hil` | Yes — see below |

#### HIL test setup

HIL tests require a physical StudioLive III mixer on the local network. Set the following environment variables before running `pnpm test:hil`:

```bash
# Required
export HIL_PRESONUS=1                        # enables HIL test suite
export HIL_PRESONUS_IP=<mixer-ip-address>    # e.g. 192.168.1.50
export HIL_PRESONUS_SERIAL=<serial-number>   # e.g. SD7E21010066

# Then run
pnpm test:hil
```

On Windows PowerShell:

```powershell
$env:HIL_PRESONUS="1"
$env:HIL_PRESONUS_IP="<mixer-ip>"
$env:HIL_PRESONUS_SERIAL="<serial>"
pnpm test:hil
```

Unit tests cover all domain schemas, decode functions, `flattenFeatherbearState`, and `PresonusMeterSummarizer` using captured fixture data from `captures/`.

### GitHub issue model and traceability

All requirements, architecture decisions, and test cases are tracked as GitHub issues following this taxonomy:

| Prefix | Type | Example |
|---|---|---|
| `StR-NNN` | Stakeholder requirement | #1–#4 |
| `REQ-F-*` | Functional requirement | #15–#46 |
| `REQ-NF-*` | Non-functional requirement | #21–#24 |
| `ADR-*` | Architecture decision | #47 |
| `QA-SC-*` | Quality attribute scenario | #25–#27, #49–#50 |
| `TEST-*` | Verification test case | #51–#60, #80–#83 |

Issues are organized into milestones v0.1–v1.0. See the [GitHub Issues tab](https://github.com/zarfld/presonus-studiolive-mcp/issues) for the full traceability register.

### Adding a new raw state key

1. `pnpm probe:dev dump-state -d <ip>` before and after changing a control in UC Surface
2. `pnpm probe:dev diff-state --before <before.json> --after <after.json>` — identifies the changed key
3. Add the constant to `packages/presonus-adapter/src/types.ts`
4. Map it in `mapRawStateToSnapshot()` or expose via `rawExtra`
5. Add a unit test with a fixture snapshot

---

## Architecture

Three-layer architecture (ADR-002):

```
┌─────────────────────────────────────────┐
│  AI Agent / MCP Client                  │
│  (Claude Desktop, VS Code, custom)      │
└────────────────┬────────────────────────┘
                 │ stdio (MCP protocol)
┌────────────────▼────────────────────────┐
│  @presonus-mcp/server                   │
│  See docs/capability-matrix.generated.md │
└────────────────┬────────────────────────┘
                 │ internal API
┌────────────────▼────────────────────────┐
│  @presonus-mcp/adapter                  │
│  PresonusClientManager                  │
│  flattenFeatherbearState()              │
│  PresonusMeterSummarizer                │
└────────────────┬────────────────────────┘
                 │ TCP 53000 (UC Surface protocol)
┌────────────────▼────────────────────────┐
│  StudioLive III mixer                   │
│  (32SC, 32R, 24R, 16R, 16)             │
└─────────────────────────────────────────┘
```

Domain schemas (`@presonus-mcp/domain`) sit outside this stack and are imported by both adapter and server — never the other way round.

Key decisions:
- **ADR-001** — TypeScript/Node.js 20+
- **ADR-002** — Three-layer architecture above
- **ADR-003** — pnpm monorepo, 4 packages
- **ADR-004** — `@featherbear/presonus-studiolive-api` v1.8.0 pinned + patched as hardware adapter
- **ADR-005** — Read-only-first; write operations require a `ProposedChangeSet` + audit log + confirmation flow before being enabled

### Known gaps / future work

- **Write tools** — `propose_eq_change` + `apply_change_set` are available (write-enabled mode). Extended change-set framework (rename, mute, fader, aux send, comp/gate/limiter) planned.
- **Layer B routing** — Physical input source routing and AVB stream routing require probe-diff sessions (`probe-routing diff --kind input-source/avb-stream`). `get_input_routing` and `validate_avb_routing` return probe instructions.
- **Output patch source names** — `validate_output_routing` knows source indices but not names; probe-diff with `--kind bus-to-output` needed.
- **Stereo IEM pair model** — Monitor layout and stereo-pair validation planned (Phase 4).
- **Show prep layer** — `ShowInputSchema` is a stub (rider analysis, channel template suggestions).
- **Scene file access** — `__classid` GUIDs not accessible over network; only live state model IDs available.
- **HIL test coverage** — tests with `*.hil.test.ts` require a physical mixer.

---

## License

MIT — see [LICENSE](LICENSE).

## 🎯 Purpose

This repository provides:
- **Standards-compliant** software lifecycle management (IEEE/ISO/IEC)
- **XP practices** integration (TDD, Pair Programming, Continuous Integration)
- **Phase-specific Copilot instructions** with `applyTo:` patterns
- **Spec-driven development** templates using GitHub Spec-Kit
- **Automated compliance** checking and validation

## 📚 Standards Implemented

| Standard | Purpose | Coverage |
|----------|---------|----------|
| **ISO/IEC/IEEE 12207:2017** | Software life cycle processes | Complete lifecycle framework |
| **ISO/IEC/IEEE 29148:2018** | Requirements engineering | Requirements elicitation, analysis, specification |
| **IEEE 1016-2009** | Software design descriptions | Architecture and detailed design |
| **ISO/IEC/IEEE 42010:2011** | Architecture description | Architecture views, viewpoints, concerns |
| **IEEE 1012-2016** | Verification & validation | V&V planning, testing, reviews |

## 🚀 XP Practices Integrated

- **Test-Driven Development (TDD)** - Write tests first
- **Continuous Integration** - Integrate frequently
- **Pair Programming** - Collaborative development
- **Simple Design** - YAGNI principle
- **Refactoring** - Continuous improvement
- **Collective Code Ownership** - Shared responsibility
- **User Stories** - Effective use cases

## 📁 Repository Structure

```
copilot-instructions-template/
├── .github/
│   ├── copilot-instructions.md          # Root Copilot instructions
│   ├── workflows/                        # CI/CD automation
│   └── ISSUE_TEMPLATE/                   # Issue templates
│
├── 01-stakeholder-requirements/
│   ├── .github/copilot-instructions.md   # Phase-specific instructions
│   ├── stakeholders/                     # Stakeholder analysis
│   ├── business-context/                 # Business needs
│   └── templates/                        # Requirements templates
│
├── 02-requirements/
│   ├── .github/copilot-instructions.md
│   ├── functional/                       # Functional requirements
│   ├── non-functional/                   # Quality attributes
│   ├── use-cases/                        # Use case specifications
│   └── user-stories/                     # XP user stories
│
├── 03-architecture/
│   ├── .github/copilot-instructions.md
│   ├── decisions/                        # ADRs (Architecture Decision Records)
│   ├── views/                            # IEEE 42010 architecture views
│   ├── diagrams/                         # C4, UML diagrams
│   └── constraints/                      # Technical constraints
│
├── 04-design/
│   ├── .github/copilot-instructions.md
│   ├── components/                       # Component designs
│   ├── interfaces/                       # API specifications
│   ├── data-models/                      # Data structures
│   └── patterns/                         # Design patterns used
│
├── 05-implementation/
│   ├── .github/copilot-instructions.md
│   ├── src/                              # Source code
│   ├── tests/                            # Test-first XP tests
│   └── docs/                             # Code documentation
│
├── 06-integration/
│   ├── .github/copilot-instructions.md
│   ├── integration-tests/                # Integration test suites
│   ├── ci-config/                        # CI/CD configurations
│   └── deployment/                       # Deployment scripts
│
├── 07-verification-validation/
│   ├── .github/copilot-instructions.md
│   ├── test-plans/                       # IEEE 1012 test plans
│   ├── test-cases/                       # Detailed test cases
│   ├── test-results/                     # Test execution results
│   └── traceability/                     # Requirements traceability
│
├── 08-transition/
│   ├── .github/copilot-instructions.md
│   ├── deployment-plans/                 # Deployment strategies
│   ├── user-documentation/               # End-user guides
│   └── training-materials/               # Training resources
│
├── 09-operation-maintenance/
│   ├── .github/copilot-instructions.md
│   ├── monitoring/                       # Operations monitoring
│   ├── incident-response/                # Incident management
│   └── maintenance-logs/                 # Change logs
│
├── spec-kit-templates/
│   ├── requirements-spec.md              # IEEE 29148 templates
│   ├── design-spec.md                    # IEEE 1016 templates
│   ├── architecture-spec.md              # IEEE 42010 templates
│   ├── test-spec.md                      # IEEE 1012 templates
│   └── user-story-template.md            # XP user story template
│
├── standards-compliance/
│   ├── checklists/                       # Phase-specific checklists
│   ├── reviews/                          # Review reports
│   └── metrics/                          # Quality metrics
│
└── docs/
    ├── lifecycle-guide.md                # Complete lifecycle guide
    ├── xp-practices.md                   # XP implementation guide
    ├── copilot-usage.md                  # How to use Copilot instructions
    └── standards-reference.md            # Standards quick reference
```

## 🎓 How to Use This Template

### 1. Create New Project from Template

```bash
# Create repository from this template on GitHub
# OR clone and customize
git clone https://github.com/YOUR_ORG/copilot-instructions-template.git my-new-project
cd my-new-project
```

### 2. Initialize Your Project

```bash
# Update project-specific information
# Edit .github/copilot-instructions.md with your project details
# Customize templates in spec-kit-templates/
```

### 3. Follow the Lifecycle Phases

Start with **Phase 01** and progress through each phase:

1. **Stakeholder Requirements** - Understand business needs
2. **Requirements** - Define what to build (IEEE 29148)
3. **Architecture** - Design system structure (IEEE 42010)
4. **Design** - Detail component design (IEEE 1016)
5. **Implementation** - Code with TDD (XP practices)
6. **Integration** - Continuous integration (XP)
7. **Verification & Validation** - Test thoroughly (IEEE 1012)
8. **Transition** - Deploy to production
9. **Operation & Maintenance** - Monitor and improve

### 4. Use Copilot with Phase Instructions

GitHub Copilot will automatically load phase-specific instructions based on the folder you're working in:

- Navigate to a phase folder (e.g., `02-requirements/`)
- Copilot reads `.github/copilot-instructions.md` in that folder
- Get context-aware suggestions aligned with standards

### 5. Leverage Spec-Kit Templates

Use markdown specifications for AI-assisted development:

```bash
# Copy template for your feature
cp spec-kit-templates/requirements-spec.md 02-requirements/functional/feature-xyz.md

# Fill in the specification
# Use GitHub Copilot to generate code from spec
```

## 🤖 Copilot Instructions Features

### ApplyTo Patterns

Copilot instructions use `applyTo:` patterns to target specific file types:

```yaml
applyTo:
  - "02-requirements/**/*.md"
  - "02-requirements/**/use-cases/*.md"
  - "02-requirements/**/user-stories/*.md"
```

### Standards Enforcement

Each phase enforces relevant standards:

```markdown
## Standards Compliance
- IEEE 29148:2018 - Requirements specification format
- Traceability matrix required
- Review checklist completion mandatory
```

### XP Practices Integration

```markdown
## XP Practices
- Write user stories in Given-When-Then format
- Maintain story point estimates
- Track velocity
```

## 🎫 GitHub Issues Workflow

This template uses **GitHub Issues as the primary traceability mechanism** for all requirements, architecture decisions, and test cases. All artifacts are tracked as issues with bidirectional links.

### Issue Types and Labels

| Type | Label | Prefix | Description | Example |
|------|-------|--------|-------------|---------|
| **Stakeholder Requirement** | `type:stakeholder-requirement` | `StR-` | Business needs and context | `StR-001: User Authentication` |
| **Functional Requirement** | `type:requirement:functional` | `REQ-F-` | System functional behavior | `REQ-F-AUTH-001: Login with credentials` |
| **Non-Functional Requirement** | `type:requirement:non-functional` | `REQ-NF-` | Quality attributes | `REQ-NF-PERF-001: Response time < 200ms` |
| **Architecture Decision** | `type:architecture:decision` | `ADR-` | Architectural choices | `ADR-SECU-001: Use JWT authentication` |
| **Architecture Component** | `type:architecture:component` | `ARC-C-` | Component specifications | `ARC-C-AUTH-001: Authentication service` |
| **Quality Scenario** | `type:architecture:quality-scenario` | `QA-SC-` | ATAM quality scenarios | `QA-SC-PERF-001: Peak load scenario` |
| **Test Case** | `type:test` | `TEST-` | Verification specifications | `TEST-AUTH-LOGIN-001: Valid login test` |

Additional labels:

- **Phase**: `phase:01-stakeholder-requirements`, `phase:02-requirements`, etc.
- **Priority**: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
- **Test Type**: `test-type:unit`, `test-type:integration`, `test-type:e2e`, `test-type:acceptance`
- **Status**: `status:draft`, `status:approved`, `status:implemented`, `status:verified`

### Traceability Patterns

All issues must include traceability links:

```markdown
## Traceability
- Traces to:  #123 (parent StR issue)
- **Depends on**: #45, #67 (prerequisite requirements)
- **Verified by**: #89, #90 (test issues)
- **Implemented by**: #PR-15 (pull request)
- **Refined by**: #234, #235 (child requirements)
```

### Issue Templates

Issue templates are available in `.github/ISSUE_TEMPLATE/`:

- `stakeholder-requirement.yml`
- `functional-requirement.yml`
- `non-functional-requirement.yml`
- `architecture-decision.yml`
- `architecture-component.yml`
- `quality-scenario.yml`
- `test-case.yml`

### Workflow Examples

#### 1. Create Stakeholder Requirement Issue

```bash
# Using GitHub CLI
gh issue create \
  --title "StR-001: User Authentication" \
  --label "type:stakeholder-requirement,phase:01-stakeholder-requirements,priority:critical" \
  --body "$(cat issue-body.md)"
```

#### 2. Create Functional Requirement from StR

```markdown
## Traceability
- Traces to:  #1 (StR-001: User Authentication)

## Description
System shall allow users to log in with username and password.

## Acceptance Criteria
- [ ] User can enter username and password
- [ ] System validates credentials
- [ ] User is redirected to dashboard on success
- [ ] Error message displayed on failure
```

#### 3. Link Code to Issues

```python
"""
User authentication service.

Implements: #2 (REQ-F-AUTH-001: User Login)
Architecture: #5 (ADR-SECU-001: JWT Authentication)
Verified by: #10 (TEST-AUTH-LOGIN-001)

See: https://github.com/org/repo/issues/2
"""
class AuthenticationService:
    pass
```

#### 4. Link Tests to Requirements

```python
"""
Test user login functionality.

Verifies: #2 (REQ-F-AUTH-001: User Login)
Test Type: Integration
Priority: P0 (Critical)
"""
def test_user_login_success():
    # Test implementation
```

#### 5. Link Pull Requests

```markdown
## Description
Implements user authentication feature

## Related Issues
Fixes #2
Implements #5
Part of #1

## Traceability
- **Requirements**: #2 (REQ-F-AUTH-001)
- **Design**: #5 (ADR-SECU-001)
- **Tests**: #10 (TEST-AUTH-LOGIN-001)
```

### Python Automation Scripts

Available in `scripts/`:

- **`generate-traceability-matrix.py`** - Generate REQ↔TEST↔CODE matrix
- **`trace_unlinked_requirements.py`** - Find requirements without tests
- **`validate-traceability.py`** - Validate bidirectional links
- **`scripts/generate-requirement-issues.py`** - Generate REQ issues from specs
- **`scripts/generate-test-issues.py`** - Generate TEST issues from requirements
- **`scripts/validate-issue-traceability.py`** - Validate GitHub Issues traceability

Example usage:

```bash
# Find requirements without tests
python scripts/trace_unlinked_requirements.py

# Validate traceability
python scripts/validate-traceability.py

# Generate traceability matrix
python scripts/generate-traceability-matrix.py --output-html
```

### CI/CD Integration

GitHub Actions workflows validate traceability:

```yaml
# .github/workflows/validate-traceability.yml
name: Validate Traceability
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate issue links
        run: python scripts/validate-issue-traceability.py
      - name: Check test coverage
        run: python scripts/validate-trace-coverage.py
      - name: Generate matrix
        run: python scripts/generate-traceability-matrix.py
```

### Best Practices

1. **Always create issues before code** - No code without linked issue
2. **Use bidirectional links** - Parent issues list children, children reference parents
3. **Link PRs to issues** - Use `Fixes #N`, `Implements #N`, `Part of #N`
4. **Include issue references in code** - Docstrings, comments, commit messages
5. **Validate traceability in CI** - Block merges if links are missing
6. **Keep issues up-to-date** - Close when implemented and verified
7. **Use labels consistently** - Enables automated queries and reports

### Querying Issues

```bash
# List all functional requirements
gh issue list --label "type:requirement:functional"

# Find requirements without tests
gh issue list --label "type:requirement:functional" --json number,title,labels \
  | jq '.[] | select(.labels | map(.name) | contains(["status:verified"]) | not)'

# Show traceability for requirement #2
gh issue view 2 --json body | jq -r '.body' | grep -A 10 "## Traceability"

# List all open architecture decisions
gh issue list --label "type:architecture:decision" --state open
```

## 🔍 Quality Assurance

### Automated Checks

- **Standards compliance** checking via GitHub Actions
- **Requirements traceability** validation (GitHub Issues API)
- **Test coverage** enforcement (XP: >80%)
- **Documentation completeness** checks
- **Issue link validation** (bidirectional traceability)

### Review Gates

Each phase includes:

- ✅ Entry criteria checklist
- ✅ Phase activities checklist
- ✅ Exit criteria validation
- ✅ Standards compliance review
- ✅ Traceability validation (all requirements have tests)

## 📖 Documentation

- **[Lifecycle Guide](docs/lifecycle-guide.md)** - Complete walkthrough of all phases
- **[XP Practices Guide](docs/xp-practices.md)** - How to apply XP techniques
- **[Copilot Usage Guide](docs/copilot-usage.md)** - Maximizing Copilot effectiveness
- **[Standards Reference](docs/standards-reference.md)** - Quick reference to all standards

## 🛠️ Customization

### Adding Custom Phases

1. Create folder: `XX-custom-phase/`
2. Add `.github/copilot-instructions.md`
3. Define applyTo patterns
4. Update root copilot-instructions.md

### Extending Templates

1. Add templates to `spec-kit-templates/`
2. Follow Spec-Kit markdown format
3. Include standards references
4. Add examples

## 🤝 Contributing

This template is designed to be:

- **Forked** for your organization
- **Customized** to your processes
- **Extended** with your practices
- **Shared** with your teams

## 📄 License

MIT — see [LICENSE](LICENSE).

## 🔗 References

- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [Spec-Driven Development Blog Post](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-using-markdown-as-a-programming-language-when-building-with-ai/)
- [ISO/IEC/IEEE Standards](https://www.iso.org)
- [Extreme Programming Explained (Kent Beck)](http://www.extremeprogramming.org/)

---

## 🚀 Get Started

Ready to build standards-compliant software with AI assistance? Start with Phase 01!
