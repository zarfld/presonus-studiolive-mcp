## Assessment scope

I rechecked the live GitHub repository and npm metadata, but I did **not** run a local `pnpm build/test` because the container environment could not clone GitHub directly. So this is a **static repository audit** based on GitHub source, docs, issues, and package metadata.

## Executive verdict

`presonus-studiolive-mcp` is currently **usable as an experimental, read-mostly MCP backend** for inspecting a StudioLive III mixer, especially the 32SC. It is **not yet production-ready** for real autonomous soundcheck or live-mixing agent operation. The repository itself is fairly honest about this: the README calls it an “Experimental read-mostly backend,” validated primarily against a **StudioLive 32SC firmware 3.3.0.109659**, with other StudioLive III models still requiring HIL testing. Write tools are explicitly gated and experimental. ([GitHub][1])

The most important finding is that the repo does **not** mainly suffer from hidden TODO clutter. The critical issue is more structural: several user-facing capabilities exist in the tool inventory but are marked as **stub**, **inferred**, **probe_required**, or **not_verifiable_with_current_adapter**. For an MCP server, that matters because an agent may see a tool name and assume the capability is real. The repo has 44 total tools, but 10 are write-gated and several routing/Fat Channel tools are not fully verified. ([GitHub][2])

---

## Most critical unfinished / stub / placeholder areas

| Priority | Area                        | Current state                                         | Why it matters                                                         |
| -------: | --------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
|   **P0** | `get_input_routing`         | Explicit **Layer B stub**                             | An agent cannot reliably tell how physical inputs are actually routed. |
|   **P0** | `validate_avb_routing`      | Explicit **Layer B stub**                             | Blocks reliable 32R/stagebox/AVB routing validation.                   |
|   **P0** | Write tools                 | Gated, experimental, some inferred/guessed            | Unsafe for live operation until HIL-verified.                          |
|   **P1** | Fat Channel values          | Inferred/guessed pending calibration                  | EQ/dynamics advice or writes may be wrong.                             |
|   **P1** | Output routing/source names | `probe_required`, `sourceName: null`                  | Output patch validation cannot be trusted yet.                         |
|   **P1** | Hardware matrix             | Mostly 32SC; 32R/24R/16R/16 unvalidated               | Claims about StudioLive III compatibility need HIL evidence.           |
|   **P2** | Dependency / CI hygiene     | Mostly functional, but some stale/mismatched versions | Not the main blocker, but should be cleaned before release.            |
|   **P2** | Issue hygiene               | Many “completed” issues still open                    | Confuses project state and release readiness.                          |

---

## Concrete stub / placeholder findings

### 1. `get_input_routing` is the most critical explicit stub

The capability matrix marks `get_input_routing` as **stub**. The implementation description says it is a “Layer B stub” that returns a structured `not_verifiable` response and probe instructions rather than confirmed routing data. ([GitHub][2])

This is critical because real sound-engineer agents need to answer questions like:

* “Is channel 1 really receiving local input 1?”
* “Is the kick mic patched to the expected preamp?”
* “Is the stagebox source selected or local input selected?”
* “Why is this channel silent?”

Without verified input routing, the MCP can only support **diagnostic hints**, not reliable routing decisions.

### 2. `validate_avb_routing` is also an explicit stub

`validate_avb_routing` is also marked as **stub**. The raw tool source describes it as a Layer B stub for AVB / StudioLive 32R routing validation that returns `not_verifiable_with_current_adapter`. ([GitHub][2])

This is especially critical for your use case because your real setup includes StudioLive 32SC + 32R. If the MCP cannot validate AVB routing, then a soundcheck agent cannot reliably confirm that the stagebox is mapped correctly.

### 3. There are real placeholder-like probe commands

The raw tool code contains probe instructions with visibly incomplete command strings such as device placeholders not being filled in. The source around the stub tools shows probe commands with empty `--device` values and empty string entries inside probe steps. ([GitHub][3])

This is not necessarily a runtime blocker, but it is a usability blocker. A user or agent following those instructions may get unusable commands. These should be fixed even before the full Layer B implementation exists.

### 4. `validate_output_routing` is only partial

The capability matrix marks `validate_output_routing` as `probe_required`, and the resource matrix says output routing has `sourceName: null` until probing confirms the source-index mapping. ([GitHub][2])

This means the MCP may know something like “output source index X,” but not confidently map that to “Main L,” “Mix 1,” “AVB send,” etc. For live use, that is not enough.

### 5. Fat Channel support is not yet trustworthy enough for autonomous operation

The tool inventory marks `get_fat_channel` and `validate_fat_channel_for_source` as **inferred**. Write-related Fat Channel helpers are also inferred, and the capability matrix states that formulas are guessed. ([GitHub][2])

