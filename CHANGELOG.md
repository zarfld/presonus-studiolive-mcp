# Changelog

All notable changes to this project will be documented in this file.

---

## [0.1.0] — 2026-10-01

First public release.

### Supported

#### Hardware — read-only baseline

| Hardware | Serial | Firmware | Evidence |
|---|---|---|---|
| StudioLive 32SC | SD7E21****66 | 3.4.0.111374 | HIL T1–T9 mute write + full adapter/field-acceptance tests |
| StudioLive 32SC | (earlier sessions) | 3.3.0.109659 | State capture validated; routing and Fat Channel partially probed |
| StudioLive 32R | RA3E18****194 | 3.4.0.111374 | 49/49 smoke tests passed 2026-10-01 |

#### Read-only capabilities (both 32SC and 32R, `observed`)

- Mixer discovery on LAN / configured-IP fallback
- Serial-stable device identity (`deviceId` = `serial:<serial>`)
- TCP connection on port 53000 (UC Surface protocol)
- Full state synchronization on connect
- 32-channel state read (name, mute, solo, fader dB/linear, pan, color, Fat Channel model names)
- Mixer capabilities (input count, aux mixes, FX buses, stagebox, Fat Channel flag)
- `refresh_mixer_state` demand-refresh
- Disconnect / reconnect lifecycle
- AVB stream-routing read
- AUX mix read (master level/mute, per-channel send levels)
- Output-patch source index read
- Meter stream (time-windowed channel activity classification)

#### Write capability (StudioLive 32SC only, opt-in)

- **Channel mute** — `prepare_mute_change_set` + `validate_change_set` + `apply_change_set`
- Disabled by default; requires `PRESONUS_WRITE=1`
- HIL-verified on 32SC SD7E21010066 firmware 3.4.0.111374 (T1–T9, 2026-07-01)

#### Safety framework

- Write tools not registered unless `PRESONUS_WRITE=1`
- `operationMode: 'control_locked'` overrides write enablement
- ProposedChangeSet TTL = 60 seconds
- Device ID validated before dispatch
- `dryRun: true` path returns full resolution without writing
- Post-write verification in every `apply_change_set` response
- `rollbackHint` in every `apply_change_set` response
- Confirmation note required (minimum 3 characters); audit log to stderr
- Wrong serial → no mutation (validated before apply)
- Stale/not-ready state → no mutation
- Expired change set → rejected
- Wrong device ID → rejected
- Disconnect between proposal and apply → safe failure

#### Negative / safety cases confirmed

- `PRESONUS_WRITE` absent → write tools not registered
- Wrong expected serial → `validate_mixer_identity` returns `valid: false`; `apply_change_set` rejects mismatched device
- Mixer unreachable → connection error with actionable message
- `control_locked` mode → all write attempts rejected regardless of `PRESONUS_WRITE`
- Expired change set → `apply_change_set` returns error before any hardware write
- `dryRun: true` → no hardware state changes occur

### Experimental / internal (not part of v0.1 public contract)

These are implemented in the codebase but are **outside the v0.1 compatibility contract**:

- `prepare_channel_rename_change_set` — channel rename write (no public v0.1 contract; HIL passes on 32SC but excluded from release contract)
- `prepare_sub_group_membership_change_set` — subgroup membership write (scene-topology dependent)
- `prepare_aux_assignment_change_set` — AUX assignment write
- FlexMix bus topology (`flexmix-routing.hil.test.ts`) — scene-topology dependent; test results vary with live scene
- Fixed subgroup topology (`fixed-subgroups.hil.test.ts`) — scene-topology dependent

### Deferred (explicitly not supported in v0.1)

- **Fader writes** — `prepare_fader_change_set` hard-disabled; scale investigation (0–100 scene vs. PV protocol) required
- **EQ writes** — `propose_eq_change` hard-disabled; UC Surface display does not update from probe writes; inverse formula calibration incomplete
- **Compressor / gate / limiter writes** — `prepare_fat_channel_change_set` hard-disabled
- **AUX send level writes** — `prepare_aux_send_change_set` not registered
- **Scene recall** — not implemented
- **Automatic mixer correction** — out of scope
- **AI/live mixing autonomy** — out of scope
- **Broad Series III model compatibility** — 24R, 16R, 16 unverified; may be protocol-compatible but no HIL evidence
- **StudioLive 32R mute write** — not claimed; requires separate HIL
- **Output-patch source name mapping on 32R** — `inferred`; calibration not independently confirmed on 32R
- **Fat Channel parameter write on any model** — deferred pending inverse formula calibration

### Known HIL test failures (not release blockers)

The full `pnpm test:hil` suite contains 4 failed test files out of 13. These are **not release blockers** for v0.1:

| Test file | Failure reason | Release impact |
|---|---|---|
| `flexmix-routing.hil.test.ts` | `assignedChannels` is null — live scene does not have expected sub group membership | Not a v0.1 contract item; scene-topology dependent |
| `fixed-subgroups.hil.test.ts` | `assignedChannels` is null — live scene topology mismatch | Not a v0.1 contract item; scene-topology dependent |
| (2 others) | Timing / lifecycle related | Not in v0.1 release smoke scope |

v0.1 release smoke tests (32SC and 32R) all pass:
- `release-v0.1-32r-smoke.hil.test.ts` — 49/49 passed
- `field-acceptance.hil.test.ts` — all v0.1 gates passed
- `client-manager.hil.test.ts` — all tests passed
- `write-channel-scene.hil.test.ts` — T1–T9 passed (T3 conditionally scene-dependent)

### Changes from prior experimental state

- Added StudioLive 32R as verified read-only baseline (49/49 HIL smoke tests)
- Updated featherbear patch reference: 1.8.0 → 1.9.1 (UBJSON I/D type support)
- Write tools table corrected: `prepare_mute_change_set` is the v0.1 write tool; `propose_eq_change` hard-disabled
- README hardware validation table updated with firmware-specific evidence rows
- README quick start expanded: environment variables, Claude Desktop config, write opt-in section
- v0.1 capability matrix added to README
- ADR-006 amended: records that v0.1 public write scope is mute-only (not EQ-first as originally drafted)
- `docs/release-readiness-checklist.md` updated with 32R HIL evidence

### Dependency notes

- `@featherbear/presonus-studiolive-api` 1.9.1 — no active patch; 1.9.1 includes `I` (int16) UBJSON type support natively. The `patches/@featherbear__presonus-studiolive-api@1.8.0.patch` file is a stale artifact from the prior version and is not applied.
- `@modelcontextprotocol/sdk` ~1.30.1

### Release commit

Tested against commit: `fa63e62` (HEAD at time of release preparation, 2026-10-01)

### Tested MCP client

- **Claude Desktop** — primary tested client; stdio transport; `claude_desktop_config.json` configuration

---

*For v1.0 gates (Fat Channel calibration, fader write HIL, full routing confirmation, AUX de-normalization), see [docs/release-readiness-checklist.md](docs/release-readiness-checklist.md).*
