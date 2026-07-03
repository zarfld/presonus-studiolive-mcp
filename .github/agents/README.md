# GitHub Copilot Agents for presonus-studiolive-mcp

This repository does not use the old root agent as a generic standards-compliance advisor. The always-loaded context is the short repository contract in [AGENTS.md](../AGENTS.md).

Use this directory and the repo skills for task-specific routing, not for repeating long lifecycle doctrine.

## What to read first

1. [AGENTS.md](../AGENTS.md)
2. [docs/agent-context-architecture.md](../../docs/agent-context-architecture.md)
3. The matching repo skill in `.github/skills/` or `.github/Skills/`

## Preferred routing in this repo

| Need | Preferred source |
|---|---|
| Runtime capability truth | [docs/capability-matrix.generated.md](../../docs/capability-matrix.generated.md) |
| Fat Channel model choice or state inspection | [presonus-fat-channel-selection skill](../Skills/presonus-fat-channel-selection/SKILL.md) |
| HIL evidence and hardware-claim wording | `.github/skills/hil-validation/SKILL.md` |
| Routing confidence and probe promotion | `.github/skills/routing-confidence-probe-promotion/SKILL.md` |
| Repo wording, support claims, README truthfulness | `.github/skills/repo-truth-maintenance/SKILL.md` |
| Traceability reconciliation | `.github/skills/issue-traceability-remediation/SKILL.md` |

## Specialized agents

The agent files in this folder are optional helpers for narrow tasks. Use them only when the task genuinely matches their scope. They are not the source of repository truth.

## Legacy doctrine

If older standards-compliance guidance is needed for reference, use [docs/process/legacy-standards-compliance-advisor.md](../../docs/process/legacy-standards-compliance-advisor.md). Keep that material out of always-loaded root context.
