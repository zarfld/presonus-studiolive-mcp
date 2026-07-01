# Release Readiness Checklist

> **Until all gates in this checklist pass, the repository MUST describe itself
> as experimental, read-mostly, or similar — NOT as "field-ready", "v1.0",
> "complete", "fully supported", or "production-ready".**
>
> See `AGENTS.addendum.md` rule #1 and the `repo-truth-maintenance` skill.

---

## Current status

**Status: EXPERIMENTAL** — Not all gates below are met.

Primary validation: StudioLive 32SC firmware 3.3.0.109659 (static inspection + partial HIL).

---

## Required gates before `v1.0` or "field-ready" claim

### P0 — Truth & safety (blocking)

- [ ] **LICENSE**: A valid LICENSE file exists and README references it correctly.  
  _Status: ✅ MIT added (2026-07-01)_

- [ ] **Capability matrix**: `docs/capability-matrix.generated.md` and `docs/generated/capability-inventory.json`
  exist, are generated from source, and are committed.  
  _Status: ✅ Generator in place, CI drift check enforced_

- [ ] **No README overclaims**: README contains no unqualified "field-ready", "v1.0", "complete",
  or "fully supported" language.  
  _Status: ✅ Removed (2026-07-01)_

- [ ] **Tool/resource counts match inventory**: README does not manually state tool or resource
  counts; it references the generated matrix.  
  _Status: ✅ Counts removed from README_

- [ ] **Open P0 issues**: No P0/critical issues remain open in the GitHub issue tracker
  with confirmed impact on reliability or safety.  
  _Status: ⬜ Verify in issue tracker_

### P1 — Routing confidence (required for routing claims)

- [x] **Input source routing probe**: `probe-routing diff --kind input-source` run on
  StudioLive 32SC fw 3.4.0.111374 (2026-07-01). Key `line.chN.inputsrc.value` confirmed.
  All 4 labels observed: 0=Local, 1=Stage Box, 2=USB, 3=SD Card.
  Evidence: `captures/probe-input-source/` + `captures/probe-idx23/`.
  _Status: ✅ Completed 2026-07-01 — `get_input_routing` promoted to `observed`_

- [x] **AVB stream routing probe**: `probe-routing diff --kind avb-stream` run on
  32SC + 32R fw 3.4.0.111374 (2026-07-01). Keys `stageboxsetup.avb_src_{range}.value` confirmed.
  _Status: ✅ Completed 2026-07-01 — `validate_avb_routing` promoted to `observed`_

- [ ] **AUX send de-normalization probe**: At least one hardware probe session confirms the
  AUX send level formula. Evidence in `captures/` with required metadata.  
  _Status: ⬜ Not yet run — current confidence: `probe_required`_

- [ ] **Output patch source names probe**: `probe-routing diff --kind bus-to-output` run on
  physical hardware; source index → name mapping documented.  
  _Status: ⬜ Not yet run — current confidence: `probe_required`_

- [x] **Fader taper probe**: 5 anchor points on StudioLive 32SC fw 3.4.0.111374 (2026-07-01).
  Piecewise formula confirmed: log10 below unity, linear above unity. Max residual 0.025 dB.
  Key: `line.chN.volume` (0–100 raw scale, scene-stored).
  Evidence: `test/fixtures/32sc/fader-preamp/fader-preamp-calibration.json`.
  _Status: ✅ Completed 2026-07-01 — `fader.linear` and `fader.db` promoted to `inferred`_

- [x] **Preamp gain probe**: Key `line.chN.preampgain.value` confirmed with 5 anchor points.
  Formula: `dB = value × 60` (linear). All 5 match exactly (max error 0 dB).
  Evidence: `test/fixtures/32sc/fader-preamp/fader-preamp-calibration.json`.
  _Status: ✅ Completed 2026-07-01 — `preampGainDb` promoted to `observed`_

- [x] **Routing confidence model reviewed**: `docs/routing-confidence-model.md` reviewed and
  accuracy confirmed against current codebase.  
  _Status: ✅ Updated (2026-07-01) — reflects HIL promotions_

- [x] **Layer B invariant test passes**: `routing-layer-b-confidence.test.ts` passes in CI.  
  _Status: ✅ All 10 tests pass (2026-07-01)_

### P1 — Fat Channel (required for Fat Channel claims)

- [ ] **Core model parameter calibration**: EQ gain, freq, Q, comp threshold, comp ratio,
  and attack/release are confirmed by `probe-fat-channel` for at least STANDARD, FET, and
  COMP_160 models.  
  _Status: ⬜ Not yet run — all values currently `guessed`_

- [ ] **Calibration evidence captured**: Evidence in `captures/` with required metadata.  
  _Status: ⬜ Not yet run_

- [ ] **`parameterConfidence` updated**: `extractFatChannelState()` sets `parameterConfidence: 'observed'`
  for confirmed parameters after probe calibration.  
  _Status: ⬜ Blocked on probe run_

### P2 — Write tools (required before write tools are "field-ready")