The release-readiness checklist is even clearer: Fat Channel calibration has not been run, and current values are still guessed pending `probe-fat-channel` calibration. ([GitHub][4])

For a read-only assistant, this is tolerable if confidence metadata is exposed clearly. For an agent proposing or applying EQ, gate, compressor, or HPF changes, it is a serious blocker.

---

## Usability by functional area

| Area                               |     Current usability | Assessment                                                                                               |
| ---------------------------------- | --------------------: | -------------------------------------------------------------------------------------------------------- |
| Install / project structure        |          **Moderate** | Monorepo is organized into domain, adapter, server, inspector packages. README has quick-start commands. |
| Read-only mixer state              |  **Moderate to good** | Best-supported part of the repo. Suitable for inspection and diagnostics, especially on 32SC.            |
| Metering / channel summaries       |          **Moderate** | Useful for agent context, but still should be HIL-smoke-tested with real mixer sessions.                 |
| Routing graph                      |   **Low to moderate** | Some graph structure exists, but key routing data is inferred or probe-required.                         |
| Input routing                      |               **Low** | Explicit stub. Needs real probe-backed implementation.                                                   |
| AVB / stagebox routing             |               **Low** | Explicit stub. Critical gap for 32SC + 32R workflows.                                                    |
| Output patch validation            |   **Low to moderate** | Partial source-index support, but incomplete source-name mapping.                                        |
| Fat Channel read                   |   **Low to moderate** | Exists, but parameter values/confidence need calibration.                                                |
| Fat Channel write                  |               **Low** | Guessed formulas; should stay disabled for live use.                                                     |
| Mute/fader/aux write changes       |      **Experimental** | Some write preparation tools exist, but HIL and safety review are still pending.                         |
| Multi-model StudioLive III support | **Not yet validated** | 32SC has empirical inspection; 32R/24R/16R/16 still require HIL validation.                              |

---

## Up-to-date / dependency assessment

The repository looks **recently worked on**, but not all dependencies and validation assets are release-ready.

### Acceptable / not urgent

The root package requires **Node >=20** and **pnpm >=9**, which is reasonable for a current TypeScript MCP project. The package scripts include build, test, HIL, probe, inventory, and traceability commands, which is a good sign structurally. ([GitHub][5])

### Needs review

