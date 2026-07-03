# presonus-studiolive-mcp Agent Contract

## Repository purpose

This repository implements and documents MCP-facing capabilities for PreSonus StudioLive mixers: mixer discovery, state inspection, routing validation, calibrated evidence capture, and a small set of write-gated non-DSP workflows.

Do not describe the repository as complete, fully supported, field-ready, or universally verified unless the exact claim is backed by current code, generated inventory, and HIL evidence.

## Runtime truth sources

- Prefer the running code, [docs/capability-matrix.generated.md](docs/capability-matrix.generated.md), and [docs/generated/capability-inventory.json](docs/generated/capability-inventory.json) over prose summaries.
- Keep always-loaded files short. Put detailed procedures in skills and longer reference material in docs.

## Confidence vocabulary

Use these exact labels in docs, tests, and user-facing summaries:

| Label | Meaning |
|---|---|
| `observed` | Confirmed directly from live mixer state or HIL evidence. |
| `calibrated_inferred` | Derived from a formula or mapping that has probe/HIL calibration evidence for the named control. |
| `inferred` | Derived from code or repeated behavior, but not yet calibration-confirmed for the named control. |
| `probe_required` | Must not be promoted without a targeted probe or HIL capture. |
| `guessed` | Best-effort estimate only; present as unsafe to rely on. |

Never collapse these labels into broad "supported" or "works" claims.

## HIL scope rule

Every hardware-backed claim must name all of the following:

- mixer model
- serial
- firmware
- control/key
- fixture path under `captures/`

If any item is missing, lower the confidence level or mark the claim `probe_required`.

## Write safety

Approved write-gated tools for this repository:

- `prepare_mute_change_set`
- `prepare_channel_rename_change_set`
- `prepare_sub_group_membership_change_set`
- `prepare_aux_assignment_change_set`
- `validate_change_set`
- `apply_change_set`

Hard-disabled or not registered:

- `propose_eq_change`
- `prepare_fader_change_set`
- `prepare_aux_send_change_set`
- `prepare_fat_channel_change_set`
- future EQ/comp/gate/limiter write helpers until HIL-gated

Do not claim autonomous Fat Channel or other DSP write capability.

## Panel baseline rule

Compressor and EQ panel-spec docs are `front_panel_baseline_only`. They define UI ranges, labels, and anchor observations, not authoritative formulas. Formula promotion requires calibration evidence in the relevant calibration docs and captures.

## Required validation

Run these commands before closing work that changes repo content:

```text
pnpm build
pnpm test
pnpm inventory
git diff --check
git status --short --untracked-files=all
```

## Skill routing

| Task | Route to |
|---|---|
| Fat Channel model selection, raw-state inspection, scene GUID mapping | `.github/Skills/presonus-fat-channel-selection/SKILL.md` |
| Routing certainty, probe boundaries, promotion from inferred to observed | `.github/skills/routing-confidence-probe-promotion/SKILL.md` |
| HIL capture, evidence wording, support claims tied to hardware proof | `.github/skills/hil-validation/SKILL.md` |
| Capability inventory, write gating, tool/resource truth | `.github/skills/mcp-capability-inventory/SKILL.md` |
| README/status/support wording and avoiding overstated claims | `.github/skills/repo-truth-maintenance/SKILL.md` |
| Traceability reconciliation across issues, tests, docs, and code | `.github/skills/issue-traceability-remediation/SKILL.md` |
| Backend vs sound-engineer-agent boundary decisions | `.github/skills/sound-engineer-boundary-yagni/SKILL.md` |

Use [docs/agent-context-architecture.md](docs/agent-context-architecture.md) for the repo-level context model.