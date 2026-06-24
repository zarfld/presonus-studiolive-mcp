# PreSonus Fat Channel Selection Skill

This is a refactored Agent Skills bundle generated from the original monolithic Fat Channel Plugin Selection Guide.

## Structure

```text
presonus-fat-channel-selection/
├── SKILL.md
├── references/
│   ├── fat-channel-model-catalog.md
│   ├── mcp-interface-and-schemas.md
│   └── guid-mapping.md
└── assets/
    └── eval_queries.json
```

## Why this structure

- `SKILL.md` contains only triggerable operational instructions and common gotchas.
- Long model descriptions, MCP schemas, and GUID tables are split into reference files.
- The skill now has valid Agent Skills frontmatter.
- The description explicitly covers trigger cases and near-boundaries.
- Validation and output templates are included to reduce vague or unsafe answers.

## Suggested validation

Run your skill client’s validation tooling. For clients using the Agent Skills reference validator:

```bash
skills-ref validate ./presonus-fat-channel-selection
```

Then test trigger behavior using `assets/eval_queries.json`.
