# Copilot Instructions Template Repository

A comprehensive template repository that integrates **IEEE/ISO/IEC software engineering standards** with **Extreme Programming (XP) techniques** and **GitHub Copilot instructions** for consistent, high-quality software development.

## 🎯 Purpose

This repository provides:
- **Standards-compliant** software lifecycle management (IEEE/ISO/IEC)
- **XP practices** integration (TDD, Pair Programming, Continuous Integration)
- **Phase-specific Copilot instructions** with `applyTo:` patterns
- **Spec-driven development** templates using GitHub Spec-Kit
- **Automated compliance** checking and validation

## 📚 Standards Implemented

| Standard | Purpose | Coverage |
|----------|---------|----------|
| **ISO/IEC/IEEE 12207:2017** | Software life cycle processes | Complete lifecycle framework |
| **ISO/IEC/IEEE 29148:2018** | Requirements engineering | Requirements elicitation, analysis, specification |
| **IEEE 1016-2009** | Software design descriptions | Architecture and detailed design |
| **ISO/IEC/IEEE 42010:2011** | Architecture description | Architecture views, viewpoints, concerns |
| **IEEE 1012-2016** | Verification & validation | V&V planning, testing, reviews |

## 🚀 XP Practices Integrated

- **Test-Driven Development (TDD)** - Write tests first
- **Continuous Integration** - Integrate frequently
- **Pair Programming** - Collaborative development
- **Simple Design** - YAGNI principle
- **Refactoring** - Continuous improvement
- **Collective Code Ownership** - Shared responsibility
- **User Stories** - Effective use cases

## 📁 Repository Structure

```
copilot-instructions-template/
├── .github/
│   ├── copilot-instructions.md          # Root Copilot instructions
│   ├── workflows/                        # CI/CD automation
│   └── ISSUE_TEMPLATE/                   # Issue templates
│
├── 01-stakeholder-requirements/
│   ├── .github/copilot-instructions.md   # Phase-specific instructions
│   ├── stakeholders/                     # Stakeholder analysis
│   ├── business-context/                 # Business needs
│   └── templates/                        # Requirements templates
│
├── 02-requirements/
│   ├── .github/copilot-instructions.md
│   ├── functional/                       # Functional requirements
│   ├── non-functional/                   # Quality attributes
│   ├── use-cases/                        # Use case specifications
│   └── user-stories/                     # XP user stories
│
├── 03-architecture/
│   ├── .github/copilot-instructions.md
│   ├── decisions/                        # ADRs (Architecture Decision Records)
│   ├── views/                            # IEEE 42010 architecture views
│   ├── diagrams/                         # C4, UML diagrams
│   └── constraints/                      # Technical constraints
│
├── 04-design/
│   ├── .github/copilot-instructions.md
│   ├── components/                       # Component designs
│   ├── interfaces/                       # API specifications
│   ├── data-models/                      # Data structures
│   └── patterns/                         # Design patterns used
│
├── 05-implementation/
│   ├── .github/copilot-instructions.md
│   ├── src/                              # Source code
│   ├── tests/                            # Test-first XP tests
│   └── docs/                             # Code documentation
│
├── 06-integration/
│   ├── .github/copilot-instructions.md
│   ├── integration-tests/                # Integration test suites
│   ├── ci-config/                        # CI/CD configurations
│   └── deployment/                       # Deployment scripts
│
├── 07-verification-validation/
│   ├── .github/copilot-instructions.md
│   ├── test-plans/                       # IEEE 1012 test plans
│   ├── test-cases/                       # Detailed test cases
│   ├── test-results/                     # Test execution results
│   └── traceability/                     # Requirements traceability
│
├── 08-transition/
│   ├── .github/copilot-instructions.md
│   ├── deployment-plans/                 # Deployment strategies
│   ├── user-documentation/               # End-user guides
│   └── training-materials/               # Training resources
│
├── 09-operation-maintenance/
│   ├── .github/copilot-instructions.md
│   ├── monitoring/                       # Operations monitoring
│   ├── incident-response/                # Incident management
│   └── maintenance-logs/                 # Change logs
│
├── spec-kit-templates/
│   ├── requirements-spec.md              # IEEE 29148 templates
│   ├── design-spec.md                    # IEEE 1016 templates
│   ├── architecture-spec.md              # IEEE 42010 templates
│   ├── test-spec.md                      # IEEE 1012 templates
│   └── user-story-template.md            # XP user story template
│
├── standards-compliance/
│   ├── checklists/                       # Phase-specific checklists
│   ├── reviews/                          # Review reports
│   └── metrics/                          # Quality metrics
│
└── docs/
    ├── lifecycle-guide.md                # Complete lifecycle guide
    ├── xp-practices.md                   # XP implementation guide
    ├── copilot-usage.md                  # How to use Copilot instructions
    └── standards-reference.md            # Standards quick reference
```

## 🎓 How to Use This Template

### 1. Create New Project from Template

```bash
# Create repository from this template on GitHub
# OR clone and customize
git clone https://github.com/YOUR_ORG/copilot-instructions-template.git my-new-project
cd my-new-project
```

