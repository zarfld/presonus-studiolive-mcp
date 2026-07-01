# Sound-Engineer Agent Capability Matrix

This matrix defines what the **MCP backend provides** versus what the
**consuming sound-engineer agent** must decide versus what requires
**human operator action**.

> **Purpose**: Prevent the agent from treating MCP backend facts as decisions,
> and from treating its own inferences as hardware-verified facts.

---

## Confidence vocabulary

| Value | Meaning |
|---|---|
| `observed` | Confirmed from live mixer state; hardware-verified |
| `inferred` | Derived from live state; formula or mapping not probe-confirmed |
| `probe_required` | Reliable only after an operator-driven probe session |
| `stub` | Returns probe instructions only; no meaningful data |
| `not_verifiable` | Cannot be known by software |
| `guessed` | Best-estimate de-normalization; verify before acting |

---

## Capability matrix

| Task | MCP Backend Provides | Confidence | Agent Decides | Human / Manual Required |
|---|---|---|---|---|
| **Discover / identify mixer** | `discover_mixers` → device list with serial, model, firmware, IP, role; `validate_mixer_identity` → confirms identity matches expected | `observed` | Whether the discovered device is the correct mixer for this show | None — fully automated |
| **Read channel names** | `presonus://mixer/{id}/channels` → name, color; `validate_channel_setup` → name matches rider expectation | `observed` | Which channel names are correct per the rider; flag discrepancies | Operator confirms physical labelling |
| **Read fader / mute state** | `presonus://mixer/{id}/channels` → mute, fader (raw linear value); `diagnose_channel` → fader/mute diagnosis | `observed` (mute key); `guessed` (fader formula — taper not confirmed) | Whether fader level is musically appropriate; which channels should be muted | Operator adjusts physical fader if needed |
| **Diagnose silent channel** | `diagnose_channel`, `analyze_line_check_step` → mute/fader/gate/signal status, likely causes, safe next steps; `diagnose_no_signal_routing` → routing causes | `observed` (mute/name/meter); `not_verifiable` (physical cable) | Root cause assessment based on all returned clues | Operator checks physical cables and patch bay (software cannot see cables) |
| **Validate AUX monitor sends** | `validate_aux_mix` → missing/muted/hot sends; `find_missing_monitor_sends`; `get_aux_mix` → raw send levels per channel; `validate_monitor_requirements` → send levels vs. rider expectations | `observed` (send assignment); `inferred` (send level formula) | Whether send levels are musically appropriate; which IEM/wedge needs adjustment | Operator adjusts send levels based on performer feedback |
| **Validate AVB routing** | `validate_avb_routing` → `not_verifiable_with_current_adapter`; returns probe instructions | `stub` | Nothing — must initiate probe workflow | Operator runs probe-routing session with 32R hardware connected; MCP reports changed keys |
| **Validate physical input routing** | `validate_input_routing` → meter signal, mute, name check; `get_input_routing` → probe instructions only | `observed` (meter/name/mute); `not_verifiable` (cable path) | Signal presence interpretation; which cable to check | Operator checks XLR/TRS patch physically |
| **Apply EQ change** | `propose_eq_change` → `ProposedChangeSet` (gated, 60 s TTL); `apply_change_set` → hardware write; `changeSetConfidence: 'guessed'` on all EQ proposals | `guessed` (all EQ de-norm formulas) | Whether the proposed EQ values make musical sense; whether to apply | Operator reviews proposed change, provides confirmation note; applies at own risk (values may not be dB-accurate) |
| **Apply mute change** | `prepare_mute_change_set` → `ProposedChangeSet`; `changeSetConfidence: 'observed'` | `observed` (mute key confirmed) | Which channels to mute, in what order, and why | Operator applies change set explicitly; must be write-enabled |
| **Rename channel** | `prepare_channel_rename_change_set` → `ProposedChangeSet`; `changeSetConfidence: 'observed'` | `observed` (username key confirmed) | The correct new name per the show rider | Operator confirms name and applies; physical scribble strip updated |
| **Build input list from rider** | `get_mixer_capabilities` → line inputs, aux buses, FX buses; `validate_input_list_against_mixer` → validates agent-provided list against mixer | `observed` (capacities) | Read the rider document; assign inputs to channels; build the input list | Operator provides the rider; agent cannot read paper riders |
| **Plan soundcheck** | `validate_channel_setup`, `analyze_line_check_step` → per-channel status; `validate_monitor_requirements` → monitor send gaps | `observed` (setup facts) | Soundcheck sequence; which channels to check in what order; when to move to FOH vs. monitors | Operator performs physical soundcheck with performers |
| **Recommend Fat Channel settings** | `get_fat_channel` → current EQ/comp/gate state; `validate_fat_channel_for_source` → settings vs. source type; `parameterConfidence: 'guessed'` | `inferred`/`guessed` (parameter values) | Whether recommended settings are appropriate for the source and room; which model to use | Operator makes final DSP decisions by ear; Fat Channel values are not dB-accurate until probe-calibrated |
| **Validate patch sheet** | `validate_patch_sheet`, `render_patch_sheet_data` → structured patch data; `validate_output_patch_labels` → output label vs. mixer state | `observed` (channel existence/names); `probe_required` (output source names) | Whether the patch sheet is complete; which discrepancies are blocking | Operator reconciles physical patch with digital state |
| **Check mixer subgroup topology** | `list_sub_groups` → fixed Sub A–D with member channels; `presonus://mixer/{id}/routing` → send routing graph | `observed` (sub key structure) | Whether subgroup assignments match the show's bus routing plan | Operator re-routes subgroups in UC Surface if needed |

