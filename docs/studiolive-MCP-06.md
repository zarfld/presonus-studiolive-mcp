i have a notebookLM which holds a lot of infrormation about studiolive , mixing workflows  https://notebooklm.google.com/notebook/3793180c-57c7-4439-8be4-1741995a943f https://notebooklm.google.com/notebook/367dac3c-10f3-4862-9606-bb922430c01d https://notebooklm.google.com/notebook/7120a796-fd9d-4ccb-a984-8e6928936061 https://notebooklm.google.com/notebook/b0140fe2-26cd-4e22-b560-ef8915fdb132  please instruct my agent to use those using these resources during the development phases! 

Below is a paste-ready instruction block for your development agent.

---

# Agent instruction: use NotebookLM knowledge base during development

## Context

This project is an MCP server for PreSonus StudioLive mixers, based initially on `featherbear/presonus-studiolive-api`.

The server shall provide mixer context to AI agents for:

```text
show preparation
rider analysis
input-list generation
patch planning
routing validation
soundcheck assistance
mixer-state inspection
Fat Channel / EQ / compressor analysis
```

It shall **not** perform autonomous live mixing. Write/control features, if implemented later, must be gated behind explicit confirmation and change-set review.

The user has four NotebookLM notebooks containing important project knowledge:

```text
https://notebooklm.google.com/notebook/3793180c-57c7-4439-8be4-1741995a943f
https://notebooklm.google.com/notebook/367dac3c-10f3-4862-9606-bb922430c01d
https://notebooklm.google.com/notebook/7120a796-fd9d-4ccb-a984-8e6928936061
https://notebooklm.google.com/notebook/b0140fe2-26cd-4e22-b560-ef8915fdb132
```

These notebooks must be treated as **development references**, not as runtime dependencies.

---

## Access rule

Do not assume that the NotebookLM URLs are machine-readable from code.

NotebookLM notebooks can be shared publicly by setting access to “Anyone with a link,” but access still depends on Google account/session and sharing configuration. Google’s help documentation also notes that viewers may still be able to access sources and artifacts in shared notebooks, so these links should be treated as knowledge-sharing artifacts, not as stable API endpoints. ([Google Hilfe][1])

For reliable development use, export the relevant notebook outputs into repository-controlled files.

Google documents that NotebookLM notes can be exported to Google Docs or Google Sheets, and generated reports or data tables can also be exported to Docs/Sheets. ([Google Hilfe][2])

---

# Required knowledge-ingestion workflow

## Phase 0 — export NotebookLM knowledge

Before implementing MCP behavior, create a local knowledge base inside the repository:

```text
docs/knowledge/notebooklm/
  01-studiolive-api-and-control.md
  02-studiolive-routing-and-avb.md
  03-mixing-workflows-and-soundcheck.md
  04-fat-channel-eq-compressor.md
  index.md
  source-map.md
```

For each NotebookLM notebook:

1. Open the notebook.
2. Generate or locate the relevant notes/reports.
3. Export notes/reports to Google Docs or Sheets where useful.
4. Convert the exported content to Markdown.
5. Store it under `docs/knowledge/notebooklm/`.
6. Preserve the original notebook URL and export date in front matter.

Example Markdown front matter:

```yaml
---
source_type: notebooklm_export
notebook_url: "https://notebooklm.google.com/notebook/3793180c-57c7-4439-8be4-1741995a943f"
exported_at: "2026-06-24"
topic: "StudioLive API and control"
status: "reference"
---
```

---

## Phase 1 — classify the notebook knowledge

Create:

```text
docs/knowledge/notebooklm/index.md
```

with this structure:

```markdown
# NotebookLM Knowledge Index

## StudioLive device/control API
- Relevant files:
- Important claims:
- Open questions:
- Must verify on real mixer:

## StudioLive routing / AVB / stagebox topology
- Relevant files:
- Important claims:
- Open questions:
- Must verify on real mixer:

## FOH workflow / rider preparation / soundcheck
- Relevant files:
- Important claims:
- Open questions:
- Must verify during soundcheck:

## Fat Channel / EQ / compressor / gate / limiter
- Relevant files:
- Important claims:
- Open questions:
- Must verify by state probing:

## PreSonus scene/project workflow
- Relevant files:
- Important claims:
- Open questions:
- Must verify on real mixer:
```