### 2. Initialize Your Project

```bash
# Update project-specific information
# Edit .github/copilot-instructions.md with your project details
# Customize templates in spec-kit-templates/
```

### 3. Follow the Lifecycle Phases

Start with **Phase 01** and progress through each phase:

1. **Stakeholder Requirements** - Understand business needs
2. **Requirements** - Define what to build (IEEE 29148)
3. **Architecture** - Design system structure (IEEE 42010)
4. **Design** - Detail component design (IEEE 1016)
5. **Implementation** - Code with TDD (XP practices)
6. **Integration** - Continuous integration (XP)
7. **Verification & Validation** - Test thoroughly (IEEE 1012)
8. **Transition** - Deploy to production
9. **Operation & Maintenance** - Monitor and improve

### 4. Use Copilot with Phase Instructions

GitHub Copilot will automatically load phase-specific instructions based on the folder you're working in:

- Navigate to a phase folder (e.g., `02-requirements/`)
- Copilot reads `.github/copilot-instructions.md` in that folder
- Get context-aware suggestions aligned with standards

### 5. Leverage Spec-Kit Templates

Use markdown specifications for AI-assisted development:

```bash
# Copy template for your feature
cp spec-kit-templates/requirements-spec.md 02-requirements/functional/feature-xyz.md

# Fill in the specification
# Use GitHub Copilot to generate code from spec
```

## 🤖 Copilot Instructions Features

### ApplyTo Patterns

Copilot instructions use `applyTo:` patterns to target specific file types:

```yaml
applyTo:
  - "02-requirements/**/*.md"
  - "02-requirements/**/use-cases/*.md"
  - "02-requirements/**/user-stories/*.md"
```

### Standards Enforcement

Each phase enforces relevant standards:

```markdown
## Standards Compliance
- IEEE 29148:2018 - Requirements specification format
- Traceability matrix required
- Review checklist completion mandatory
```

### XP Practices Integration

```markdown
## XP Practices
- Write user stories in Given-When-Then format
- Maintain story point estimates
- Track velocity
```

## 🎫 GitHub Issues Workflow

This template uses **GitHub Issues as the primary traceability mechanism** for all requirements, architecture decisions, and test cases. All artifacts are tracked as issues with bidirectional links.

### Issue Types and Labels

| Type | Label | Prefix | Description | Example |
|------|-------|--------|-------------|---------|
| **Stakeholder Requirement** | `type:stakeholder-requirement` | `StR-` | Business needs and context | `StR-001: User Authentication` |
| **Functional Requirement** | `type:requirement:functional` | `REQ-F-` | System functional behavior | `REQ-F-AUTH-001: Login with credentials` |
| **Non-Functional Requirement** | `type:requirement:non-functional` | `REQ-NF-` | Quality attributes | `REQ-NF-PERF-001: Response time < 200ms` |
| **Architecture Decision** | `type:architecture:decision` | `ADR-` | Architectural choices | `ADR-SECU-001: Use JWT authentication` |
| **Architecture Component** | `type:architecture:component` | `ARC-C-` | Component specifications | `ARC-C-AUTH-001: Authentication service` |
| **Quality Scenario** | `type:architecture:quality-scenario` | `QA-SC-` | ATAM quality scenarios | `QA-SC-PERF-001: Peak load scenario` |
| **Test Case** | `type:test` | `TEST-` | Verification specifications | `TEST-AUTH-LOGIN-001: Valid login test` |

Additional labels:

- **Phase**: `phase:01-stakeholder-requirements`, `phase:02-requirements`, etc.
- **Priority**: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
- **Test Type**: `test-type:unit`, `test-type:integration`, `test-type:e2e`, `test-type:acceptance`
- **Status**: `status:draft`, `status:approved`, `status:implemented`, `status:verified`

### Traceability Patterns

All issues must include traceability links:

```markdown
## Traceability
- Traces to:  #123 (parent StR issue)
- **Depends on**: #45, #67 (prerequisite requirements)
- **Verified by**: #89, #90 (test issues)
- **Implemented by**: #PR-15 (pull request)
- **Refined by**: #234, #235 (child requirements)
```

### Issue Templates

Issue templates are available in `.github/ISSUE_TEMPLATE/`:

- `stakeholder-requirement.yml`
- `functional-requirement.yml`
- `non-functional-requirement.yml`
- `architecture-decision.yml`
- `architecture-component.yml`
- `quality-scenario.yml`
- `test-case.yml`

### Workflow Examples

#### 1. Create Stakeholder Requirement Issue

```bash
# Using GitHub CLI
gh issue create \
  --title "StR-001: User Authentication" \
  --label "type:stakeholder-requirement,phase:01-stakeholder-requirements,priority:critical" \
  --body "$(cat issue-body.md)"
```

#### 2. Create Functional Requirement from StR

```markdown
## Traceability
- Traces to:  #1 (StR-001: User Authentication)

## Description
System shall allow users to log in with username and password.

## Acceptance Criteria
- [ ] User can enter username and password
- [ ] System validates credentials
- [ ] User is redirected to dashboard on success
- [ ] Error message displayed on failure
```

