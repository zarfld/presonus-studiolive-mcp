# Requirements Traceability Matrix

> **Auto-generated** by `pnpm traceability`. Do not edit manually.
> **Repository**: `zarfld/presonus-studiolive-mcp`
> **Standard**: ISO/IEC/IEEE 29148:2018
> **Note**: HIL tests exist as files but are NOT run in CI â€” real hardware required.

## Summary

| Status | Count |
|---|---|
| `complete` | 45 |
| `implemented_not_verified` | 28 |
| `manual_review_required` | 5 |
| `planned` | 3 |
| `probe_blocked` | 4 |
| `stale_closed_issue` | 1 |

## Requirement Matrix (REQ-F / REQ-NF)

| Issue | Type | Title | State | Capability | Confidence | Status | @implements | @verifies | HIL tests | Gaps |
|---|---|---|---|---|---|---|---|---|---|---|
| [#15](https://github.com/zarfld/presonus-studiolive-mcp/issues/15) | REQ-F | REQ-F-001: Auto-discover StudioLive III mixers on local | âœ… | `discover_mixers` | `observed` | `implemented_not_verified` | 4 | 0 | 0 | no @verifies annotation found in tests |
| [#16](https://github.com/zarfld/presonus-studiolive-mcp/issues/16) | REQ-F | REQ-F-002: Identify each mixer by stable serial number  | âœ… | `validate_mixer_identity` | `observed` | `implemented_not_verified` | 3 | 0 | 0 | no @verifies annotation found in tests |
| [#17](https://github.com/zarfld/presonus-studiolive-mcp/issues/17) | REQ-F | REQ-F-003: Expose normalized channel list as MCP resour | âœ… | `mixers` | `observed` | `implemented_not_verified` | 3 | 0 | 0 | no @verifies annotation found in tests |
| [#18](https://github.com/zarfld/presonus-studiolive-mcp/issues/18) | REQ-F | REQ-F-004: Expose meter summary (silent/active/clipping | âœ… | `mixer-meters-summary` | `observed` | `implemented_not_verified` | 3 | 0 | 0 | no @verifies annotation found in tests |
| [#19](https://github.com/zarfld/presonus-studiolive-mcp/issues/19) | REQ-F | REQ-F-005: Expose current scene/project as MCP resource | âœ… | `mixer-scene-current` | `observed` | `implemented_not_verified` | 2 | 0 | 0 | no @verifies annotation found in tests |
| [#20](https://github.com/zarfld/presonus-studiolive-mcp/issues/20) | REQ-F | REQ-F-006: presonus-probe CLI shall dump complete mixer | âœ… | `mixer-raw-state` | `observed` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |
| [#21](https://github.com/zarfld/presonus-studiolive-mcp/issues/21) | REQ-NF | REQ-NF-001: Discovery response time shall be ≤ 5 s (95t | âœ… | - | - | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#22](https://github.com/zarfld/presonus-studiolive-mcp/issues/22) | REQ-NF | REQ-NF-002: Zero write-capable MCP tools shall be regis | âœ… | - | - | `implemented_not_verified` | 5 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#23](https://github.com/zarfld/presonus-studiolive-mcp/issues/23) | REQ-NF | REQ-NF-003: State cache shall reflect mixer changes wit | âœ… | - | - | `implemented_not_verified` | 3 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#24](https://github.com/zarfld/presonus-studiolive-mcp/issues/24) | REQ-NF | REQ-NF-004: MCP server shall be operational (stdio read | âœ… | - | - | `implemented_not_verified` | 3 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#30](https://github.com/zarfld/presonus-studiolive-mcp/issues/30) | REQ-NF | REQ-NF-ROUT-001: All routing responses shall include ex | âœ… | - | - | `implemented_not_verified` | 3 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#31](https://github.com/zarfld/presonus-studiolive-mcp/issues/31) | REQ-F | REQ-F-ROUT-001: Expose per-channel AUX/FX/SUB send rout | âœ… | - | - | `implemented_not_verified` | 2 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#32](https://github.com/zarfld/presonus-studiolive-mcp/issues/32) | REQ-F | REQ-F-ROUT-002: get_routing_graph tool — consolidated r | âœ… | `get_routing_graph` | `probe_required` | `probe_blocked` | 2 | 0 | 0 | no @verifies annotation found in tests; HIL test with @verifies required (probe_required capability); cannot verify in CI |
| [#33](https://github.com/zarfld/presonus-studiolive-mcp/issues/33) | REQ-F | REQ-F-ROUT-003: validate_input_routing tool — meter + m | âœ… | `validate_input_routing` | `not_verifiable_with_current_adapter` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |
| [#34](https://github.com/zarfld/presonus-studiolive-mcp/issues/34) | REQ-F | REQ-F-ROUT-004: validate_stagebox_routing tool — stageb | âœ… | `validate_stagebox_routing` | `probe_required` | `probe_blocked` | 1 | 0 | 0 | no @verifies annotation found in tests; HIL test with @verifies required (probe_required capability); cannot verify in CI |
| [#35](https://github.com/zarfld/presonus-studiolive-mcp/issues/35) | REQ-F | REQ-F-ROUT-005: diagnose_no_signal_routing tool — struc | âœ… | `diagnose_no_signal_routing` | `inferred` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |
| [#36](https://github.com/zarfld/presonus-studiolive-mcp/issues/36) | REQ-F | REQ-F-ROUT-006: detect_possible_patch_swap tool — cross | âœ… | `detect_possible_patch_swap` | `inferred` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |
| [#37](https://github.com/zarfld/presonus-studiolive-mcp/issues/37) | REQ-F | REQ-F-ROUT-007: Expose output patch router as MCP resou | âœ… | - | - | `complete` | 3 | 1 | 0 | no MCP capability mapped to this requirement |
| [#38](https://github.com/zarfld/presonus-studiolive-mcp/issues/38) | REQ-F | REQ-F-ROUT-008: RoutingKind + MixerRoute unified type w | âœ… | - | - | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#39](https://github.com/zarfld/presonus-studiolive-mcp/issues/39) | REQ-F | REQ-F-ROUT-009: FX send assignment (assign_FXA–FXH) ext | âœ… | - | - | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#40](https://github.com/zarfld/presonus-studiolive-mcp/issues/40) | REQ-F | REQ-F-ROUT-010: Non-LINE channel AUX routing (RETURN, F | âœ… | `validate_output_patch_labels` | `probe_required` | `probe_blocked` | 3 | 0 | 0 | no @verifies annotation found in tests; HIL test with @verifies required (probe_required capability); cannot verify in CI |
| [#41](https://github.com/zarfld/presonus-studiolive-mcp/issues/41) | REQ-F | REQ-F-AUX-002: find_missing_monitor_sends tool (zero-ex | âœ… | `get_aux_mix` | `inferred` | `complete` | 4 | 1 | 0 | - |
| [#42](https://github.com/zarfld/presonus-studiolive-mcp/issues/42) | REQ-F | REQ-F-AUX-003: find_muted_monitor_sends tool (muted sen | âœ… | `validate_monitor_requirements` | `inferred` | `complete` | 2 | 1 | 0 | - |
| [#43](https://github.com/zarfld/presonus-studiolive-mcp/issues/43) | REQ-F | REQ-F-AUX-004: find_hot_monitor_sends tool (configurabl | âœ… | `find_muted_monitor_sends` | `observed` | `complete` | 2 | 1 | 0 | - |
| [#44](https://github.com/zarfld/presonus-studiolive-mcp/issues/44) | REQ-F | REQ-F-AUX-005: validate_aux_mix tool (zero-expectation  | âœ… | `find_hot_monitor_sends` | `observed` | `complete` | 2 | 1 | 0 | - |
| [#45](https://github.com/zarfld/presonus-studiolive-mcp/issues/45) | REQ-F | REQ-F-ROUT-011: Layer B routing stubs (get_input_routin | âœ… | `validate_channel_setup` | `observed` | `complete` | 10 | 2 | 0 | - |
| [#46](https://github.com/zarfld/presonus-studiolive-mcp/issues/46) | REQ-F | REQ-F-PROBE-002: probe-routing CLI command with --kind  | âœ… | `complete_routing_probe` | `observed` | `complete` | 3 | 1 | 0 | - |
| [#74](https://github.com/zarfld/presonus-studiolive-mcp/issues/74) | REQ-F | REQ-F-DIAG-002: analyze_line_check_step — active channe | âœ… | `analyze_line_check_step` | `observed` | `implemented_not_verified` | 2 | 0 | 0 | no @verifies annotation found in tests |
| [#76](https://github.com/zarfld/presonus-studiolive-mcp/issues/76) | REQ-F | REQ-F-DIAG-003: check_required_setup — rider capacity v | âœ… | - | - | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests; no MCP capability mapped to this requirement |
| [#78](https://github.com/zarfld/presonus-studiolive-mcp/issues/78) | REQ-F | REQ-F-DIAG-001: diagnose_channel — per-channel mute/fad | âœ… | `diagnose_channel` | `observed` | `implemented_not_verified` | 2 | 0 | 0 | no @verifies annotation found in tests |
| [#79](https://github.com/zarfld/presonus-studiolive-mcp/issues/79) | REQ-F | REQ-F-DIAG-004: get_mixer_capabilities — expose mixer h | âœ… | `get_mixer_capabilities` | `observed` | `stale_closed_issue` | 0 | 0 | 0 | no @implements annotation found in source; no @verifies annotation found in tests |
| [#84](https://github.com/zarfld/presonus-studiolive-mcp/issues/84) | REQ-F | REQ-F-FLEXMIX-001: FlexMix bus mode classification and  | âœ… | - | - | `complete` | 1 | 1 | 0 | no MCP capability mapped to this requirement |
| [#85](https://github.com/zarfld/presonus-studiolive-mcp/issues/85) | REQ-F | REQ-F-FIXEDSUB-001: Fixed subgroup bus routing extracti | âœ… | - | - | `complete` | 1 | 1 | 0 | no MCP capability mapped to this requirement |
| [#86](https://github.com/zarfld/presonus-studiolive-mcp/issues/86) | REQ-F | REQ-F-WRITE-005: Channel rename and group membership ma | ðŸ”µ | `list_sub_groups` | `observed` | `implemented_not_verified` | 5 | 0 | 0 | no @verifies annotation found in tests |
| [#88](https://github.com/zarfld/presonus-studiolive-mcp/issues/88) | REQ-F | REQ-F-INP-002: Validate patch sheet for conflicts and r | ðŸ”µ | `validate_output_routing` | `probe_required` | `probe_blocked` | 2 | 0 | 0 | no @verifies annotation found in tests; HIL test with @verifies required (probe_required capability); cannot verify in CI |
| [#89](https://github.com/zarfld/presonus-studiolive-mcp/issues/89) | REQ-F | REQ-F-INP-001: Validate agent-provided input list again | ðŸ”µ | `validate_input_list_against_mixer` | `observed` | `complete` | 3 | 1 | 0 | - |
| [#90](https://github.com/zarfld/presonus-studiolive-mcp/issues/90) | REQ-F | REQ-F-PROBE-001: Layer B promotion — capture baseline s | ðŸ”µ | `start_routing_probe` | `observed` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |
| [#91](https://github.com/zarfld/presonus-studiolive-mcp/issues/91) | REQ-F | REQ-F-INP-003: Render printable patch sheet data from m | ðŸ”µ | `render_patch_sheet_data` | `observed` | `implemented_not_verified` | 2 | 0 | 0 | no @verifies annotation found in tests |
| [#92](https://github.com/zarfld/presonus-studiolive-mcp/issues/92) | REQ-F | REQ-F-MON-002: Validate stereo monitor pair consistency | ðŸ”µ | `validate_stereo_monitor_pair` | `inferred` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |
| [#93](https://github.com/zarfld/presonus-studiolive-mcp/issues/93) | REQ-F | REQ-F-MON-001: Infer monitor mix layout (stereo IEM pai | ðŸ”µ | `get_monitor_mix_layout` | `inferred` | `implemented_not_verified` | 2 | 0 | 0 | no @verifies annotation found in tests |
| [#94](https://github.com/zarfld/presonus-studiolive-mcp/issues/94) | REQ-F | REQ-F-MON-003: Validate monitor mix names against rider | ðŸ”µ | `validate_monitor_mix_names` | `observed` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |
| [#95](https://github.com/zarfld/presonus-studiolive-mcp/issues/95) | REQ-F | REQ-F-FAT-001: Expose per-channel Fat Channel DSP state | ðŸ”µ | `get_fat_channel` | `inferred` | `implemented_not_verified` | 3 | 0 | 0 | no @verifies annotation found in tests |
| [#96](https://github.com/zarfld/presonus-studiolive-mcp/issues/96) | REQ-F | REQ-F-FAT-002: Validate Fat Channel settings for declar | ðŸ”µ | `validate_fat_channel_for_source` | `inferred` | `implemented_not_verified` | 1 | 0 | 0 | no @verifies annotation found in tests |

## Probe/HIL-Blocked Requirements

> These requirements map to `probe_required` capabilities or need HIL evidence.
> They cannot be fully verified in CI. Hardware validation is required.

| Issue | Type | Title | Status | Capability |
|---|---|---|---|---|
| [#32](https://github.com/zarfld/presonus-studiolive-mcp/issues/32) | REQ-F | REQ-F-ROUT-002: get_routing_graph tool — consolidated routin | `probe_blocked` | `get_routing_graph` |
| [#34](https://github.com/zarfld/presonus-studiolive-mcp/issues/34) | REQ-F | REQ-F-ROUT-004: validate_stagebox_routing tool — stagebox pr | `probe_blocked` | `validate_stagebox_routing` |
| [#40](https://github.com/zarfld/presonus-studiolive-mcp/issues/40) | REQ-F | REQ-F-ROUT-010: Non-LINE channel AUX routing (RETURN, FXRETU | `probe_blocked` | `validate_output_patch_labels` |
| [#88](https://github.com/zarfld/presonus-studiolive-mcp/issues/88) | REQ-F | REQ-F-INP-002: Validate patch sheet for conflicts and range  | `probe_blocked` | `validate_output_routing` |

## Architecture / Test / StR Items

| Issue | Type | Title | State | Status |
|---|---|---|---|---|
| [#1](https://github.com/zarfld/presonus-studiolive-mcp/issues/1) | StR | Multi-mixer discovery and state inventory for AI context pro | âœ… | `complete` |
| [#2](https://github.com/zarfld/presonus-studiolive-mcp/issues/2) | StR | Show preparation from rider documents (input list, patch pla | ðŸ”µ | `planned` |
| [#3](https://github.com/zarfld/presonus-studiolive-mcp/issues/3) | StR | Soundcheck assistance via read-only mixer diagnostics | âœ… | `complete` |
| [#4](https://github.com/zarfld/presonus-studiolive-mcp/issues/4) | StR | Routing validation between FOH and stagebox mixer units | ðŸ”µ | `planned` |
| [#5](https://github.com/zarfld/presonus-studiolive-mcp/issues/5) | StR | Safety constraint: no autonomous live mixing by AI agents | âœ… | `complete` |
| [#6](https://github.com/zarfld/presonus-studiolive-mcp/issues/6) | ADR | ADR-001: Use TypeScript/Node.js 20+ as implementation langua | âœ… | `complete` |
| [#7](https://github.com/zarfld/presonus-studiolive-mcp/issues/7) | ADR | ADR-002: Three-layer architecture (Raw PreSonus → Normalized | âœ… | `complete` |
| [#8](https://github.com/zarfld/presonus-studiolive-mcp/issues/8) | ADR | ADR-003: pnpm monorepo with four packages (domain, adapter,  | âœ… | `complete` |
| [#9](https://github.com/zarfld/presonus-studiolive-mcp/issues/9) | ADR | ADR-004: Use @featherbear/presonus-studiolive-api v1.8.0 as  | âœ… | `complete` |
| [#10](https://github.com/zarfld/presonus-studiolive-mcp/issues/10) | ADR | ADR-005: Read-only-first policy; write operations require ex | âœ… | `complete` |
| [#11](https://github.com/zarfld/presonus-studiolive-mcp/issues/11) | ARC-C | ARC-C-001: presonus-domain package — Zod schemas for normali | âœ… | `complete` |
| [#12](https://github.com/zarfld/presonus-studiolive-mcp/issues/12) | ARC-C | ARC-C-002: presonus-adapter package — featherbear wrapper, s | âœ… | `complete` |
| [#13](https://github.com/zarfld/presonus-studiolive-mcp/issues/13) | ARC-C | ARC-C-003: presonus-inspector package — probe CLI for hardwa | âœ… | `complete` |
| [#14](https://github.com/zarfld/presonus-studiolive-mcp/issues/14) | ARC-C | ARC-C-004: presonus-mcp-server package — MCP resources, tool | âœ… | `complete` |
| [#25](https://github.com/zarfld/presonus-studiolive-mcp/issues/25) | QA-SC | QA-SC-001: Soundcheck diagnosis — state cache reflects mixer | âœ… | `complete` |
| [#26](https://github.com/zarfld/presonus-studiolive-mcp/issues/26) | QA-SC | QA-SC-002: Safety boundary — zero write tools callable in de | âœ… | `complete` |
| [#27](https://github.com/zarfld/presonus-studiolive-mcp/issues/27) | QA-SC | QA-SC-003: Reliability — server serves cached state and reco | âœ… | `complete` |
| [#29](https://github.com/zarfld/presonus-studiolive-mcp/issues/29) | ADR | ADR-007: Routing domain — read-only-first with explicit not_ | âœ… | `complete` |
| [#47](https://github.com/zarfld/presonus-studiolive-mcp/issues/47) | ADR | ADR-008: Two-layer routing model — observable (Layer A) vs p | âœ… | `complete` |
| [#48](https://github.com/zarfld/presonus-studiolive-mcp/issues/48) | QA-SC | QA-SC-AUX-001: AUX monitor tool response latency under live  | ðŸ”µ | `planned` |
| [#49](https://github.com/zarfld/presonus-studiolive-mcp/issues/49) | QA-SC | QA-SC-ROUT-001: Routing confidence propagation — unverified  | âœ… | `complete` |
| [#50](https://github.com/zarfld/presonus-studiolive-mcp/issues/50) | QA-SC | QA-SC-PROBE-001: probe-routing --kind filter completeness an | âœ… | `complete` |
| [#51](https://github.com/zarfld/presonus-studiolive-mcp/issues/51) | TEST | TEST: Output patch router resource extraction — REQ-F-ROUT-0 | âœ… | `complete` |
| [#52](https://github.com/zarfld/presonus-studiolive-mcp/issues/52) | TEST | TEST: RoutingKind + MixerRoute schema validation — REQ-F-ROU | âœ… | `complete` |
| [#53](https://github.com/zarfld/presonus-studiolive-mcp/issues/53) | TEST | TEST: FX send assignment extraction (assign_FXA-H) — REQ-F-R | âœ… | `complete` |
| [#54](https://github.com/zarfld/presonus-studiolive-mcp/issues/54) | TEST | TEST: Non-LINE channel AUX routing extraction (RETURN, FXRET | âœ… | `complete` |
| [#55](https://github.com/zarfld/presonus-studiolive-mcp/issues/55) | TEST | TEST: AUX mix extraction from flat state (find_missing_monit | âœ… | `complete` |
| [#56](https://github.com/zarfld/presonus-studiolive-mcp/issues/56) | TEST | TEST: find_muted_monitor_sends — muted_send audit schema val | âœ… | `complete` |
| [#57](https://github.com/zarfld/presonus-studiolive-mcp/issues/57) | TEST | TEST: find_hot_monitor_sends — hot_send threshold schema val | âœ… | `complete` |
| [#58](https://github.com/zarfld/presonus-studiolive-mcp/issues/58) | TEST | TEST: validate_aux_mix combined audit schema — REQ-F-AUX-005 | âœ… | `complete` |
| [#59](https://github.com/zarfld/presonus-studiolive-mcp/issues/59) | TEST | TEST: Layer B routing stub tool registration and response st | âœ… | `complete` |
| [#60](https://github.com/zarfld/presonus-studiolive-mcp/issues/60) | TEST | TEST: probe-routing --kind filter patterns and VALID_KINDS c | âœ… | `complete` |
| [#61](https://github.com/zarfld/presonus-studiolive-mcp/issues/61) | QA-SC | QA-SC-MCP-001: MCP resource completeness, freshness, and rea | âœ… | `complete` |
| [#62](https://github.com/zarfld/presonus-studiolive-mcp/issues/62) | TEST | TEST: Mixer auto-discovery and stable serial identification  | âœ… | `complete` |
| [#80](https://github.com/zarfld/presonus-studiolive-mcp/issues/80) | TEST | TEST-DIAG-004: get_mixer_capabilities MCP tool — capabilitie | âœ… | `complete` |
| [#81](https://github.com/zarfld/presonus-studiolive-mcp/issues/81) | TEST | TEST-DIAG-002: analyze_line_check_step MCP tool — silent/une | âœ… | `complete` |
| [#82](https://github.com/zarfld/presonus-studiolive-mcp/issues/82) | TEST | TEST-DIAG-003: check_required_setup MCP tool — ok/insufficie | âœ… | `complete` |
| [#83](https://github.com/zarfld/presonus-studiolive-mcp/issues/83) | TEST | TEST-DIAG-001: diagnose_channel MCP tool — mute/fader/gate/o | âœ… | `complete` |

## Orphan @implements Annotations (no GitHub issue number)

> Create a GitHub issue for each REQ-ID and back-fill `#N` in the annotation.

| File | Line | REQ-ID |
|---|---|---|
| `packages/presonus-domain/src/__tests__/fat-channel.test.ts` | 18 | `REQ-F-FAT-001` |

---

*Generated by `pnpm traceability` / `scripts/github-issues-to-traceability-json.py`*
*HIL tests exist as source files but require real PreSonus hardware to execute.*
