# Task 1: Configure Repository Labels - MANUAL STEPS REQUIRED

## Status
⚠️ **BLOCKED** - Requires GitHub CLI (`gh`) or manual label creation via GitHub UI

## Background
The issue templates created in `.github/ISSUE_TEMPLATE/` reference 34 labels that don't exist yet in the repository. Without these labels, the templates cannot function properly.

## Required Labels (34 total)

### Requirement Type Labels (7)
- `stakeholder-requirement` - Business context and stakeholder needs (StR) - Color: 0E8A16
- `functional-requirement` - Functional system requirements (REQ-F) - Color: 1D76DB
- `non-functional-requirement` - Quality attributes and constraints (REQ-NF) - Color: 5319E7
- `architecture-decision` - Architecture decision record (ADR) - Color: F9D0C4
- `architecture-component` - Architecture component specification (ARC-C) - Color: FBCA04
- `quality-scenario` - ATAM quality attribute scenario (QA-SC) - Color: D4C5F9
- `test-case` - Verification and validation test case (TEST) - Color: C5DEF5

### Phase Labels (9)
- `phase-01` - Phase 01: Stakeholder Requirements - Color: D93F0B
- `phase-02` - Phase 02: Requirements Analysis - Color: E99695
- `phase-03` - Phase 03: Architecture Design - Color: F9D0C4
- `phase-04` - Phase 04: Detailed Design - Color: FEF2C0
- `phase-05` - Phase 05: Implementation - Color: BFD4F2
- `phase-06` - Phase 06: Integration - Color: C2E0C6
- `phase-07` - Phase 07: Verification & Validation - Color: 5319E7
- `phase-08` - Phase 08: Transition/Deployment - Color: 1D76DB
- `phase-09` - Phase 09: Operation & Maintenance - Color: 0E8A16

### Priority Labels (4)
- `priority-critical` - P0: Critical priority - blocking - Color: B60205
- `priority-high` - P1: High priority - Color: D93F0B
- `priority-medium` - P2: Medium priority - Color: FBCA04
- `priority-low` - P3: Low priority - Color: 0E8A16

### Integrity Level Labels (4) - IEEE 1012-2016
- `integrity-1` - Integrity Level 1: Highest criticality - Color: B60205
- `integrity-2` - Integrity Level 2: High criticality - Color: D93F0B
- `integrity-3` - Integrity Level 3: Medium criticality - Color: FBCA04
- `integrity-4` - Integrity Level 4: Low criticality - Color: 0E8A16

### Status Labels (4)
- `status-draft` - Draft state - work in progress - Color: EDEDED
- `status-ready` - Ready for implementation - Color: C2E0C6
- `status-blocked` - Blocked - waiting on dependency - Color: B60205
- `status-in-review` - Under review - Color: FBCA04

### Verification Method Labels (4)
- `verify-inspection` - Verification by inspection/review - Color: C5DEF5
- `verify-analysis` - Verification by analysis - Color: BFD4F2
- `verify-demonstration` - Verification by demonstration - Color: 5319E7
- `verify-test` - Verification by testing - Color: 1D76DB

## Option 1: Using GitHub CLI (Recommended)

If you have GitHub CLI installed:

```bash
# Install GitHub CLI first if needed
# Windows: winget install GitHub.cli
# Or download from: https://cli.github.com/

# Authenticate
gh auth login

# Run the script
bash scripts/create-labels.sh
# OR for PowerShell (requires GITHUB_TOKEN):
$env:GITHUB_TOKEN = "your_personal_access_token"
powershell -ExecutionPolicy Bypass -File scripts/create-labels-api.ps1
```

## Option 2: Manual Creation via GitHub UI

1. Go to: https://github.com/zarfld/copilot-instructions-template/labels
2. For each label above, click "New label"
3. Enter:
   - Name: (from list above)
   - Description: (from list above)
   - Color: (hex code from list above, without #)
4. Click "Create label"
5. Repeat 34 times 😅

## Option 3: Bulk Import via GitHub API

Use the PowerShell script with a GitHub Personal Access Token:

```powershell
# 1. Create token at: https://github.com/settings/tokens/new
#    Scopes needed: repo (full)
# 2. Set environment variable:
$env:GITHUB_TOKEN = "ghp_your_token_here"
# 3. Run script:
powershell -ExecutionPolicy Bypass -File scripts/create-labels-api.ps1
```

## Verification

After labels are created, verify:
```powershell
# Option 1: Via GitHub UI
# Visit: https://github.com/zarfld/copilot-instructions-template/labels
# Should see all 34 labels

# Option 2: Via API (requires GITHUB_TOKEN)
curl -H "Authorization: Bearer $env:GITHUB_TOKEN" `
     -H "Accept: application/vnd.github+json" `
     https://api.github.com/repos/zarfld/copilot-instructions-template/labels
```

## Impact of Not Completing This Task

⚠️ **CRITICAL BLOCKER**:
- Issue templates will show label dropdowns with NO OPTIONS
- Users cannot properly categorize requirements
- Traceability workflows will break (depend on labels for filtering)
- GitHub Actions workflows use labels for validation
- GitHub Project boards use labels for views

## Next Steps

Once labels are created:
- ✅ Mark Task 1 as complete
- 🚀 Proceed to Task 2: Create GitHub Project

## Created Files

- `scripts/create-labels.sh` - Bash script (requires gh CLI)
- `scripts/create-labels.ps1` - PowerShell script (encoding issues)
- `scripts/create-labels-api.ps1` - PowerShell + GitHub API script (requires GITHUB_TOKEN)