#### 3. Link Code to Issues

```python
"""
User authentication service.

Implements: #2 (REQ-F-AUTH-001: User Login)
Architecture: #5 (ADR-SECU-001: JWT Authentication)
Verified by: #10 (TEST-AUTH-LOGIN-001)

See: https://github.com/org/repo/issues/2
"""
class AuthenticationService:
    pass
```

#### 4. Link Tests to Requirements

```python
"""
Test user login functionality.

Verifies: #2 (REQ-F-AUTH-001: User Login)
Test Type: Integration
Priority: P0 (Critical)
"""
def test_user_login_success():
    # Test implementation
```

#### 5. Link Pull Requests

```markdown
## Description
Implements user authentication feature

## Related Issues
Fixes #2
Implements #5
Part of #1

## Traceability
- **Requirements**: #2 (REQ-F-AUTH-001)
- **Design**: #5 (ADR-SECU-001)
- **Tests**: #10 (TEST-AUTH-LOGIN-001)
```

### Python Automation Scripts

Available in `scripts/`:

- **`generate-traceability-matrix.py`** - Generate REQ↔TEST↔CODE matrix
- **`trace_unlinked_requirements.py`** - Find requirements without tests
- **`validate-traceability.py`** - Validate bidirectional links
- **`scripts/generate-requirement-issues.py`** - Generate REQ issues from specs
- **`scripts/generate-test-issues.py`** - Generate TEST issues from requirements
- **`scripts/validate-issue-traceability.py`** - Validate GitHub Issues traceability

Example usage:

```bash
# Find requirements without tests
python scripts/trace_unlinked_requirements.py

# Validate traceability
python scripts/validate-traceability.py

# Generate traceability matrix
python scripts/generate-traceability-matrix.py --output-html
```

### CI/CD Integration

GitHub Actions workflows validate traceability:

```yaml
# .github/workflows/validate-traceability.yml
name: Validate Traceability
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate issue links
        run: python scripts/validate-issue-traceability.py
      - name: Check test coverage
        run: python scripts/validate-trace-coverage.py
      - name: Generate matrix
        run: python scripts/generate-traceability-matrix.py
```

### Best Practices

1. **Always create issues before code** - No code without linked issue
2. **Use bidirectional links** - Parent issues list children, children reference parents
3. **Link PRs to issues** - Use `Fixes #N`, `Implements #N`, `Part of #N`
4. **Include issue references in code** - Docstrings, comments, commit messages
5. **Validate traceability in CI** - Block merges if links are missing
6. **Keep issues up-to-date** - Close when implemented and verified
7. **Use labels consistently** - Enables automated queries and reports

### Querying Issues

```bash
# List all functional requirements
gh issue list --label "type:requirement:functional"

# Find requirements without tests
gh issue list --label "type:requirement:functional" --json number,title,labels \
  | jq '.[] | select(.labels | map(.name) | contains(["status:verified"]) | not)'

# Show traceability for requirement #2
gh issue view 2 --json body | jq -r '.body' | grep -A 10 "## Traceability"

# List all open architecture decisions
gh issue list --label "type:architecture:decision" --state open
```

## 🔍 Quality Assurance

### Automated Checks

- **Standards compliance** checking via GitHub Actions
- **Requirements traceability** validation (GitHub Issues API)
- **Test coverage** enforcement (XP: >80%)
- **Documentation completeness** checks
- **Issue link validation** (bidirectional traceability)

### Review Gates

Each phase includes:

- ✅ Entry criteria checklist
- ✅ Phase activities checklist
- ✅ Exit criteria validation
- ✅ Standards compliance review
- ✅ Traceability validation (all requirements have tests)

## 📖 Documentation

- **[Lifecycle Guide](docs/lifecycle-guide.md)** - Complete walkthrough of all phases
- **[XP Practices Guide](docs/xp-practices.md)** - How to apply XP techniques
- **[Copilot Usage Guide](docs/copilot-usage.md)** - Maximizing Copilot effectiveness
- **[Standards Reference](docs/standards-reference.md)** - Quick reference to all standards

## 🛠️ Customization

### Adding Custom Phases

1. Create folder: `XX-custom-phase/`
2. Add `.github/copilot-instructions.md`
3. Define applyTo patterns
4. Update root copilot-instructions.md

### Extending Templates

1. Add templates to `spec-kit-templates/`
2. Follow Spec-Kit markdown format
3. Include standards references
4. Add examples

## 🤝 Contributing

This template is designed to be:

- **Forked** for your organization
- **Customized** to your processes
- **Extended** with your practices
- **Shared** with your teams

## 📄 License

[Specify your license here]

## 🔗 References

- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [Spec-Driven Development Blog Post](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-using-markdown-as-a-programming-language-when-building-with-ai/)
- [ISO/IEC/IEEE Standards](https://www.iso.org)
- [Extreme Programming Explained (Kent Beck)](http://www.extremeprogramming.org/)

---

## 🚀 Get Started

Ready to build standards-compliant software with AI assistance? Start with Phase 01!
