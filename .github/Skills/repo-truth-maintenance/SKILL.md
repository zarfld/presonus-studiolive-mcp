---
name: repo-truth-maintenance
description: Keep README, status claims, release language, hardware support statements, and license/process text aligned with the actual implementation and verified evidence.
---

# Repo truth maintenance

## Use this skill when

Use this skill when editing or reviewing:

- `README.md`
- status/version/release claims
- hardware support statements
- license text
- “complete”, “field-ready”, “v1.0”, “all”, “fully”, “production-ready”, “validated”, or similar claims
- generated or template-derived process text
- documentation that lists MCP tools/resources, supported mixer models, firmware versions, or validation coverage

## Goal

Prevent the repository from claiming more than the code and verification artifacts prove.

The repository may describe planned or inferred capability, but it must label it explicitly. The README must be a product-status document, not a mixture of product truth and generic lifecycle-template marketing.

## Required claim categories

Every nontrivial capability claim must fit one category:

| Category | Meaning | Allowed wording |
|---|---|---|
| `verified` | Confirmed by automated tests or hardware evidence linked from the repo | “verified on …”, “tested by …” |
| `implemented-unverified` | Code exists, but no HIL/probe evidence yet | “implemented, not hardware-verified” |
| `inferred` | Derived from live state keys or reverse engineering, not probe-confirmed | “inferred from live state” |
| `probe-required` | Requires operator-driven diff/probe before reliable use | “probe required” |
| `stub` | Tool/schema exists but deliberately returns limited result | “stub”, “returns instructions only” |
| `planned` | Backlog item only | “planned”, “not implemented” |
| `unsupported` | Out of scope or blocked | “not supported” |

## Procedure

1. **Inspect implementation before editing documentation.**
   - Check `packages/presonus-mcp-server/src/tools.ts` for registered tools.
   - Check `packages/presonus-mcp-server/src/resources.ts` for registered resources.
   - Check `package.json` and package-level `package.json` files for actual version numbers and scripts.
   - Check HIL fixtures, HIL tests, captured probe output, and validation docs before writing hardware-support claims.

2. **Create a claim inventory.**
   - Search docs for: `complete`, `field-ready`, `v1.0`, `fully`, `all`, `validated`, `supported`, `production`, `field`, `MVP`, `write tools`, `resources`, `read-only tools`, `StudioLive III series`, `license`.
   - Put each claim into one of the required categories.
   - Mark contradictions explicitly before editing.

3. **Fix contradictions instead of smoothing them over.**
   - Tool/resource counts must agree everywhere.
   - Version/status language must agree with `package.json` versions and release tags.
   - Hardware support must distinguish verified mixer/firmware combinations from expected compatibility.
   - Known gaps must not contradict the headline status.

4. **Remove or relocate template residue.**
   - Generic lifecycle-framework claims belong in `PROCESS.md`, `CONTRIBUTING.md`, or the template repository, not in the product README unless they are directly relevant to this MCP server.
   - Do not leave duplicate License sections or `[Specify your license here]` placeholders.

5. **Use hardware-specific status language.**
   - Preferred form:
     `Current status: experimental read-mostly backend. Verified primarily on <model> firmware <version>. Routing and write features are confidence-tagged; some require probe-diff validation.`
   - Avoid:
     `field-ready`, `complete`, `fully validated`, `all StudioLive III models supported`, `v1.0` unless release tags and validation evidence exist.

6. **Run verification after changes.**
   - `pnpm build`
   - `pnpm test`
   - `pnpm typecheck`
   - Run the capability inventory script/test if present.

## Required README sections

The README should contain these tables or equivalent generated documents:

### Project status

| Area | Status | Evidence | Notes |
|---|---|---|---|
| Discovery | verified / implemented-unverified | test/probe link | model/firmware |
| Read-only state | verified / inferred | test/probe link | confidence |
| Routing | inferred / probe-required / verified | test/probe link | Layer A/B |
| Write tools | gated experimental | ADR/test link | disabled by default |
| Hardware models | verified / expected compatible | HIL matrix link | firmware |

### Hardware validation matrix

| Mixer model | Firmware | Validation level | Evidence | Notes |
|---|---|---|---|---|
| StudioLive 32SC | 3.3.0.109659 | verified / partial | capture/test link | primary device |
| StudioLive 32R | unknown | expected compatible | none | HIL required |

### Capability matrix

This must be generated or checked from code, not manually guessed.

## Acceptance criteria

- No broad “complete” or “field-ready” claim remains without linked evidence.
- README tool/resource counts match the actual registered MCP surface.
- Package version, README status, and release tags do not contradict each other.
- Hardware support is model- and firmware-specific.
- License placeholder is removed or replaced with an explicit decision.
- Template/process marketing text is removed from README or moved to a process document.
- `pnpm build`, `pnpm test`, and `pnpm typecheck` pass.

## Failure modes to avoid

- Changing wording to sound safer while keeping false implications.
- Treating a passing unit test as proof of hardware support.
- Saying “StudioLive III supported” when only one model/firmware has been tested.
- Saying “write support” without stating that write tools are gated and disabled by default.
- Hiding uncertainty in footnotes instead of placing it in the main capability table.
