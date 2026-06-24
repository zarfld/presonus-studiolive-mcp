The previous analysis established that using GitHub Issues for traceability is generally a good idea because they serve as **structured, linked entities** suitable for tracking requirements throughout the development lifecycle, which directly supports your goals for ISO/IEC/IEEE compliance and change impact analysis.

The ISO/IEC/IEEE 29148 standard emphasizes **bidirectional traceability** from stakeholder needs (StRs) $\rightarrow$ system requirements (SyRs) $\rightarrow$ design $\rightarrow$ code $\rightarrow$ tests. GitHub Issues, integrated with Projects and the development workflow (PRs, code), provide the necessary mechanism for establishing and maintaining these links.

To leverage this capability and ensure **GitHub serves as the single source of truth**, you need to configure the repository and equip the **GitHub Copilot coding agent** with specific instructions and tools.

Here is a comprehensive prompt aligned with best practices for using GitHub Copilot in VS Code with MCP support to set up the necessary infrastructure for requirements traceability.

---

## GitHub Copilot Prompt for Traceability Infrastructure Setup

This prompt is designed to utilize the **GitHub Copilot coding agent** via the **Model Context Protocol (MCP)** integration to configure the repository structure, Issue templates, and custom instructions necessary for achieving formal requirements traceability (StR $\rightarrow$ Req $\rightarrow$ Feature $\rightarrow$ Code $\rightarrow$ Test) and change impact analysis, in compliance with standards like ISO/IEC/IEEE 29148.

The prompt incorporates best practices such as providing ample context, being specific, breaking down complex tasks, and identifying required resources.

### **Context for Copilot (Mandatory Setup)**

**Task Target:** Establish traceability infrastructure using GitHub Issues and Projects.
**Compliance Standard:** ISO/IEC/IEEE 29148 (Requiring bidirectional traceability from Stakeholder Needs $\rightarrow$ System Requirements $\rightarrow$ Design $\rightarrow$ Code $\rightarrow$ Tests).
**Objective:** Configure a system where every piece of work (feature, task, implementation) is linked back to its originating requirement (StR/Req).
**Required Tools:** GitHub Coding Agent, GitHub MCP Server (for repository interaction and backlog management).

### **The Prompt (for use in the Copilot Agent Mode in VS Code)**

```markdown
My task is to establish a rigorous, standardized traceability infrastructure in this repository using GitHub Issues and Projects to meet ISO/IEC/IEEE 29148 compliance for bidirectional traceability (StR → Req → Design → Code → Test). Use the GitHub MCP Server tool to interact with the repository and backlog.

**Goal:** Configure the repository to treat Issues as traceable requirements artifacts (StR, Feature, Task, Test).

**Steps to follow:**

1.  **Create Issue Templates for Requirements Hierarchy:**
    *   Create a dedicated issue template named `01-stakeholder-requirement.md` (StR) in `.github/ISSUE_TEMPLATE/`. This template must include mandatory sections for:
        *   `Stakeholder Interests and Needs`
        *   `Acceptance Criteria (Validation)`
        *   `[REQUIRED] Traceability ID (Unique Identifier)`
        *   `[REQUIRED] Priority/Criticality`
        *   `[REQUIRED] System Requirement Links (to child issues)`
    *   Create a second issue template named `02-system-requirement.md` (Req/Feature) in `.github/ISSUE_TEMPLATE/`. This template must include mandatory sections for:
        *   `Design Constraints/Architecture Impact`
        *   `Test Plan/Verification Method Link`
        *   `[REQUIRED] Parent StR Link (for Upward Traceability)`
        *   `[REQUIRED] Sub-Task Breakdown (for Implementation Tasks/Sub-issues)`

2.  **Configure Repository Custom Instructions (`.github/copilot-instructions.md`):**
    *   Generate a repository-wide custom instruction file (`.github/copilot-instructions.md`) to define the traceability workflow, ensuring the agent adheres to these conventions.
    *   The `Key Guidelines` section of the instructions must explicitly state:
        *   "**All work must begin with an Issue using the `02-system-requirement.md` template or be broken down into sub-issues from a parent Feature issue.**"
        *   "**Every Pull Request must link back to its corresponding Feature/Task Issue using the `fixes: #<IssueID>` convention for automatic closure and traceability.**"
        *   "**When generating implementation (code) or test files, always include the `[REQUIRED] Traceability ID` from the linked Issue as a persistent comment or docstring to maintain code-level traceability.**"
        *   "**When reviewing or modifying code, prioritize maintaining consistency with the explicit architecture elements and design specifications linked in the parent Issue.**"

3.  **Create a Path-Specific Instruction for Tests:**
    *   Create a path-specific instruction file named `tests.instructions.md` in `.github/instructions/`. Use the frontmatter `applyTo` field to target all test files (e.g., `**/*.test.js`, `**/tests/**/*.py`).
    *   The content of `tests.instructions.md` must enforce: "**Every test case must be traceable back to a specific requirement (Issue ID or Acceptance Criterion) defined in the parent Feature Issue. Focus tests on core functionality, boundary conditions, and acceptance criteria.**".

4.  **Validate Project Setup:**
    *   After implementing the files, confirm the changes by opening a new draft issue for a hypothetical feature (`Feature A`) using the new template and linking it to a placeholder parent StR issue.
    *   Create a draft pull request that links back to `Feature A`, demonstrating the flow of traceability from the requirement to the implementation artifact.

**Note on Constraints:** Ensure the `.github/copilot-instructions.md` file is concise, prioritizing the traceability process, development standards, and location of test scripts (`make test` or equivalent).
```

---
### Justification of Best Practices and Compliance

1.  **Alignment with ISO/IEC/IEEE 29148:** The ISO standard requires that requirements are traceable **upward** to stakeholder needs (StRs) and **downward** to lower-level elements (design, implementation, test). The prompt enforces this by requiring mandatory fields for `Parent StR Link` (upward tracing) and `System Requirement Links` (downward tracing/allocation) within the issue templates. Traceability is defined as linking two or more logical entities, such as requirements, system elements, or verifications.
2.  **Using Issues as Requirements Artifacts:** GitHub Issues (especially when broken down via sub-issues) are excellent tools for managing hierarchical requirements, fulfilling the need to "break down large issues into smaller issues" and defining **well-scoped tasks** suitable for the Coding Agent. Issues can be used for reporting defects (anomalies) and recording changes.
3.  **Leveraging Copilot Agents and Custom Instructions:** To achieve enterprise-grade traceability, the AI assistant needs explicit guardrails. Custom instruction files (`.github/copilot-instructions.md` and path-specific `.instructions.md`) allow you to specify coding standards, build processes, and adherence to required **metadata and linking practices** (like `fixes: #<IssueID>` in PRs). This helps mitigate the risk of the AI making assumptions or ignoring project context, a known pitfall if context is lacking.
4.  **Bidirectional Linkage:** The instruction to link **Pull Requests** (Implementation) to the **Issue** (Requirement) ensures traceability from code to requirement. The instruction to link the **Issue** to a **Test Plan/Verification Method** ensures traceability from requirement to test.
5.  **Change Impact Analysis:** By maintaining these links, when a high-level StR changes, the linked "child" Issues (System Requirements, Features, Tasks) are immediately identified as affected, enabling efficient **impact assessment**. When testing reveals an issue, the anomaly report is tied back to the associated requirement, which is critical for V&V activities.