Every claim that affects code must be classified as one of:

```text
documented
observed
inferred
unverified
obsolete-risk
```

Do not implement protocol mappings from NotebookLM text alone unless marked `documented` or `observed`.

---

# Development rules

## Rule 1 — NotebookLM knowledge is advisory

NotebookLM exports may guide implementation, but they do not override:

```text
actual TypeScript declarations
actual featherbear API behavior
real mixer state dumps
protocol captures
hardware-in-loop tests
MCP specification
```

If NotebookLM says one thing and observed mixer state says another, observed state wins.

---

## Rule 2 — every mixer JSON structure must be verified

For all structures exposed by MCP, generate or validate schemas from:

```text
1. Zod schema in src/schemas/
2. unit tests
3. captured mixer fixtures
4. hardware-in-loop probe results
```

Do not invent raw PreSonus state paths. Use `presonus-probe` to discover and confirm them.

---

## Rule 3 — Fat Channel models need empirical mapping

NotebookLM may contain useful descriptions of Fat Channel EQ and compressor models, but the MCP server must map the **actual raw mixer values**.

Create and maintain:

```text
docs/generated/fat-channel-enum-map.md
test/fixtures/fat-channel/
```

For each compressor/EQ model:

```text
display name
normalized enum
raw state key
raw value
mixer model
firmware version
verification method
date verified
```

Example:

```markdown
| Area | Display name | Normalized enum | Raw key | Raw value | Verified on | Confidence |
|---|---|---:|---|---:|---|---|
| Compressor | FET | FET | TBD | TBD | 32SC | observed |
| EQ | Passive | PASSIVE | TBD | TBD | 32SC | observed |
```

Until verified, use:

```ts
confidence: "unverified"
```

or:

```ts
normalized: "UNKNOWN"
```

---

## Rule 4 — show workflow knowledge must become prompts and analysis tools

Information from the NotebookLM mixing-workflow notebooks should be converted into MCP prompts and safe analysis tools.

Create prompts such as:

```text
prepare_show_from_rider
generate_soundcheck_plan
analyze_current_scene_against_rider
validate_vocal_monitor_risk
validate_drum_input_patch
summarize_gain_structure_issues
```

Create tools such as:

```text
compare_rider_to_mixer
generate_patch_plan
validate_routing
summarize_meter_anomalies
prepare_change_set
```

Do not expose low-level mixer actions as the primary interface.

---

## Rule 5 — use change sets, not direct live mixing

The agent may generate:

```text
proposed channel renames
proposed patch changes
proposed mute/fader/routing corrections
proposed scene preparation checklist
```

But it must not directly perform live mixing.

Any future write feature must go through:

```text
prepare_change_set
dry_run_change_set
human review
apply_change_set
audit log
```

---

# Implementation phases using NotebookLM resources

## Phase A — knowledge export and indexing

Tasks:

```text
export NotebookLM notes/reports
convert to Markdown
create docs/knowledge/notebooklm/index.md
classify claims
identify implementation-relevant facts
identify verification requirements
```

Deliverables:

```text
docs/knowledge/notebooklm/*.md
docs/knowledge/notebooklm/index.md
docs/knowledge/notebooklm/source-map.md
```

---

## Phase B — API and state discovery

Use NotebookLM only to guide what to look for.

Tasks:

```text
create presonus-probe CLI
auto-discover mixers
connect to 32SC and 32R
dump full state
capture event stream
capture meter stream
diff state after manual UC Surface changes
```

Deliverables:

```text
captures/<date>/<device>/state-full.json
captures/<date>/<device>/events.jsonl
captures/<date>/<device>/meters.jsonl
docs/generated/state-key-map.md
docs/generated/fat-channel-enum-map.md
```

