# Agent Context Architecture

This repository keeps always-loaded agent context intentionally small.

## Layers

- `AGENTS.md`: the always-loaded repository contract. It should stay short, repo-specific, and focused on capability truth, confidence language, HIL evidence rules, write safety, and validation commands.
- skills in `.github/skills/` and `.github/Skills/`: task-specific procedures. Put operational workflows here instead of expanding root context.
- `docs/`: longer references, rationale, examples, and background material that should be loaded only when relevant.
- generated inventory: [docs/capability-matrix.generated.md](capability-matrix.generated.md) and `docs/generated/capability-inventory.json` are the runtime capability truth for tools, write gating, and confidence status.

## Rules

- Do not duplicate long process doctrine across always-loaded files.
- Do not restate generated capability details in multiple hand-maintained instruction files unless the summary is intentionally minimal.
- When prose and generated inventory disagree, treat generated inventory and current code as authoritative.
- When a claim depends on hardware evidence, route to the HIL and routing-confidence skills instead of embedding procedure detail in root instructions.

## Legacy material

Legacy standards-compliance guidance may remain in [docs/process/legacy-standards-compliance-advisor.md](process/legacy-standards-compliance-advisor.md), but it should not be restored as always-loaded root context.