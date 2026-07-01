# Process, Standards & Lifecycle Guide

This file contains process-governance, standards-compliance, and lifecycle-template
information that applies to the development process for this repository.

It was separated from `README.md` to keep the product README focused on what the
MCP server actually does today, rather than mixing product truth with process
aspirations.

For the current MCP tool/resource inventory, see
[docs/capability-matrix.generated.md](docs/capability-matrix.generated.md).

For hardware support claims, see
[docs/release-readiness-checklist.md](docs/release-readiness-checklist.md).

---

## Standards Implemented

| Standard | Purpose |
|---|---|
| **ISO/IEC/IEEE 12207:2017** | Software life cycle processes |
| **ISO/IEC/IEEE 29148:2018** | Requirements engineering |
| **IEEE 1016-2009** | Software design descriptions |
| **ISO/IEC/IEEE 42010:2011** | Architecture description |
| **IEEE 1012-2016** | Verification & validation |

## XP Practices Integrated

- **Test-Driven Development (TDD)** — write tests first
- **Continuous Integration** — integrate frequently
- **Pair Programming** — collaborative development
- **Simple Design** — YAGNI principle
- **Refactoring** — continuous improvement
- **Collective Code Ownership** — shared responsibility

## Phase-by-phase lifecycle

See `docs/lifecycle-guide.md` for a walkthrough of all 9 lifecycle phases.
Phase-specific Copilot instructions live in `.github/instructions/phase-NN-*.instructions.md`.

## GitHub Issues workflow

All requirements, architecture decisions, and test cases are tracked as GitHub Issues.
See `docs/github-issue-workflow.md` for full guidance.

Issue types:

| Type | Label | Prefix |
|---|---|---|
| Stakeholder Requirement | `type:stakeholder-requirement` | `StR-` |
| Functional Requirement | `type:requirement:functional` | `REQ-F-` |
| Non-Functional Requirement | `type:requirement:non-functional` | `REQ-NF-` |
| Architecture Decision | `type:architecture:decision` | `ADR-` |
| Architecture Component | `type:architecture:component` | `ARC-C-` |
| Test Case | `type:test` | `TEST-` |

## Repository structure

The 9-phase folder structure follows ISO/IEC/IEEE 12207:2017:

```
01-stakeholder-requirements/
02-requirements/
03-architecture/
04-design/
05-implementation/
06-integration/
07-verification-validation/
08-transition/
09-operation-maintenance/
```

## Automation scripts

See `scripts/` for traceability and compliance tooling.

## CI/CD

See `.github/workflows/` for automated checks including:
- Build and test (`ci-build-test.yml`)
- Traceability validation (`traceability-check.yml`)
- Issue structure validation (`issue-validation.yml`)
- Label validation (`label-validation.yml`)

## Contributing

See the phase-specific instructions in `.github/instructions/` and the skills
in `.github/skills/` for guidance on how to contribute.
