# Ubiquitous Language Glossary

**Phase**: 02-Requirements  
**Standards**: ISO/IEC/IEEE 29148:2018  
**Purpose**: Single source of truth for domain terminology used consistently across requirements, design, code, and communication.

## 🎯 Purpose

The Ubiquitous Language is a shared vocabulary used by all team members (developers, domain experts, stakeholders) to ensure consistent understanding. Terms defined here MUST be used in:

- ✅ Requirements specifications
- ✅ Architecture decisions (ADRs)
- ✅ Code (class names, method names, variables)
- ✅ Tests
- ✅ Documentation
- ✅ Conversations with domain experts

**DDD Integration**: This glossary drives Model-Driven Design - when terms change here, code must be refactored to match. The domain model in code should be a direct reflection of the language captured here.

## 📚 Glossary Format

Each term entry must include:

| Field | Description |
|-------|-----------|
| **Term** | The canonical name used everywhere |
| **Context** | Bounded Context(s) where term applies |
| **Definition** | Clear, concise meaning from domain expert perspective |
| **Type** | DDD Pattern: Entity, Value Object, Aggregate, Service, Event |
| **Synonyms** | Alternative names (avoid using these) |
| **Relationships** | Related terms, parent concepts |
| **Examples** | Real-world usage examples |
| **Rules** | Business rules or constraints |
| **Code Mapping** | Class/interface names in implementation |
| **Traceability** | Link to requirements/issues |

---

## 📖 Domain Terms