---

## MCP backend responsibilities (what belongs in the backend)

Per the `sound-engineer-boundary-yagni` skill, the MCP server exposes:

- Mixer discovery and identity
- Mixer capabilities and limits
- Channel state: names, mute, solo, fader, pan, color, meters
- Fat Channel model/state where available
- Patch-sheet validation primitives
- Input-list validation primitives
- Line-check observations and diagnostics
- Monitor/AUX send facts and audits
- Routing graph facts with confidence metadata
- Stagebox/AVB/output routing probe instructions where not directly observable
- Proposed change sets (not autonomous writes)
- Gated write execution only when explicitly enabled and confirmed

## Sound-engineer agent responsibilities (what belongs in the agent)

- Reading and interpreting riders
- Deciding the show input list
- Assigning microphones and DI boxes
- Planning stage patching
- Choosing monitor/IEM layout
- Deciding whether a route or mix is musically acceptable
- Proposing EQ/compression/gate changes
- Explaining risks to the human operator
- Asking the human to confirm physical patching or probe actions

## Human / operator responsibilities (what cannot be automated)

- Physical cable connections and patch bay changes
- Physical label application
- Confirming proposed write operations before applying
- Running probe sessions (triggering state changes in UC Surface)
- Making final mix decisions based on sound quality
- Responding to performer feedback
- Operating the venue PA system

---

## Confidence promotion requirements

| Upgrade | Requires |
|---|---|
| AUX send level `inferred` → `observed` | Probe diff-state session while dragging AUX fader |
| Fader taper `guessed` → `observed` | Probe diff-state session with fader movement |
| Fat Channel EQ/comp values `guessed` → `observed` | `probe-fat-channel` calibration on real hardware |
| Output source names `probe_required` → `observed` | `probe-routing diff --kind bus-to-output` session |
| Any item → `observed` | HIL evidence in `captures/` with metadata (see `hil-validation` skill) |

---

## References

- [docs/routing-confidence-model.md](routing-confidence-model.md) — routing confidence tiers
- [docs/fat-channel-calibration.md](fat-channel-calibration.md) — Fat Channel calibration state
- [docs/capability-matrix.generated.md](capability-matrix.generated.md) — generated tool/resource inventory
- [docs/release-readiness-checklist.md](release-readiness-checklist.md) — gates for "field-ready" claim
- `.github/skills/sound-engineer-boundary-yagni/SKILL.md` — MCP/agent boundary rules
