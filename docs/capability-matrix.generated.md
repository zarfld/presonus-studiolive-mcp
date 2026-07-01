# MCP Capability Matrix

> **Auto-generated** by `pnpm inventory`. Do not edit manually — run `pnpm inventory` to regenerate.

## Summary

| Metric | Count |
|---|---|
| Always-available tools | 34 |
| Write-gated tools (require `writeEnabled: true`) | 10 |
| Total tools | 44 |
| Total resources | 14 |

> **Note**: Write-gated tools are NOT registered in the default configuration
> (`writeEnabled: false`). They require explicit opt-in. See `AGENTS.addendum.md` rule #5.

## Confidence vocabulary

| Value | Meaning |
|---|---|
| `observed` | Confirmed by probe diff-state on real hardware |
| `inferred` | Key patterns observed; formula/mapping plausible, not probe-confirmed |
| `probe_required` | Must not be trusted until probe diff-state is run |
| `stub` | Tool returns probe instructions only; Layer B placeholder |
| `not_verifiable_with_current_adapter` | Permanently unobservable via current protocol |
| `planned` | Requirement exists; implementation not yet present |

## Tools

| Name | Availability | Confidence | Safety class | Traceability |
|---|---|---|---|---|
| `discover_mixers` | `always` | `observed` | `read-only` | #15 REQ-F-001 |
| `refresh_mixer_state` | `always` | `observed` | `read-only` | #15 REQ-F-001 |
| `validate_mixer_identity` | `always` | `observed` | `diagnostic` | #16 REQ-F-002 |
| `get_routing_graph` | `always` | `probe_required` | `read-only` | #32 REQ-F-ROUT-002 |
| `validate_input_routing` | `always` | `not_verifiable_with_current_adapter` | `diagnostic` | #33 REQ-F-ROUT-003 |
| `validate_stagebox_routing` | `always` | `probe_required` | `diagnostic` | #34 REQ-F-ROUT-004 |
| `diagnose_no_signal_routing` | `always` | `inferred` | `diagnostic` | #35 REQ-F-ROUT-005 |
| `detect_possible_patch_swap` | `always` | `inferred` | `diagnostic` | #36 REQ-F-ROUT-006 |
| `get_mixer_capabilities` | `always` | `observed` | `read-only` | #79 REQ-F-DIAG-004 |
| `analyze_line_check_step` | `always` | `observed` | `read-only` | #74 REQ-F-DIAG-002 |
| `diagnose_channel` | `always` | `observed` | `diagnostic` | #78 REQ-F-DIAG-001 |
| `get_aux_mix` | `always` | `inferred` | `read-only` | #41 REQ-F-AUX-002 |
| `validate_monitor_requirements` | `always` | `inferred` | `diagnostic` | #42 REQ-F-AUX-003 |
| `validate_channel_setup` | `always` | `observed` | `diagnostic` | #45 REQ-F-ROUT-011 |
| `check_required_setup` | `always` | `observed` | `diagnostic` | #45 REQ-F-ROUT-011 |
| `find_missing_monitor_sends` | `always` | `observed` | `diagnostic` | #45 REQ-F-ROUT-011 |
| `find_muted_monitor_sends` | `always` | `observed` | `diagnostic` | #43 REQ-F-AUX-004 |
| `find_hot_monitor_sends` | `always` | `observed` | `diagnostic` | #44 REQ-F-AUX-005 |
| `validate_aux_mix` | `always` | `observed` | `diagnostic` | #43 REQ-F-AUX-004 |
| `get_input_routing` | `always` | `inferred` | `diagnostic` | #45 REQ-F-ROUT-011 |
| `validate_avb_routing` | `always` | `observed` | `diagnostic` | #45 REQ-F-ROUT-011 |
| `validate_output_routing` | `always` | `probe_required` | `diagnostic` | REQ-F-INP-002 |
| `start_routing_probe` | `always` | `observed` | `read-only` | REQ-F-PROBE-001 |
| `complete_routing_probe` | `always` | `observed` | `read-only` | REQ-F-PROBE-002 |
| `validate_input_list_against_mixer` | `always` | `observed` | `diagnostic` | REQ-F-INP-001 |
| `validate_patch_sheet` | `always` | `observed` | `read-only` | REQ-F-INP-002 |
| `render_patch_sheet_data` | `always` | `observed` | `read-only` | REQ-F-INP-003 |
| `get_monitor_mix_layout` | `always` | `inferred` | `read-only` | REQ-F-MON-001 |
| `validate_stereo_monitor_pair` | `always` | `inferred` | `diagnostic` | REQ-F-MON-002 |
| `validate_monitor_mix_names` | `always` | `observed` | `diagnostic` | REQ-F-MON-003 |
| `validate_output_patch_labels` | `always` | `probe_required` | `diagnostic` | REQ-F-ROUT-010 |
| `get_fat_channel` | `always` | `inferred` | `read-only` | REQ-F-FAT-001 |
| `validate_fat_channel_for_source` | `always` | `inferred` | `diagnostic` | REQ-F-FAT-002 |
| `list_sub_groups` | `always` | `observed` | `read-only` | REQ-F-WRITE-005b #86 |
| `propose_eq_change` | `write-gated` | `inferred` | `write-proposed` | ADR-006 (EQ de-normalization formulas unverified — changeSetConfidence: guessed) |
| `apply_change_set` | `write-gated` | `inferred` | `write-applied` | ADR-006 |
| `prepare_mute_change_set` | `write-gated` | `observed` | `write-proposed` | ADR-006 (mute key confirmed on 32SC) |
| `prepare_fader_change_set` | `write-gated` | `inferred` | `write-proposed` | ADR-006 (fader taper not probe-confirmed — changeSetConfidence: guessed) |
| `prepare_aux_send_change_set` | `write-gated` | `inferred` | `write-proposed` | ADR-006 (aux send key observed; de-normalization unverified — changeSetConfidence: inferred) |
| `prepare_fat_channel_change_set` | `write-gated` | `inferred` | `write-proposed` | ADR-006 (all formulas guessed — changeSetConfidence: guessed) |
| `validate_change_set` | `write-gated` | `observed` | `write-proposed` | ADR-006 |
| `prepare_channel_rename_change_set` | `write-gated` | `observed` | `write-proposed` | REQ-F-WRITE-005a #86 (username key confirmed) |
| `prepare_sub_group_membership_change_set` | `write-gated` | `observed` | `write-proposed` | REQ-F-WRITE-005c #86 (sub1-4 keys confirmed) |
| `prepare_aux_assignment_change_set` | `write-gated` | `observed` | `write-proposed` | REQ-F-WRITE-005d #86 (assign_auxN key confirmed) |