> ⚠️ **Write-tool safety gate is NOT yet closed.** The safety framework is implemented and
> mute HIL is observed. Fader and Fat Channel write paths require separate HIL verification
> before the global write-tool gate can be marked complete.

- [x] **`apply_change_set` safety framework implemented**:
  • `writeEnabled` gate enforced at both registration and `applyChange()` level
  • `dryRun:true` path: returns full resolution without writing; changeSet preserved
  • Post-write verification in every real `apply_change_set` response
  • `rollbackHint` in every real `apply_change_set` response
  • ProposedChangeSet TTL=60 s; device ID mismatch rejected before dispatch
  • Confirmation note required (`min(3)` string); audit log to stderr
  _Status: ✅ Implemented and unit-tested (2026-07-01)_

- [x] **Mute write HIL roundtrip**: `prepare_mute_change_set` + `apply_change_set` tested on
  StudioLive 32SC SD7E21010066, firmware 3.4.0.111374 (2026-07-01). Mute/unmute confirmed
  via mixer echo; dry-run verified (no mixer write); post-write verification and rollbackHint
  confirmed in response; Ch11 reverted to original state after every test via try/finally.
  _Status: ✅ Observed on 32SC fw 3.4.0.111374 — HIL T9.1–9.4 passed_

- [ ] **Fader write HIL**: `prepare_fader_change_set` + `apply_change_set` tested on hardware.
  _Status: ⛔ Deferred — fader write scale (0–100 scene-stored vs. PV protocol 0–1) requires
  investigation before HIL is safe to run. Do not mark complete until verified._

- [ ] **Fat Channel write HIL**: EQ/comp/gate parameter write tested on hardware.
  _Status: ⛔ Deferred — all EQ/Fat Channel formulas are `guessed`; write safety requires
  calibration probe first. Do not mark complete until observed._

- [ ] **Write-tool global safety gate**: All write paths (mute, fader, aux send, Fat Channel)
  HIL-verified or explicitly excluded from supported write scope.
  _Status: ⛔ NOT COMPLETE — mute observed, fader and Fat Channel deferred above._

### P2 — HIL tests

- [x] **HIL write tests pass on 32SC**: `pnpm test:hil write-channel-scene.hil` passed on
  StudioLive 32SC SD7E21010066 fw 3.4.0.111374 (2026-07-01, T1–T9).
  **Known sensitivity**: T3 (`list_sub_groups` fxreturn membership) is scene-topology dependent —
  if the live scene does not contain `fxreturn.ch4` in a sub group, T3 will fail. This is
  not a code regression; it reflects the current mixer scene state.
  _Status: ✅ T1/T2/T4–T9 confirmed; T3 conditionally passes depending on live scene_

- [ ] **HIL evidence archived**: Captures stored in `captures/` with complete metadata
  (see `hil-validation` skill).  
  _Status: ⬜ Not yet_

### P3 — Hardware support matrix (required for "all StudioLive III models supported" claim)

- [ ] **StudioLive 32R HIL**: Discovery, channel state, routing confirmed.  
  _Status: ⬜ Not yet run_

- [ ] **StudioLive 24R HIL**: Discovery, channel state confirmed.  
  _Status: ⬜ Not yet run_

- [ ] **StudioLive 16R HIL**: Discovery, channel state confirmed.  
  _Status: ⬜ Not yet run_

- [ ] **StudioLive 16 HIL**: Discovery, channel state confirmed.  
  _Status: ⬜ Not yet run_

### P3 — Repository hygiene

- [ ] **CI workflow**: `.github/workflows/ci-build-test.yml` exists and passes on every push/PR.  
  _Status: ✅ Added (2026-07-01)_

- [ ] **Inventory drift check in CI**: `pnpm inventory` + `git diff --exit-code` passes.  
  _Status: ✅ Added to ci-build-test.yml (2026-07-01)_

- [ ] **Issue traceability**: No orphan `@implements` annotations without matching open/closed
  issues; FlexMix (#84) and fixed-subgroups (#85) issues reconciled.  
  _Status: ⬜ See `docs/issue-traceability-reconciliation.md`_

---

## How to verify and sign off

When all gates above are met:

1. Open a PR titled: `release: v1.0 release readiness sign-off`
2. Attach all HIL evidence artifacts to the PR description
3. Update this file: set each gate to `✅` with date and evidence link
4. After approval, update README with hardware-specific validation claims
5. Tag the release: `git tag v1.0.0`

Do NOT add the tag, "v1.0", or "field-ready" to README, CHANGELOG, or any
documentation before this PR is merged and all gates pass.

---

## References

- [docs/capability-matrix.generated.md](capability-matrix.generated.md) — generated inventory
- [docs/routing-confidence-model.md](routing-confidence-model.md) — routing confidence
- [docs/fat-channel-calibration.md](fat-channel-calibration.md) — Fat Channel calibration
- [docs/agent-capability-matrix.md](agent-capability-matrix.md) — MCP/agent boundary
- `.github/AGENTS.addendum.md` — repo guardrails
- `.github/skills/hil-validation/SKILL.md` — HIL evidence requirements
- `.github/skills/repo-truth-maintenance/SKILL.md` — README truth rules
