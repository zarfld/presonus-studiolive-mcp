# Copilot Instructions

Read [AGENTS.md](../AGENTS.md) first. Treat it as the always-loaded repository contract.

Keep this file short. Do not inline generic lifecycle doctrine, phase guidance, or repeated philosophy here.

Route detailed work to task-specific skills and repo docs:

- use repo skills in `.github/skills/` or `.github/Skills/` for procedures
- use [docs/agent-context-architecture.md](../docs/agent-context-architecture.md) for context-loading rules
- use [docs/capability-matrix.generated.md](../docs/capability-matrix.generated.md) and `docs/generated/capability-inventory.json` for runtime capability truth
- use `.github/skills/issue-traceability-remediation/SKILL.md` or [docs/issue-traceability-reconciliation.md](../docs/issue-traceability-reconciliation.md) for traceability work

Before commit run:

```text
pnpm build
pnpm test
pnpm inventory
git diff --check
git status --short --untracked-files=all
```