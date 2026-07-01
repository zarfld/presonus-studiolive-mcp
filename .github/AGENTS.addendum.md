# Project-specific agent skill routing

Before changing this repository, select the narrowest matching skill:

- Use `repo-truth-maintenance` for README/status/version/license/capability claims.
- Use `mcp-capability-inventory` when adding, removing, renaming, gating, or documenting MCP tools/resources.
- Use `routing-confidence-probe-promotion` for routing, AUX, monitor, AVB, stagebox, output patch, and probe-diff work.
- Use `hil-validation` for any claim involving real StudioLive hardware, firmware, model support, or field readiness.
- Use `issue-traceability-remediation` when issue state, labels, requirements, implementation comments, tests, or docs disagree.
- Use `sound-engineer-boundary-yagni` when deciding whether a feature belongs in the MCP backend or the consuming sound-engineer agent.

Hard rules:

1. Do not use broad status words such as “complete”, “field-ready”, “fully supported”, or “all models” unless a verification artifact exists and is linked.
2. Do not remove unimplemented but required live-sound functionality as “YAGNI”. First classify it as required-current, required-later, probe-blocked, external-agent responsibility, or speculative.
3. Do not update README capability counts manually. Generate or verify them from the registered MCP tools/resources.
4. Do not promote inferred or stub routing to verified routing without hardware probe evidence.
5. Do not enable write tools by default.