---

## Phase C — schema design

Use NotebookLM workflow knowledge to decide what the MCP server should expose.

Tasks:

```text
define normalized MixerDevice schema
define MixerChannel schema
define FatChannel schema
define RoutingGraph schema
define RiderPlan schema
define SoundcheckChecklist schema
define MeterSummary schema
```

Deliverables:

```text
src/schemas/mixer.ts
src/schemas/channel.ts
src/schemas/fat-channel.ts
src/schemas/routing.ts
src/schemas/show.ts
src/schemas/metering.ts
```

---

## Phase D — read-only MCP server

Tasks:

```text
implement MCP resources
implement discovery tools
implement mixer-state resources
implement rider-comparison tools
implement soundcheck prompts
```

Resources:

```text
presonus://mixers
presonus://mixer/{id}/overview
presonus://mixer/{id}/channels
presonus://mixer/{id}/fat-channel-summary
presonus://mixer/{id}/meters/summary
presonus://mixer/{id}/routing
presonus://show/{showId}/input-list
presonus://show/{showId}/patch-plan
presonus://show/{showId}/soundcheck-plan
```

Tools:

```text
discover_mixers
refresh_mixer_state
compare_rider_to_mixer
generate_patch_plan
validate_routing
generate_soundcheck_checklist
summarize_meter_anomalies
```

Prompts:

```text
prepare_show_from_rider
run_soundcheck_assistant
validate_scene_before_show
analyze_fat_channel_setup
```

---

## Phase E — proposed changes only

Tasks:

```text
implement prepare_change_set
implement validate_change_set
implement export_change_set
do not implement apply_change_set initially
```

Deliverables:

```text
src/change-set/
docs/generated/change-set-contract.md
test/contract/change-set.test.ts
```

---

# Required traceability

Every implementation decision derived from NotebookLM must be traceable.

Use this format in documentation:

```markdown
## Decision: expose meter summaries, not raw meter streams

Source:
- docs/knowledge/notebooklm/03-mixing-workflows-and-soundcheck.md

Reason:
- Soundcheck assistant needs silent/hot/clipping channel detection.
- Raw meter streams are too noisy for LLM context.

Verification:
- Confirmed by presonus-probe meter capture on 32SC.
- Unit test: meter-summarizer.test.ts

Status:
- observed
```

---

# Instruction to the agent

Use this exact priority order when resolving contradictions:

```text
1. MCP specification and SDK behavior
2. Real mixer state captures from presonus-probe
3. featherbear/presonus-studiolive-api TypeScript declarations and runtime behavior
4. PreSonus official documentation/manuals
5. NotebookLM exported knowledge files
6. Inference
```

Never implement mixer-control behavior based only on inference.

---

# Minimal next action

Create this issue/task first:

```markdown
# Task: Export and index NotebookLM references

## Goal
Make the user's StudioLive and mixing-workflow NotebookLM knowledge usable during development without depending on live NotebookLM access.

## Steps
- Export relevant NotebookLM notes/reports from the four provided notebooks.
- Convert exports to Markdown.
- Store them in docs/knowledge/notebooklm/.
- Create index.md and source-map.md.
- Classify claims as documented, observed, inferred, unverified, or obsolete-risk.
- Identify which claims require real 32SC/32R verification.

## Acceptance criteria
- Repository contains Markdown exports.
- Each export has notebook URL and export date.
- index.md maps topics to files.
- source-map.md maps NotebookLM notebooks to implementation areas.
- No code depends directly on notebooklm.google.com URLs.
```

This keeps the notebooks useful while keeping the MCP server reproducible, testable and independent of Google’s interactive NotebookLM UI.

[1]: https://support.google.com/notebooklm/answer/16322204?hl=en&utm_source=chatgpt.com "Use public notebooks and featured ..."
[2]: https://support.google.com/notebooklm/answer/16262519?hl=en&utm_source=chatgpt.com "Create & add notes in NotebookLM"
