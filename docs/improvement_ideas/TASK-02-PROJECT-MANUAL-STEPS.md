# Task 2: Create GitHub Project - MANUAL STEPS REQUIRED

## Status

⚠️ **BLOCKED** - Requires manual setup via GitHub UI (Projects API limited for Projects Beta)

## Background

GitHub Projects (Beta) provides powerful visualization and tracking capabilities for requirements traceability. We need to configure a project with custom fields that map to our ISO/IEC/IEEE 29148:2018 traceability requirements.

## Project Configuration

### Basic Setup

**Project Name**: `Requirements Traceability System`

**Description**:
```
Standards-compliant requirements tracking following ISO/IEC/IEEE 29148:2018.
Tracks stakeholder requirements, functional/non-functional requirements, architecture decisions, and test cases with full bidirectional traceability.
```

**Visibility**: Private (or Public if repo is public)

### Custom Fields Configuration

Configure the following custom fields in the project:

#### 1. Phase (Single Select)
**Purpose**: Track which lifecycle phase the requirement belongs to

**Options**:
- Phase 01: Stakeholder Requirements
- Phase 02: Requirements Analysis
- Phase 03: Architecture Design
- Phase 04: Detailed Design
- Phase 05: Implementation
- Phase 06: Integration
- Phase 07: Verification & Validation
- Phase 08: Transition/Deployment
- Phase 09: Operation & Maintenance

**Colors**: Match phase label colors (D93F0B, E99695, F9D0C4, FEF2C0, BFD4F2, C2E0C6, 5319E7, 1D76DB, 0E8A16)

#### 2. Requirement Type (Single Select)
**Purpose**: Classify the type of requirement or artifact

**Options**:
- Stakeholder Requirement (StR)
- Functional Requirement (REQ-F)
- Non-Functional Requirement (REQ-NF)
- Architecture Decision (ADR)
- Architecture Component (ARC-C)
- Quality Scenario (QA-SC)
- Test Case (TEST)

**Colors**: Match requirement type label colors

#### 3. Priority (Single Select)
**Purpose**: Track requirement priority per ISO/IEC/IEEE 29148:2018

**Options**:
- P0: Critical (blocking)
- P1: High
- P2: Medium
- P3: Low

**Colors**: B60205 (critical), D93F0B (high), FBCA04 (medium), 0E8A16 (low)

#### 4. Integrity Level (Single Select)
**Purpose**: IEEE 1012-2016 software integrity levels

**Options**:
- Level 1: Highest criticality
- Level 2: High criticality
- Level 3: Medium criticality
- Level 4: Low criticality

**Colors**: B60205, D93F0B, FBCA04, 0E8A16

#### 5. Verification Method (Single Select)
**Purpose**: How the requirement will be verified

**Options**:
- Inspection (review/analysis of design)
- Analysis (analytical evaluation)
- Demonstration (functional demonstration)
- Test (execution of test cases)

**Colors**: C5DEF5, BFD4F2, 5319E7, 1D76DB

#### 6. Upstream Link (Text)
**Purpose**: Track parent requirement issue number(s)

**Format**: `#123` or `#123, #124` for multiple parents

#### 7. Downstream Links (Text)
**Purpose**: Track child requirement/test issue numbers

**Format**: `#125, #126, #127`

#### 8. Acceptance Criteria Met (Checkbox)
**Purpose**: Track whether acceptance criteria are satisfied

**Default**: Unchecked

#### 9. Verified (Checkbox)
**Purpose**: Track whether requirement has been verified

**Default**: Unchecked

#### 10. Implemented (Checkbox)
**Purpose**: Track implementation status

**Default**: Unchecked

## Views Configuration

### View 1: Backlog Board (Kanban)

**Layout**: Board

**Group By**: Status

**Columns**:
- 🆕 New (Open issues, no status label)
- 📝 Draft (status-draft label)
- ✅ Ready (status-ready label)
- 🚧 In Progress (in-progress status)
- 🔍 In Review (status-in-review label)
- ⛔ Blocked (status-blocked label)
- ✔️ Done (closed issues)

**Sort**: Priority (Critical → Low), then Created Date (oldest first)

**Filters**:
- Show: All issues in project
- Hide: None

### View 2: Traceability Matrix (Table)

**Layout**: Table

**Visible Columns** (in order):
1. Title
2. Requirement Type
3. Priority
4. Phase
5. Upstream Link
6. Downstream Links
7. Verified
8. Implemented
9. Labels
10. Assignees
11. Status

