---
name: hil-validation
description: Validate StudioLive behavior against real hardware, capture evidence, and keep model/firmware support claims precise.
---

# Hardware-in-the-loop validation

## Use this skill when

Use this skill when:

- making claims about real StudioLive hardware
- validating firmware-specific behavior
- promoting `implemented-unverified`, `inferred`, or `probe-required` capability to `verified`
- adding or changing `*.hil.test.ts`
- changing probe CLI behavior
- validating routing, Fat Channel parameter mapping, meters, discovery, scenes, or write tools
- updating hardware support tables

## Goal

Ensure that hardware claims are supported by repeatable evidence. Unit tests and fixtures are useful but do not prove hardware compatibility across mixer models or firmware versions.

## Evidence levels

| Level | Meaning | May support README hardware claim? |
|---|---|---|
| `static-code` | Code inspection only | No |
| `unit-test` | Pure test without mixer | No, except internal logic |
| `fixture-replay` | Replay of prior captured mixer state | Partial, if capture metadata exists |
| `manual-probe` | Operator command/output saved | Yes, limited to tested model/firmware |
| `automated-hil` | Repeatable HIL test against real mixer | Yes, strongest |
| `live-show` | Used during real soundcheck/show with notes | Yes, but must still state scope |

## Required capture metadata

Every hardware capture or HIL result must record:

```yaml
mixerModel: "StudioLive 32SC"
firmware: "3.3.0.109659"
serialRedacted: true
connection: "LAN TCP 53000"
serverCommit: "<git-sha>"
nodeVersion: "<node-version>"
pnpmVersion: "<pnpm-version>"
command: "pnpm probe:dev dump-state -d <ip>"
capturedAt: "<ISO-8601>"
operator: "<initials or omitted>"
purpose: "routing probe / Fat Channel probe / discovery / meter validation"
limitations:
  - "Single mixer model only"
  - "No 32R stagebox connected"
```

Do not commit private IP addresses, serial numbers, venue names, personal names, or show-specific confidential data unless explicitly intended.

## Procedure

1. **Define the claim to validate.**
   - Example: “AUX 1 send levels can be extracted for line channels.”
   - Example: “Output patch source index is observable but source name is not yet mapped.”

2. **Choose validation mode.**
   - Use fixture replay for deterministic parser/regression tests.
   - Use manual probe for reverse engineering.
   - Use automated HIL for repeatable acceptance.

3. **Run local non-HIL checks first.**
   - `pnpm build`
   - `pnpm test`
   - `pnpm typecheck`

4. **Run HIL only when hardware is connected.**
   - `pnpm probe:dev discover`
   - `pnpm probe:dev dump-state -d <ip>`
   - `pnpm test:hil`

5. **Record the result.**
   - Store sanitized captures under an agreed fixture/capture path.
   - Add a short validation note under `docs/validation/` or equivalent.
   - Update the hardware validation matrix.

6. **Promote confidence only after evidence is committed.**
   - `implemented-unverified` may become `verified` after passing automated HIL.
   - `probe-required` may become `probe_verified` only for the tested model/firmware and exact route class.
   - Do not generalize one mixer model to all StudioLive III models.

## Hardware validation matrix format

```markdown
# Hardware validation matrix

| Capability | Model | Firmware | Validation level | Evidence | Limitations |
|---|---|---|---|---|---|
| Discovery | StudioLive 32SC | 3.3.0.109659 | automated-hil | docs/validation/... | same LAN only |
| AUX extraction | StudioLive 32SC | 3.3.0.109659 | fixture-replay + manual-probe | test/fixtures/... | pre/post unknown |
| AVB routing | 32SC + 32R | TBD | not validated | none | probe required |
```

## Acceptance criteria

- Hardware claims are model- and firmware-specific.
- Fixture files include capture metadata or reference a metadata file.
- HIL tests are skipped by default and enabled only via explicit environment/config.
- No CI job fails merely because physical hardware is absent.
- README claims do not exceed the validation matrix.
- Unverified models are listed as “expected compatible” or “not yet validated”, not “supported”.

## Failure modes to avoid

- Treating a 32SC result as proof for 32R, 24R, 16R, or 16.
- Treating fixture replay as live hardware validation without metadata.
- Leaving HIL tests enabled in ordinary CI.
- Committing unsanitized serial numbers or private network details.
- Promoting routing confidence without a probe record.