## Resources

| Name | URI template | Confidence | Traceability |
|---|---|---|---|
| `mixers` | `presonus://mixers` | `observed` | #17 REQ-F-003 |
| `mixer-channels` | `presonus://mixer/{deviceId}/channels` | `observed` | #17 REQ-F-003 |
| `mixer-meters-summary` | `presonus://mixer/{deviceId}/meters/summary` | `observed` | #18 REQ-F-004 |
| `mixer-scene-current` | `presonus://mixer/{deviceId}/scene/current` | `observed` | #19 REQ-F-005 |
| `mixer-raw-state` | `presonus://mixer/{deviceId}/raw/state` | `observed` | #20 REQ-F-006 |
| `mixer-routing` | `presonus://mixer/{deviceId}/routing` | `inferred` | #32 REQ-F-ROUT-002 (parameterConfidence=inferred until AUX probe calibration) |
| `mixer-routing-outputs` | `presonus://mixer/{deviceId}/routing/outputs` | `probe_required` | #32 REQ-F-ROUT-002 (sourceName=null until probe diff-state run) |
| `mixer-auxes` | `presonus://mixer/{deviceId}/auxes` | `inferred` | #41 REQ-F-AUX-002 (prePost=unknown until hardware probed) |
| `mixer-fx-sends` | `presonus://mixer/{deviceId}/fx-sends` | `inferred` | ADR-008 Layer A (assign_FXA key pattern inferred) |
| `mixer-monitor-routing` | `presonus://mixer/{deviceId}/monitor-routing` | `inferred` | ADR-008 Layer A |
| `mixer-fat-channel` | `presonus://mixer/{deviceId}/fat-channel/{channelId}` | `inferred` | REQ-F-FAT-001 (parameter values guessed — parameterConfidence: guessed) |
| `mixer-monitor-layout` | `presonus://mixer/{deviceId}/monitor-layout` | `inferred` | REQ-F-MON-001 (pair inference confidence=inferred until operator-confirmed) |
| `mixer-output-patch-labels` | `presonus://mixer/{deviceId}/output-patch/labels` | `probe_required` | REQ-F-ROUT-010 (source names null until probe-routing diff --kind bus-to-output) |
| `mixer-graph` | `presonus://mixer-graph/current` | `inferred` | #32 REQ-F-ROUT-002 |
