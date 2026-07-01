---
name: sound-engineer-boundary-yagni
description: Decide what belongs in the MCP backend versus the consuming sound-engineer agent, while preventing YAGNI from deleting required live-sound functionality.
---

# Sound-engineer boundary and YAGNI guardrail

## Use this skill when

Use this skill when:

- deciding whether a feature belongs in the MCP server or a sound-engineer agent
- reviewing YAGNI-driven removals or simplifications
- implementing rider, input-list, patch-sheet, soundcheck, monitor, or routing features
- deciding whether a feature should be current scope, later scope, probe-blocked, or external-agent responsibility
- writing README claims about “what the MCP server does”

## Goal

Keep the MCP backend narrow but operationally useful.

YAGNI means “do not build speculative features.” It does not mean deleting essential facts, diagnostics, or safety contracts needed for the current soundcheck/routing workflow.

## Boundary rule

The MCP backend provides **facts, safe validations, and gated operations**.

The sound-engineer agent performs **interpretation, planning, and decisions**.

## MCP backend responsibilities

The MCP server should expose:

- mixer discovery and identity
- mixer capabilities and limits
- channel state: names, mute, solo, fader, pan, color, meters
- Fat Channel model/state where available
- patch-sheet validation primitives
- input-list validation primitives
- line-check observations and diagnostics
- monitor/AUX send facts and audits
- routing graph facts with confidence metadata
- stagebox/AVB/output routing probe instructions where not directly observable
- proposed change sets, not autonomous writes
- gated write execution only when explicitly enabled and confirmed

## Sound-engineer agent responsibilities

The consuming agent should handle:

- reading and interpreting riders
- deciding the show input list
- assigning microphones and DI boxes
- planning stage patching
- choosing monitor/IEM layout
- deciding whether a route or mix is musically acceptable
- proposing EQ/compression/gate changes
- explaining risks to the human operator
- asking the human to confirm physical patching or probe actions

## Scope classification

Classify every disputed feature before removing or implementing it:

| Classification | Meaning | Action |
|---|---|---|
| `required-current` | Needed for the current soundcheck/MCP use case | implement minimal safe version |
| `required-later` | Needed for real operation but not this slice | keep issue/docs; do not delete contracts |
| `probe-blocked` | Needed but cannot be verified without hardware/probe | keep stub/instructions/confidence metadata |
| `external-agent` | Belongs in sound-engineer agent, not MCP backend | expose primitives only |
| `speculative` | No current use case or evidence | remove/defer under YAGNI |
| `unsafe` | Could mutate hardware unexpectedly or endanger show | block or gate with explicit confirmation |

## Procedure

1. **State the live-sound task.**
   - Example: “line-check kick drum on channel 1.”
   - Example: “validate singer’s IEM send has vocal and guitar.”
   - Example: “confirm 32R stagebox input 7 reaches FOH channel 7.”

2. **Identify required facts.**
   - Which data must MCP provide for the agent to do the task?
   - Which data can only a human/operator confirm?
   - Which data is unknowable through the current adapter?

3. **Keep backend primitives; avoid agent reasoning in MCP.**
   - MCP may validate a patch sheet for range conflicts.
   - MCP should not decide the band’s final patch plan unless explicitly given the plan.
   - MCP may report that an AUX send is missing/hot/muted.
   - MCP should not decide artistic monitor balance.

4. **Do not delete required blocked features.**
   - If routing cannot be verified, keep a probe-required tool or documented limitation.
   - If show/rider schema is stubbed, mark it `external-agent` or `required-later`, not “unnecessary”.

5. **Keep writes gated.**
   - Default operation must remain read-only.
   - Write tools should operate through proposed change sets with audit/confirmation.
   - Never add autonomous mixer mutation for convenience.

6. **Update issues and docs.**
   - Record the classification in the issue.
   - Update capability matrix confidence/status.
   - Add acceptance criteria for required-current functionality.

## Acceptance criteria

- Each removed/deferred feature has an explicit scope classification.
- Essential soundcheck facts remain available as MCP primitives.
- Probe-blocked requirements are preserved as probe instructions or confidence-tagged stubs.
- External-agent responsibilities are not implemented inside the MCP backend.
- Write behavior remains disabled by default and confirmation-gated.
- README clearly separates MCP capabilities from consuming sound-engineer-agent behavior.

## Failure modes to avoid

- Removing AVB/stagebox/routing work as YAGNI because it is difficult to verify.
- Implementing rider interpretation inside the MCP server instead of exposing validation primitives.
- Treating artistic mix decisions as backend validation.
- Allowing autonomous writes because an agent “knows what to do”.
- Conflating “not implemented now” with “not required”.