| Dependency / area                      | Current repo state                          | Current external state              | Assessment                                                                                                                                              |
| -------------------------------------- | ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@modelcontextprotocol/sdk`            | `^1.0.0`                                    | npm latest shown as `1.29.0`        | Because of caret semver, it may float to a modern 1.x, but MCP SDK API drift should be smoke-tested and probably pinned after validation. ([GitHub][6]) |
| `zod`                                  | `^3.23.8`                                   | Zod 4 is current                    | Not urgent if stable, but a future migration plan is needed. Zod 4 may require deliberate compatibility work. ([GitHub][6])                             |
| `commander`                            | `^12.0.0`                                   | Commander 15 exists and is ESM-only | Inspector CLI can stay on 12 for now; upgrading may force ESM-related work. ([GitHub][7])                                                               |
| `vitest` / coverage plugin             | Vitest `^3.2.6`, coverage-v8 `^2.0.0`       | Major versions mismatch             | This is a likely CI/coverage fragility. Align these before treating coverage as a release gate. ([GitHub][5])                                           |
| `@featherbear/presonus-studiolive-api` | pinned `1.8.0` plus local patch assumptions | unofficial API library              | This is a core maintenance risk. The adapter depends on an unofficial library and patched UBJSON support. ([GitHub][8])                                 |

The most important dependency risk is not “old package version” alone. It is the combination of **unofficial mixer API**, **patched behavior**, and **unverified routing/Fat Channel models**.

---

## Issue tracker hygiene

The issue tracker currently weakens the project’s trust signal. Several issues are open while labelled or described as completed, including recent ones around routing, inventory, and validation work. ([GitHub][9])

That does not necessarily mean the code is unfinished. It means the repo state is hard to interpret. For release readiness, these should be split into:

1. **Closed / completed**
2. **Implemented but awaiting HIL evidence**
3. **Backlog**
4. **Known limitation / intentionally unsupported**

Right now, an outside user or agent may incorrectly treat open issues as active blockers or, worse, miss real blockers among “completed” open issues.

---

## Critical rework order

### 1. Keep all write tools gated

Do not expose write tools as default MCP capabilities for field use. The repo already gates them, which is correct. Keep that strict until mute, fader, aux-send, and Fat Channel writes have HIL evidence and rollback/safety semantics. The release checklist explicitly says write-tool HIL and safety review are still pending. ([GitHub][4])

### 2. Fix the two explicit routing stubs

Highest-priority implementation gaps:

* `get_input_routing`
* `validate_avb_routing`

At minimum, these tools should either:

* be fully implemented with probe-backed confidence, or
* remain clearly marked as unavailable and excluded from “normal” capability claims.

Currently they are visible as tools but return non-verifiable stub responses. That is acceptable for development, but not for a sound-engineer agent expected to make routing decisions.

### 3. Replace placeholder probe instructions with executable commands

The stub responses should not emit incomplete probe commands. Fix the command generation so `deviceId` is interpolated or omitted deliberately, and remove blank probe-step entries.

This is small but high-value because it turns “stub” into a useful guided diagnostic path.

### 4. Run and archive HIL probes

The release checklist lists several missing HIL gates: AUX send de-normalization, output patch source names, fader taper, Fat Channel calibration, and model validation beyond the 32SC. ([GitHub][4])

Minimum HIL evidence set:

* 32SC local input routing
* 32SC + 32R AVB stagebox routing
* output patch source-name mapping
* aux send pre/post behavior
* fader taper mapping
* mute/fader write round-trip
* Fat Channel parameter calibration

### 5. Promote confidence-tagged capabilities only after evidence

The capability vocabulary is good: `observed`, `inferred`, `probe_required`, `stub`, `not_verifiable`, `planned`. Keep that model. But the user-facing tool descriptions and README should avoid sounding more complete than the confidence tags justify. ([GitHub][2])

### 6. Clean dependency and CI friction

Before a release tag beyond `0.1.x`:

* align Vitest and coverage plugin major versions;
* decide whether to pin or float MCP SDK;
* document why Zod 3 remains intentional or migrate to Zod 4;
* keep Commander 12 unless ESM migration is planned;
* document the exact local patch to `@featherbear/presonus-studiolive-api`.

---

## Bottom line

The repository is **not empty or fake**; it has a real MCP/server/domain/adapter structure and a useful read-mostly base. But for your stated goal — a real sound-engineer agent operating against StudioLive 32SC/32R — the most critical unfinished work is:

1. **Input routing implementation**
2. **AVB/stagebox routing validation**
3. **Fat Channel calibration**
4. **Write-tool HIL and safety validation**
5. **Output patch source-name mapping**
6. **Issue/claim cleanup so agents do not over-trust incomplete tools**

The repo is currently best described as:

> **Experimental read-mostly MCP backend with useful inspection tooling, but routing, AVB, Fat Channel, and write-control paths are not yet sufficiently verified for live autonomous operation.**

[1]: https://github.com/zarfld/presonus-studiolive-mcp "GitHub - zarfld/presonus-studiolive-mcp: MCP server using featherbear / presonus-studiolive-ap · GitHub"
[2]: https://github.com/zarfld/presonus-studiolive-mcp/blob/master/docs/capability-matrix.generated.md "presonus-studiolive-mcp/docs/capability-matrix.generated.md at master · zarfld/presonus-studiolive-mcp · GitHub"
[3]: https://github.com/zarfld/presonus-studiolive-mcp/raw/refs/heads/master/packages/presonus-mcp-server/src/tools.ts "raw.githubusercontent.com"
[4]: https://github.com/zarfld/presonus-studiolive-mcp/blob/master/docs/release-readiness-checklist.md "presonus-studiolive-mcp/docs/release-readiness-checklist.md at master · zarfld/presonus-studiolive-mcp · GitHub"
[5]: https://github.com/zarfld/presonus-studiolive-mcp/blob/master/package.json "presonus-studiolive-mcp/package.json at master · zarfld/presonus-studiolive-mcp · GitHub"
[6]: https://github.com/zarfld/presonus-studiolive-mcp/blob/master/packages/presonus-mcp-server/package.json "presonus-studiolive-mcp/packages/presonus-mcp-server/package.json at master · zarfld/presonus-studiolive-mcp · GitHub"
[7]: https://github.com/zarfld/presonus-studiolive-mcp/blob/master/packages/presonus-inspector/package.json "presonus-studiolive-mcp/packages/presonus-inspector/package.json at master · zarfld/presonus-studiolive-mcp · GitHub"
[8]: https://github.com/zarfld/presonus-studiolive-mcp/blob/master/packages/presonus-adapter/package.json "presonus-studiolive-mcp/packages/presonus-adapter/package.json at master · zarfld/presonus-studiolive-mcp · GitHub"
[9]: https://github.com/zarfld/presonus-studiolive-mcp/issues "Issues · zarfld/presonus-studiolive-mcp · GitHub"