**Sort**: Requirement Type, then Phase, then Priority

**Filters**:
- Show: All issues
- Group by: Requirement Type

**Purpose**: Provides spreadsheet-like view for traceability analysis

### View 3: Phase Roadmap (Timeline/Roadmap)

**Layout**: Roadmap (if available) or Board

**Group By**: Phase

**Sort**: Priority, then Created Date

**Filters**:
- Show: Open issues only
- Hide: Test cases (focus on requirements and architecture)

**Markers**:
- Start Date: Issue created date
- Target Date: Due date (if set)

**Purpose**: Visualize requirements across lifecycle phases

### View 4: Test Coverage Dashboard (Table)

**Layout**: Table

**Visible Columns**:
1. Title
2. Requirement Type
3. Upstream Link (what it verifies)
4. Verified (checkbox)
5. Priority
6. Assignees
7. Status

**Sort**: Requirement Type, then Priority

**Filters**:
- Show: Only issues with label `test-case`
- Or: Only issues with Requirement Type = "Test Case (TEST)"

**Purpose**: Track test coverage and verification status

## Manual Setup Steps

### Step 1: Create Project

1. Go to: <https://github.com/zarfld/copilot-instructions-template/projects>
2. Click "New project"
3. Select "Board" template (we'll customize it)
4. Set Name: `Requirements Traceability System`
5. Set Description (from above)
6. Click "Create project"

### Step 2: Add Custom Fields

For each custom field (1-10 above):

1. Click "+" next to field names (top right)
2. Select field type (Single select, Text, or Checkbox)
3. Enter field name
4. For Single Select: Add all options with colors
5. Click "Save"

### Step 3: Configure Views

For each view (1-4 above):

1. Click "+" next to view tabs
2. Select "New view"
3. Choose layout (Board, Table, or Roadmap)
4. Set view name
5. Click "⋮" (three dots) → "View settings"
6. Configure:
   - Group by
   - Sort
   - Filters
   - Visible columns (for Table view)
7. Click "Save changes"

### Step 4: Link Repository

1. In project, click "⋮" → "Settings"
2. Under "Manage access" → "Add repository"
3. Select `copilot-instructions-template`
4. Set permissions: "Write" (allow bot to update)
5. Click "Add repository"

### Step 5: Configure Automation (Optional)

Set up automatic field population:

1. Go to "⋮" → "Workflows"
2. Enable: "Auto-add to project" (add new issues automatically)
3. Create custom workflow:
   ```
   When: Issue is opened
   Then:
     - If has label "stakeholder-requirement" → Set Requirement Type = "Stakeholder Requirement (StR)"
     - If has label "functional-requirement" → Set Requirement Type = "Functional Requirement (REQ-F)"
     - If has label "phase-01" → Set Phase = "Phase 01: Stakeholder Requirements"
     - Extract #N from body → Populate Upstream Link
     - (repeat for all label mappings)
   ```
4. Save workflow

## Integration with GitHub Actions

Once project is created, update `.github/workflows/issue-validation.yml` to also update project fields:

```yaml
- name: Update Project Fields
  uses: actions/github-script@v7
  with:
    script: |
      // Extract parent links from issue body
      const parentLinks = context.payload.issue.body.match(/#\d+/g) || [];
      
      // Update project custom field "Upstream Link"
      // (requires GitHub GraphQL API for Projects Beta)
```

## Verification

After setup:

1. Go to project URL
2. Verify all 10 custom fields exist
3. Verify all 4 views are configured
4. Create a test issue using one of the templates
5. Add issue to project
6. Verify fields populate correctly from labels
7. Check that issue appears in appropriate views

## Impact of Not Completing This Task

⚠️ **CRITICAL BLOCKER**:

- No visual traceability matrix
- Cannot track requirement status across lifecycle
- No dashboard for test coverage
- Stakeholders cannot see progress
- Manual tracking becomes necessary (defeats automation purpose)

## Next Steps

Once project is created:

- ✅ Mark Task 2 as complete
- 🚀 Proceed to Task 3: Update phase-01-stakeholder-requirements.instructions.md

## Related Files

- Issue templates: `.github/ISSUE_TEMPLATE/*.yml`
- Traceability workflows: `.github/workflows/traceability-check.yml`
- Quick start guide: `docs/QUICK-START-github-issues.md`

## Notes

- Projects Beta API is limited; most configuration requires UI
- GraphQL API can be used for field updates but not initial setup
- Consider exporting project configuration as JSON for backup
- Project can be made template for future repositories