> **Scope**: PreSonus StudioLive MCP Server — live event audio production domain.
> All terms below are used consistently in requirements (#1–#24), architecture (#6–#14), code (`packages/`), and tests.
> Last updated: 2026-06-24

---

### AVB (Audio Video Bridging)

**Context**: Network audio, mixer interconnect
**Definition**: IEEE 802.1 Audio Video Bridging — the network protocol used to stream audio between the StudioLive 32SC (FOH console) and StudioLive 32R (stagebox/rack) over a standard Ethernet network.
**Type**: Technical Standard
**Synonyms**: Milan (compatible subset), AVB/TSN
**Relationships**: Used by Stagebox (#stagebox), FOH (#foh)
**Business Rules**: Both mixer units must be on the same AVB-capable network switch; the 32R acts as an AVB input/output unit slaved to the 32SC.
**Code Mapping**: `AudioRouteSchema`, `AudioRoute.sourcePort` / `destinationPort`
**Traceability**: #4 (StR: Routing validation)

---

### Channel

**Context**: Mixer operation
**Definition**: A single signal path on the mixing console. Each channel has a type (LINE, AUX, FX, SUB, MAIN), a number, a name, and processing (fader, mute, pan, Fat Channel).
**Type**: Entity (has identity: type + number)
**Synonyms**: Strip, Input (avoid — ambiguous)
**Relationships**: Belongs to a mixer (MixerIdentity); has FatChannel processing; contributes to Mixes
**Business Rules**:
- Identity = ChannelSelector (type + number); this is stable
- Channel names are mutable (set by engineer, reflected in state)
- Linked stereo channels share fader/pan but remain two separate entities
**Code Mapping**: `MixerChannelSchema`, `MixerChannel`, `ChannelSelectorSchema`
**Traceability**: #17 (REQ-F-003)

---

### ChannelSelector

**Context**: Domain model, API contracts
**Definition**: An immutable value object that uniquely identifies a channel within a mixer: `{ type: ChannelType, channel: number }`. This is the stable addressing scheme used in all tool inputs and resource outputs.
**Type**: Value Object
**Examples**: `{ type: "LINE", channel: 1 }`, `{ type: "AUX", channel: 3 }`, `{ type: "MAIN", channel: 1 }`
**Business Rules**: Channel number is 1-based (first channel = 1, not 0)
**Code Mapping**: `ChannelSelectorSchema`
**Traceability**: #11 (ARC-C-001)

---

### ChannelType

**Context**: Domain model
**Definition**: An enumeration of the functional roles a channel can play on a StudioLive mixer. Each type corresponds to a section of the mixer's signal flow.
**Type**: Value Object (enum)
**Values**:
- `LINE` — Physical microphone/line input channels
- `RETURN` — Return channels (e.g., from external effects units)
- `FXRETURN` — Internal FX return channels
- `TALKBACK` — Talkback microphone channel
- `AUX` — Auxiliary send mix buses (monitor mixes)
- `FX` — Internal FX send buses
- `SUB` — Subgroup buses
- `MAIN` — Main L/R output bus
**Code Mapping**: `ChannelTypeSchema` (matches featherbear `ChannelTypes` enum)
**Traceability**: #11 (ARC-C-001), #9 (ADR-004)

---

### DeviceId

**Context**: Adapter layer, MCP resources
**Definition**: A stable internal string identifier for a mixer device, derived using the identity priority rule. Format: `serial:<serial>` (preferred) or `ip:<ip>:<port>` (fallback only).
**Type**: Value Object
**Business Rules** (identity priority — REQ-F-002 #16):
1. `serial:<serial>` — when serial is available from discovery
2. `alias:<alias>` — when a configured alias with expected serial is present
3. `ip:<ip>:<port>` — temporary fallback; must not be used as stable identity
**Code Mapping**: `MixerIdentity.deviceId`
**Traceability**: #16 (REQ-F-002)

---

### Discovery

**Context**: Adapter layer, network
**Definition**: The process of finding StudioLive III mixers on the local network using UDP broadcast packets. The featherbear `Discovery` class handles this; the adapter layer normalizes results into `DiscoveryResult`.
**Type**: Domain Service
**Business Rules**:
- Runs for a configurable timeout (default 5000 ms)
- Fallback IP is attempted for configured devices that did not respond
- Results are deduplicated by serial number
**Code Mapping**: `discoverMixers()`, `DiscoveryResult`, `PresonusDiscoveryService`
**Traceability**: #15 (REQ-F-001), #21 (REQ-NF-001)

---

### DiscoveryResult

**Context**: Adapter layer
**Definition**: The normalized output of a discovery operation: `{ devices: MixerIdentity[], missingConfigured: DeviceConfig[], unknownDiscovered: MixerIdentity[] }`.
**Type**: Value Object
**Code Mapping**: `DiscoveryResult`
**Traceability**: #15 (REQ-F-001)

---

### EQ (Equalizer)

**Context**: Mixer signal processing (Fat Channel)
**Definition**: The parametric equalizer section of the Fat Channel strip on each input channel. Available in multiple models (Standard, Passive, Vintage, and add-ons from Fat Channel Collection Vol. 1).
**Type**: Value Object (parameters of FatChannel)
**Synonyms**: Parametric EQ, Channel EQ
**Business Rules**: Model-specific parameters; discriminated union required because different models expose different band counts and control types.
**Code Mapping**: `FatEqStateSchema`, `FatEqModelSchema`
**Traceability**: #11 (ARC-C-001)

---

### FatChannel

**Context**: Mixer signal processing
**Definition**: PreSonus's name for the integrated channel strip processing built into every StudioLive III input channel. Consists of four processors in series: Gate, Compressor, EQ, Limiter. Each section can use different models (factory or licensed add-ons).
**Type**: Value Object (part of Channel)
**Business Rules**:
- Model IDs are integers in the raw state; mapping to human names requires empirical probing
- Add-on models (Fat Channel Collection Vol. 1) are only available on mixers with authorization
- All raw model values are marked `confidence: "unverified"` until confirmed by `presonus-probe probe-fat-channel`
**Code Mapping**: `FatChannelStateSchema`, `FatModelRefSchema`
**Traceability**: #11 (ARC-C-001)

---

### FOH (Front of House)

**Context**: Live event production
**Definition**: The main mixing position at the back of the audience area. The "FOH mixer" is the primary mixing console controlled by the FOH engineer. In this system, the StudioLive 32SC is designated as the FOH mixer.
**Type**: Role (of a MixerIdentity)
**Synonyms**: Main mix, House mix
**Code Mapping**: `MixerRole.FOH`, `MixerIdentity.role`
**Traceability**: #1 (StR), #10 (ADR-005)

---

### GainHint

**Context**: Meter summaries, soundcheck diagnostics
**Definition**: A semantic classification of a channel's signal level, derived from time-windowed meter data. Replaces raw numeric meter values with human-meaningful categories.
**Type**: Value Object (enum)
**Values**:
- `no-signal` — Below noise floor; effectively silent
- `low` — Very low signal; likely not passing intended program audio
- `ok` — Nominal signal level; healthy
- `hot` — Above normal operating level; approaching clip
- `clipping` — At or above digital full scale (0 dBFS); distorting
**Business Rules**: Thresholds are approximate until calibrated empirically against physical hardware meter readings.
**Code Mapping**: `GainHintSchema`
**Traceability**: #18 (REQ-F-004)

---

### InputList

**Context**: Show preparation
**Definition**: An ordered list of all audio inputs for a show or set, with each entry specifying source name, performer, instrument, and technical requirements. Derived from one or more Riders.
**Type**: Value Object (list of ShowInput)
**Business Rules**:
- Input numbers are 1-based, corresponding to physical mixer channels
- Multiple bands on the same show may share or have separate input lists
**Code Mapping**: `ShowInputSchema`, `RiderPlanSchema.mergedInputList`
**Traceability**: #2 (StR: Show preparation)

---

### MeterSummary

**Context**: Soundcheck diagnostics, MCP resources
**Definition**: A time-windowed statistical summary of raw meter data for all channels on a mixer. Classifies channels by signal activity (silent, active, hot, clipping). This is the primary meter representation exposed to AI agents — raw meter streams are never exposed.
**Type**: Value Object
**Business Rules**:
- Window sizes: 1s (instantaneous), 10s (short-term), 60s (long-term)
- `computedAt` timestamp allows agents to assess freshness
- `noSignalButExpected` requires an input list to be loaded; empty otherwise
**Code Mapping**: `MeterSummarySchema`
**Traceability**: #18 (REQ-F-004), #22 (REQ-NF-002), #23 (REQ-NF-003)

---

### MixerIdentity

**Context**: Adapter layer, MCP resources
**Definition**: The normalized representation of a discovered or configured mixer device. Contains all information needed to identify, connect to, and role-assign a mixer.
**Type**: Entity (identified by DeviceId)
**Business Rules**:
- `serial` field is the preferred stable identity; see DeviceId
- `controllable` is always `false` in MVP; only `true` when explicitly configured AND write tools are implemented
- `confidence` field tracks how certain we are about the identity claim
**Code Mapping**: `MixerIdentitySchema`, `MixerIdentity`
**Traceability**: #15 (REQ-F-001), #16 (REQ-F-002)

---

### OperationMode

**Context**: MCP server configuration, safety boundary
**Definition**: A named operating mode that determines which tools and resources are available. The mode is set in `presonus-mcp.config.yaml` and enforced at server startup.
**Type**: Value Object (enum)
**Values**:
- `prepare` — Pre-show or offline. All read/analysis tools available; no write tools.
- `soundcheck_assist` — During soundcheck setup. Same as prepare; meter summaries actively computed.
- `control_locked` — During live show. Read-only. All write tools disabled regardless of other config.
**Business Rules**: Write tools require BOTH `operationMode ≠ control_locked` AND `controlEnabled: true` in config. Default mode if unspecified: `soundcheck_assist`.
**Code Mapping**: Config schema `operationMode` field
**Traceability**: #5 (StR: Safety), #10 (ADR-005), #22 (REQ-NF-002)

---

### PatchPlan

**Context**: Show preparation
**Definition**: The mapping that assigns each InputList entry to a specific physical mixer channel. Produced by comparing the Rider's InputList against the mixer's available channels.
**Type**: Value Object
**Business Rules**: A PatchPlan is advisory; it must be reviewed and applied by a human engineer.
**Traceability**: #2 (StR: Show preparation)

---

### ProposedChangeSet

**Context**: Change-set gate (future, not MVP)
**Definition**: A structured proposal for a set of mixer changes that has been generated by an AI agent but NOT yet applied. Contains risk classification and reason per change. Requires human review and an explicit `apply_change_set` call to execute.
**Type**: Entity (has id; lifecycle: proposed → reviewed → applied/rejected)
**Business Rules**:
- `requiresConfirmation: true` always
- Cannot be applied autonomously by the AI agent — requires the `apply_change_set` tool which is NOT registered in MVP
- All changes include `currentValue` and `proposedValue` for diffing
**Code Mapping**: `ProposedChangeSet` (design only in MVP; not implemented)
**Traceability**: #5 (StR: Safety), #10 (ADR-005)

---

### Project

**Context**: Mixer scene management
**Definition**: A named saved state container on the StudioLive console that holds one or more Scenes. Projects are listed via `client.getProjects()` in the featherbear API.
**Type**: Entity (has name as identity)
**Relationships**: Contains one or more Scenes
**Business Rules**: Project recall is disabled in MVP (read-only)
**Code Mapping**: `MixerSnapshot.currentProject`, `MixerSnapshot.availableProjects`
**Traceability**: #19 (REQ-F-005)

---

### Rider

**Context**: Show preparation, event production
**Definition**: A technical advance document provided by a performer listing all audio inputs, equipment requirements, monitor preferences, and special needs. The AI agent analyzes Riders to produce an InputList and PatchPlan.
**Type**: External Input Document
**Synonyms**: Tech rider, technical rider, stage plot (partial synonym)
**Business Rules**: Multiple Riders from different bands on the same show must be merged into a single InputList; conflicts must be flagged.
**Traceability**: #2 (StR: Show preparation)

---

### Scene

**Context**: Mixer scene management
**Definition**: A named snapshot of the complete mixer state (all channels, fader levels, FatChannel settings) stored within a Project on the console.
**Type**: Entity (has name; belongs to Project)
**Business Rules**: Scene recall is disabled in MVP (read-only). Current scene is exposed as a read resource.
**Code Mapping**: `MixerSnapshot.currentScene`
**Traceability**: #19 (REQ-F-005)

---

### Soundcheck

**Context**: Live event production
**Definition**: The period before a live show when the sound engineer sets microphone placements, gain levels, monitor mixes, and effect settings for each performer's inputs. This system provides diagnostic assistance during soundcheck.
**Type**: Lifecycle Phase (of a show)
**Business Rules**: The agent assists during soundcheck but does not perform soundcheck autonomously. All suggestions require human execution.
**Traceability**: #3 (StR: Soundcheck assistance)

---

### Stagebox

**Context**: Live event production, mixer topology
**Definition**: A remote stage input/output unit that connects to the FOH console via AVB. In this system, the StudioLive 32R acts as the stagebox, providing 32 additional inputs at the stage while being controlled from the 32SC at FOH.
**Type**: Role (of a MixerIdentity)
**Code Mapping**: `MixerRole.STAGEBOX`
**Traceability**: #4 (StR: Routing validation)

---

### StateCache

**Context**: Adapter layer
**Definition**: An in-memory representation of the last-known normalized mixer state, updated from featherbear data events as they arrive. The state cache is the source for all MCP resource responses; the MCP server never queries the mixer synchronously per request.
**Type**: Domain Service (internal to adapter)
**Business Rules**:
- Updated within 500 ms of receiving a featherbear data event (REQ-NF-003 #23)
- Marked as potentially stale if no event received for > 2000 ms
- Always returns cached data (never errors on stale state — returns with `stale: true` flag)
**Code Mapping**: `MixerSnapshot`, `PresonusClientManager.getSnapshot()`
**Traceability**: #17 (REQ-F-003), #23 (REQ-NF-003)

---

## 📋 Term Addition Process

When adding a new term to the glossary:

1. **Confirm with Domain Expert** - Ensure term is accurate and agreed upon
2. **Create GitHub Issue** - Create requirement or architecture issue
3. **Add to Glossary** - Use template above
4. **Update Code** - Refactor existing code to use new term
5. **Update Tests** - Ensure tests use canonical term
6. **Document in ADR** - If term affects architecture, create ADR

**Template for New Term**:

```markdown
### [Term Name]

**Context**: [Bounded Context(s)]  
**Definition**: [Clear definition from domain expert]  
**Type**: [Entity | Value Object | Service | Concept]  
**Synonyms**: [Alternative names to avoid]  
**Relationships**:
- [Relationship type]: [Related term(s)]
**Business Rules**:
- [Rule 1]
- [Rule 2]
**Traceability**: [#Issue numbers]  
**Examples**:
- [Example 1]
- [Example 2]
```

---

## ✅ Glossary Maintenance Checklist

### When Creating Requirements (Phase 02)
- [ ] Identify domain terms in user stories
- [ ] Add new terms to glossary
- [ ] Use canonical terms in requirement text

### When Designing (Phase 04)
- [ ] Class names match glossary terms
- [ ] Method names use ubiquitous language
- [ ] Design patterns reflect domain concepts

### When Implementing (Phase 05)
- [ ] Variable names use glossary terms
- [ ] Code comments use canonical terminology
- [ ] Avoid technical jargon not in glossary

### When Testing (Phase 07)
- [ ] Test names use ubiquitous language
- [ ] Test scenarios match domain examples
- [ ] Acceptance criteria use canonical terms

### When Documenting (Phase 08)
- [ ] User documentation uses glossary terms
- [ ] Training materials consistent with glossary
- [ ] Help text uses canonical terminology

---

## 🚨 Anti-Patterns to Avoid

❌ **Don't use technical terms when domain term exists**:
- Bad: `DataAccessObject`, `EntityManager`
- Good: `Repository`, `Order`

❌ **Don't use abbreviations not agreed by domain experts**:
- Bad: `Cust`, `Ord`, `Inv`
- Good: `Customer`, `Order`, `Invoice`

❌ **Don't use same term for different concepts**:
- Bad: "User" for both Customer and AuthenticatedUser
- Good: "Customer" (Sales context), "User" (Auth context)

❌ **Don't create synonyms in code**:
- Bad: `Client`, `Customer`, `Purchaser` used interchangeably
- Good: Pick one canonical term (`Customer`) and use consistently

---

## 🔗 Related Documentation

- [Context Map](../03-architecture/context-map.md) - Bounded Context relationships
- [DDD Tactical Patterns](../04-design/patterns/ddd-tactical-patterns.md) - Pattern definitions
- [Requirements Specification Template](../spec-kit-templates/requirements-spec.md)
- [XP Practices - Simple Design](../docs/xp-practices.md#4-simple-design-)

---

## 📊 Glossary Metrics

| Metric | Target | Purpose |
|--------|--------|---------|
| Terms defined | 20+ core terms | Comprehensive coverage |
| Terms with examples | 100% | Clarity for developers |
| Terms with traceability | 100% | Link to requirements |
| Context conflicts resolved | All | No ambiguity |

---

**Standards Alignment**:
- ISO/IEC/IEEE 29148:2018 (Requirements Engineering)
- ISO/IEC/IEEE 12207:2017 (Software Life Cycle Processes)
- Domain-Driven Design (Evans, 2003)

**Version**: 1.0  
**Last Updated**: 2025-11-27  
**Owner**: Requirements Team
