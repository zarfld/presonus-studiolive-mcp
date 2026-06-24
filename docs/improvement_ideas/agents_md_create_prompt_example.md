Based on the best practices for using GitHub Copilot for agentic workflows, custom instructions, and configuration files like `AGENTS.md`, the optimal prompt must be highly specific, define a clear persona, establish boundaries, and explicitly request the YAML frontmatter structure.

references:
https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/
https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents 
https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/
https://github.com/agentmd/agent.md
https://github.com/openai/agents.md

The following prompt is designed to instruct the Copilot Coding Agent to process a detailed description of a specialized process phase (the "separately explained topic") and translate those details into a formal `AGENTS.md` profile for a custom agent.

### GitHub Copilot Prompt to Create an `AGENTS.md` File

This prompt should be executed in a Copilot Chat environment that supports the Coding Agent mode (like in an IDE or on GitHub.com).

```markdown
Your task is to act as an **AI Agent Architect**. Your goal is to generate a comprehensive and highly specific `AGENTS.md` file based on the detailed *Specialized Agent Role Definition* provided below.

The resulting `AGENTS.md` file must define a specialized agent, focusing on **non-coding, analysis, and documentation tasks** relevant to the described requirements phase.

## Goals

1.  **Establish Clear Persona:** Define the agent's identity and expertise clearly (e.g., 'Analyst,' 'Engineer,' 'Specialist').
2.  **Define Mandate:** Extract the core responsibilities, specific deliverables (artifacts), and mandatory quality checks/standards.
3.  **Set Explicit Boundaries:** Incorporate clear constraints using 'Always do,' 'Ask first,' and 'Never do' sections to guide behavior and prevent scope creep into other phases (like implementation or design).
4.  **Format Correctly:** Use valid YAML frontmatter followed by structured Markdown content, as required for `AGENTS.md`.

## Required Output Format

The output must be a single Markdown file titled `AGENTS.md` structured as follows:

1.  **YAML Frontmatter:** Must include `name`, `description`, `tools`, and explicitly set the `model` property to prioritize analytic capabilities.
2.  **Markdown Body:** Must contain the following sections using Markdown headings:
    *   `Role and Core Responsibilities` (The agent's primary purpose and focus).
    *   `Key Deliverables (Artifacts)` (The required outputs, e.g., specifications, reports).
    *   `Quality Standards and Evaluation Criteria` (The non-functional checks the agent must apply).
    *   `Constraints and Boundaries` (Using ✅ Always do, ⚠️ Ask first, 🚫 Never do icons/headings).

## Guidance and Constraints

*   **Model Selection:** Use `Reasoning/planning` for the `model` property, as the task involves complex analysis and planning over code generation.
*   **Tool Selection:** Select the minimum necessary tools from `["read", "search", "edit", "githubRepo"]`. Prioritize documentation/analysis tools (`read`, `search`, `edit`) over specialized tools unless absolutely necessary.
*   **Persona Naming:** Name the agent based directly on its defined role in the provided definition (e.g., 'StakeholderRequirementsAnalyst').
*   **Length:** Keep the persona prompt concise and focused, ensuring the final output is easy to read and manage.

---
## Specialized Agent Role Definition (User Input Required)

***[INSERT THE FULL, DETAILED TEXT OF THE DESIRED AGENT ROLE HERE. For example, insert the text defining the "StakeholderRequirementsAnalyst" or "SystemRequirementsEngineer" persona and their required tasks, quality checks, and constraints from our conversation history.]***

---
## Generated AGENTS.md

*(The agent should begin generating the content here.)*
```