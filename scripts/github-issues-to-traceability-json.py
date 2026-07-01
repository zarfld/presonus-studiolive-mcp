#!/usr/bin/env python3
"""Convert GitHub Issues to traceability.json format

Fetches requirements from GitHub Issues and generates:
  1. build/traceability.json                               â€” ephemeral CI artifact
     (backward-compatible format for validate-trace-coverage.py)
  2. 07-verification-validation/traceability/
       requirements-traceability.generated.json            â€” committed, deterministic
  3. 07-verification-validation/traceability/
       requirements-traceability.generated.md              â€” committed, human-readable

Source annotations (@implements, @verifies) in packages/**/*.ts are scanned locally
and joined with GitHub issue data.

HIL test FILE EXISTENCE is noted, but HIL tests are NOT executed â€” they require
real hardware that is not available on GitHub-hosted runners.

Usage:
    GITHUB_TOKEN=ghp_xxx GITHUB_REPOSITORY=owner/repo python scripts/github-issues-to-traceability-json.py
    pnpm traceability  (same, via package.json script)
"""
import os
import sys
import json
import re
from pathlib import Path
from collections import defaultdict
from github import Github

ROOT = Path(__file__).resolve().parents[1]
OUT_EPHEMERAL = ROOT / 'build' / 'traceability.json'
TRACEABILITY_DIR = ROOT / '07-verification-validation' / 'traceability'
OUT_JSON = TRACEABILITY_DIR / 'requirements-traceability.generated.json'
OUT_MD = TRACEABILITY_DIR / 'requirements-traceability.generated.md'

# Labels that exempt a closed issue from stale_closed_issue status
WONTFIX_LABELS = frozenset({
    'wontfix', 'obsolete', 'duplicate', 'invalid',
    'status:wontfix', 'status:obsolete', 'status:duplicate', 'status:invalid',
})

# Types that have full traceability requirements (REQ â†’ impl â†’ verif)
CANONICAL_REQUIREMENT_TYPES = frozenset({'REQ-F', 'REQ-NF'})
# Types tracked but not requiring full impl+verif chains
NON_REQ_TYPES = frozenset({'IMP', 'DOC', 'HOUSEKEEPING', 'EPIC', 'BUG', 'PROBE'})

# Annotation regex â€” supports all observed forms:
#   @implements #N REQ-ID
#   @implements REQ-ID (#N)
#   @implements REQ-ID
#   @implements #N
ANNOTATION_RE = re.compile(
    r'@(implements|verifies)\s+'
    r'(?:#(\d+)\s*)?'                   # optional issue# first
    r'(REQ-[A-Za-z0-9_/-]+|StR-[A-Za-z0-9_-]+|ADR-[A-Za-z0-9_-]+'
    r'|ARC-C-[A-Za-z0-9_-]+|QA-SC-[A-Za-z0-9_-]+|TEST-[A-Za-z0-9_-]+)?'
    r'(?:\s*\(#(\d+)\))?',              # optional (#N) after REQ-ID
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Source annotation scanner
# ---------------------------------------------------------------------------

def scan_source_annotations(root: Path):
    """Scan packages/**/*.ts for @implements and @verifies annotations.

    Returns:
        (by_issue, by_req_id, orphan_implements, orphan_verifies)

        by_issue      : {issue_number: {'implements': [...], 'verifies': [...], 'hilVerifies': [...]}}
        by_req_id     : {req_id: {'implements': [...], 'verifies': [...], 'hilVerifies': [...]}}
        orphan_implements : annotations with REQ-ID only (no issue#)
        orphan_verifies   : annotations with REQ-ID only (no issue#)
    """
    def _mk():
        return {'implements': [], 'verifies': [], 'hilVerifies': []}

    by_issue = defaultdict(_mk)
    by_req_id = defaultdict(_mk)
    orphan_implements = []
    orphan_verifies = []

    packages_dir = root / 'packages'
    if not packages_dir.exists():
        return dict(by_issue), dict(by_req_id), orphan_implements, orphan_verifies

    for ts_file in sorted(packages_dir.rglob('*.ts')):
        if 'node_modules' in ts_file.parts or 'dist' in ts_file.parts:
            continue

        is_hil = ts_file.name.endswith('.hil.test.ts')
        rel_path = str(ts_file.relative_to(root)).replace('\\', '/')

        try:
            content = ts_file.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue

        for lineno, line in enumerate(content.splitlines(), start=1):
            for m in ANNOTATION_RE.finditer(line):
                ann_type = m.group(1).lower()
                issue_a = int(m.group(2)) if m.group(2) else None
                req_id = m.group(3).upper() if m.group(3) else None
                issue_b = int(m.group(4)) if m.group(4) else None

                issue_num = issue_a or issue_b
                entry = {'file': rel_path, 'line': lineno}
                kind = 'hilVerifies' if (is_hil and ann_type == 'verifies') else ann_type

                if issue_num:
                    by_issue[issue_num][kind].append(entry)
                    if req_id:
                        by_req_id[req_id][kind].append(entry)
                elif req_id:
                    by_req_id[req_id][kind].append(entry)
                    orphan = {'file': rel_path, 'line': lineno, 'reqId': req_id, 'issueNumber': None}
                    if ann_type == 'implements':
                        orphan_implements.append(orphan)
                    else:
                        orphan_verifies.append(orphan)

    return (
        {k: dict(v) for k, v in by_issue.items()},
        {k: dict(v) for k, v in by_req_id.items()},
        orphan_implements,
        orphan_verifies,
    )


# ---------------------------------------------------------------------------
# Capability inventory loader
# ---------------------------------------------------------------------------

def load_capability_inventory(root: Path) -> dict:
    """Load capability-inventory.json and build lookup maps."""
    inv_path = root / 'docs' / 'generated' / 'capability-inventory.json'
    if not inv_path.exists():
        print(f'Warning: capability inventory not found at {inv_path}', file=sys.stderr)
        return {'by_issue': {}, 'by_req_id': {}, 'missing': []}
    try:
        inv = json.loads(inv_path.read_text(encoding='utf-8'))
    except Exception as exc:
        print(f'Warning: failed to parse capability inventory: {exc}', file=sys.stderr)
        return {'by_issue': {}, 'by_req_id': {}, 'missing': []}

    by_issue: dict = defaultdict(list)
    by_req_id: dict = defaultdict(list)
    missing = []

    for entry in inv.get('tools', []) + inv.get('resources', []):
        name = entry.get('name', '')
        kind = entry.get('kind', 'tool')
        confidence = entry.get('confidence', 'unknown')
        safety_class = entry.get('safetyClass', '')
        traceability = entry.get('traceability', '') or ''
        hil_required = confidence == 'probe_required'

        cap = {'name': name, 'kind': kind, 'confidence': confidence,
               'safetyClass': safety_class, 'hilRequired': hil_required}

        if not traceability or traceability == 'missing':
            missing.append({'name': name, 'kind': kind, 'reason': 'traceability: missing'})
            continue

        issue_nums = [int(n) for n in re.findall(r'#(\d+)', traceability)]
        req_ids = [r.upper() for r in re.findall(
            r'(REQ-[A-Za-z0-9_/-]+|StR-[A-Za-z0-9_-]+|ADR-[A-Za-z0-9_-]+)',
            traceability, re.IGNORECASE)]

        for num in issue_nums:
            by_issue[num].append(cap)
        for rid in req_ids:
            by_req_id[rid].append(cap)
        if not issue_nums and not req_ids:
            missing.append({'name': name, 'kind': kind,
                            'reason': f'traceability ref unparseable: {traceability!r}'})

    return {'by_issue': dict(by_issue), 'by_req_id': dict(by_req_id), 'missing': missing}


# ---------------------------------------------------------------------------
# Status computation
# ---------------------------------------------------------------------------

def compute_status(item: dict) -> str:
    """Compute traceability status. hil_blocked/probe_blocked are WARN-only in CI."""
    req_type = item.get('type', 'UNKNOWN')
    state = item.get('state', 'open')
    implements = item.get('implements', [])
    verifies = item.get('verifies', [])
    hil_verifies = item.get('hilVerifies', [])
    hil_required = item.get('hilRequired', False)
    capability_confidence = item.get('confidence') or ''
    item_labels = frozenset(item.get('labels', []))

    if req_type == 'UNKNOWN':
        return 'unknown_type'
    if req_type in NON_REQ_TYPES:
        return 'manual_review_required'

    # probe/HIL â€” warn only (no hardware on GitHub-hosted runners)
    if capability_confidence == 'probe_required':
        return 'probe_blocked'
    if hil_required and not hil_verifies:
        return 'hil_blocked'

    # Non-requirement tracked types (ADR, ARC-C, QA-SC, TEST, StR)
    if req_type not in CANONICAL_REQUIREMENT_TYPES:
        return 'complete' if state == 'closed' else 'planned'

    # REQ-F / REQ-NF full chain
    if state == 'closed' and not implements and not verifies:
        if not (item_labels & WONTFIX_LABELS):
            return 'stale_closed_issue'
    if not implements:
        return 'requirement_without_implementation'
    if not verifies:
        return 'implemented_not_verified'
    return 'complete'


def compute_gaps(item: dict) -> list:
    """Generate human-readable gap descriptions."""
    gaps = []
    if item.get('type') not in CANONICAL_REQUIREMENT_TYPES:
        return gaps
    if not item.get('implements'):
        gaps.append('no @implements annotation found in source')
    if not item.get('verifies') and not item.get('hilVerifies'):
        gaps.append('no @verifies annotation found in tests')
    if item.get('hilRequired') and not item.get('hilVerifies'):
        gaps.append('HIL test with @verifies required (probe_required capability); cannot verify in CI')
    if not item.get('capability'):
        gaps.append('no MCP capability mapped to this requirement')
    return gaps


# ---------------------------------------------------------------------------
# Issue body link extractor (backward compat â€” unchanged logic)
# ---------------------------------------------------------------------------

def extract_issue_links(body: str) -> dict:
    """Extract ALL #N issue references from body text."""
    if not body:
        return {'traces_to': []}
    all_refs = re.findall(r'#(\d+)', body)
    return {'traces_to': sorted(set(int(r) for r in all_refs))}


# ---------------------------------------------------------------------------
# Markdown generator
# ---------------------------------------------------------------------------

def generate_markdown(
    items: list,
    orphan_implements: list,
    orphan_verifies: list,
    caps_without_traceability: list,
    repo_name: str,
) -> str:
    lines = [
        '# Requirements Traceability Matrix',
        '',
        '> **Auto-generated** by `pnpm traceability`. Do not edit manually.',
        f'> **Repository**: `{repo_name}`',
        '> **Standard**: ISO/IEC/IEEE 29148:2018',
        '> **Note**: HIL tests exist as files but are NOT run in CI â€” real hardware required.',
        '',
    ]

    status_counts: dict = defaultdict(int)
    for it in items:
        status_counts[it.get('status', 'unknown')] += 1

    lines += ['## Summary', '', '| Status | Count |', '|---|---|']
    for status in sorted(status_counts):
        lines.append(f'| `{status}` | {status_counts[status]} |')
    lines += ['']

    # Unknown type items
    unknown_items = [it for it in items if it.get('status') == 'unknown_type']
    if unknown_items:
        lines += [
            '## UNKNOWN Type Items â€” Require Remediation',
            '',
            '> Each item below has an unrecognized type prefix. Fix by renaming the issue title',
            '> (add a recognized prefix) or by adding the correct `type:*` label.',
            '',
            '| Issue | Title | Labels | Recommended fix |',
            '|---|---|---|---|',
        ]
        for it in unknown_items:
            num = it['id']
            title = it['title'][:70].replace('|', '\\|')
            labs = ', '.join(it.get('labels', [])[:4])
            lines.append(
                f"| [{num}]({it['url']}) | {title} | `{labs}` |"
                ' Add recognized prefix (StR/REQ-F/REQ-NF/ADR/ARC-C/QA-SC/TEST/IMP/DOC/HOUSEKEEPING/EPIC/BUG) |'
            )
        lines += ['']

    # Main requirement matrix
    req_items = [it for it in items if it.get('type') in CANONICAL_REQUIREMENT_TYPES]
    lines += [
        '## Requirement Matrix (REQ-F / REQ-NF)',
        '',
        '| Issue | Type | Title | State | Capability | Confidence | Status |'
        ' @implements | @verifies | HIL tests | Gaps |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
    ]
    for it in req_items:
        num = it['id']
        typ = it.get('type', '?')
        title = it.get('title', '')[:55].replace('|', '\\|')
        state_icon = 'âœ…' if it.get('state') == 'closed' else 'ðŸ”µ'
        cap = f"`{it['capability']}`" if it.get('capability') else '-'
        conf = f"`{it['confidence']}`" if it.get('confidence') else '-'
        status = f"`{it.get('status', '?')}`"
        impl_n = len(it.get('implements', []))
        ver_n = len(it.get('verifies', []))
        hil_n = len(it.get('hilVerifies', []))
        gaps = '; '.join(it.get('gaps', [])) or '-'
        lines.append(
            f'| [{num}]({it["url"]}) | {typ} | {title} | {state_icon}'
            f' | {cap} | {conf} | {status} | {impl_n} | {ver_n} | {hil_n} | {gaps} |'
        )
    lines += ['']

    # Probe/HIL-blocked section
    blocked = [it for it in items if it.get('status') in ('probe_blocked', 'hil_blocked')]
    if blocked:
        lines += [
            '## Probe/HIL-Blocked Requirements',
            '',
            '> These requirements map to `probe_required` capabilities or need HIL evidence.',
            '> They cannot be fully verified in CI. Hardware validation is required.',
            '',
            '| Issue | Type | Title | Status | Capability |',
            '|---|---|---|---|---|',
        ]
        for it in blocked:
            cap = it.get('capability') or '-'
            lines.append(
                f"| [{it['id']}]({it['url']}) | {it.get('type','?')}"
                f" | {it.get('title','')[:60].replace('|', chr(92)+'|')} | `{it.get('status','?')}` | `{cap}` |"
            )
        lines += ['']

    # Architecture/Decision items
    arch_items = [it for it in items if it.get('type') in ('ADR', 'ARC-C', 'QA-SC', 'TEST', 'StR')]
    if arch_items:
        lines += [
            '## Architecture / Test / StR Items',
            '',
            '| Issue | Type | Title | State | Status |',
            '|---|---|---|---|---|',
        ]
        for it in arch_items:
            state_icon = 'âœ…' if it.get('state') == 'closed' else 'ðŸ”µ'
            lines.append(
                f"| [{it['id']}]({it['url']}) | {it.get('type','?')}"
                f" | {it.get('title','')[:60].replace('|', chr(92)+'|')} | {state_icon} | `{it.get('status','?')}` |"
            )
        lines += ['']

    # Orphan @implements
    if orphan_implements:
        lines += [
            '## Orphan @implements Annotations (no GitHub issue number)',
            '',
            '> Create a GitHub issue for each REQ-ID and back-fill `#N` in the annotation.',
            '',
            '| File | Line | REQ-ID |',
            '|---|---|---|',
        ]
        for ann in orphan_implements:
            lines.append(f"| `{ann['file']}` | {ann['line']} | `{ann['reqId']}` |")
        lines += ['']

    # Orphan @verifies
    if orphan_verifies:
        lines += [
            '## Orphan @verifies Annotations (no GitHub issue number)',
            '',
            '| File | Line | REQ-ID |',
            '|---|---|---|',
        ]
        for ann in orphan_verifies:
            lines.append(f"| `{ann['file']}` | {ann['line']} | `{ann['reqId']}` |")
        lines += ['']

    # Capabilities without traceability
    if caps_without_traceability:
        lines += [
            '## MCP Capabilities Without Requirement Traceability',
            '',
            '> Each MCP tool/resource should trace to at least one requirement.',
            '',
            '| Name | Kind | Reason |',
            '|---|---|---|',
        ]
        for cap in caps_without_traceability:
            lines.append(f"| `{cap['name']}` | {cap['kind']} | {cap['reason']} |")
        lines += ['']

    lines += [
        '---',
        '',
        '*Generated by `pnpm traceability` / `scripts/github-issues-to-traceability-json.py`*',
        '*HIL tests exist as source files but require real PreSonus hardware to execute.*',
        '',
    ]
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    token = os.environ.get('GITHUB_TOKEN')
    if not token:
        print('ERROR: GITHUB_TOKEN environment variable required', file=sys.stderr)
        print('Usage: GITHUB_TOKEN=ghp_xxx pnpm traceability', file=sys.stderr)
        return 1

    repo_name = os.environ.get('GITHUB_REPOSITORY', 'zarfld/presonus-studiolive-mcp')

    try:
        g = Github(token)
        repo = g.get_repo(repo_name)
    except Exception as exc:
        print(f'ERROR: Failed to connect to GitHub: {exc}', file=sys.stderr)
        return 1

    # â”€â”€ Local source annotation scan (no token needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print('Scanning source annotations (@implements, @verifies)...', flush=True)
    ann_by_issue, ann_by_req_id, orphan_implements, orphan_verifies = scan_source_annotations(ROOT)
    print(f'  Issues with annotations : {len(ann_by_issue)}')
    print(f'  REQ-IDs only (no #N)    : {len(ann_by_req_id)}')
    print(f'  Orphan @implements       : {len(orphan_implements)}')
    print(f'  Orphan @verifies         : {len(orphan_verifies)}')

    # â”€â”€ Capability inventory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print('Loading capability inventory...', flush=True)
    cap_inv = load_capability_inventory(ROOT)
    caps_without_traceability = sorted(cap_inv['missing'], key=lambda x: x['name'])
    print(f'  Capabilities without traceability: {len(caps_without_traceability)}')

    # â”€â”€ Fetch GitHub Issues â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    print(f'Fetching issues from {repo_name}...', flush=True)

    requirement_labels = [
        'type:stakeholder-requirement',
        'type:requirement:functional',
        'type:requirement:non-functional',
        'type:architecture:decision',
        'type:architecture:component',
        'type:architecture:quality-scenario',
        'type:test-case',
        'type:test-plan',
        'phase:01-stakeholder-requirements',
        'phase:02-requirements',
        'phase:03-architecture',
        'phase:04-design',
        'phase:05-implementation',
        'phase:07-verification-validation',
    ]

    all_issues = []
    seen_numbers: set = set()

    for label in requirement_labels:
        try:
            for issue in repo.get_issues(labels=[label], state='all'):
                if issue.number not in seen_numbers:
                    all_issues.append(issue)
                    seen_numbers.add(issue.number)
        except Exception as exc:
            print(f'  Warning: could not fetch label {label!r}: {exc}', file=sys.stderr)

    if not all_issues:
        print('  Warning: no labeled issues found; trying title-based detection...', file=sys.stderr)
        try:
            for issue in repo.get_issues(state='all'):
                if re.match(
                    r'^(StR|REQ-F|REQ-NF|ADR|ARC-C|QA-SC|TEST|IMP|DOC|HOUSEKEEPING|EPIC|BUG|PROBE)',
                    issue.title, re.IGNORECASE,
                ):
                    if issue.number not in seen_numbers:
                        all_issues.append(issue)
                        seen_numbers.add(issue.number)
        except Exception as exc:
            print(f'  Warning: could not fetch all issues: {exc}', file=sys.stderr)

    print(f'  Found {len(all_issues)} issues', flush=True)

    # â”€â”€ First pass: collect types for backward linkage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    issue_types: dict = {}
    for iss in all_issues:
        issue_types[f'#{iss.number}'] = get_requirement_type(
            iss.title, [l.name for l in iss.labels]
        )

    # â”€â”€ Build items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    items = []
    forward_links: dict = {}
    backward_links: dict = defaultdict(list)

    requirements = []
    requirements_with_adr: set = set()
    requirements_with_scenario: set = set()
    requirements_with_test: set = set()
    requirements_with_any_link: set = set()

    for issue in sorted(all_issues, key=lambda x: x.number):
        issue_id = f'#{issue.number}'
        labels = sorted(l.name for l in issue.labels)
        req_type = get_requirement_type(issue.title, labels)
        links = extract_issue_links(issue.body or '')

        # Source annotations: match by issue number
        ann = ann_by_issue.get(issue.number, {'implements': [], 'verifies': [], 'hilVerifies': []})

        # Also match by REQ-ID extracted from issue title (e.g. "REQ-F-ROUT-001: ...")
        req_id_m = re.match(r'^([A-Za-z][A-Za-z0-9_-]*?-\d{3}[a-z]?)', issue.title)
        req_id_from_title = req_id_m.group(1).upper() if req_id_m else None
        if req_id_from_title:
            extra = ann_by_req_id.get(req_id_from_title, {})
            for k in ('implements', 'verifies', 'hilVerifies'):
                seen_entries = {(e['file'], e['line']) for e in ann[k]}
                ann[k] = ann[k] + [e for e in extra.get(k, [])
                                    if (e['file'], e['line']) not in seen_entries]

        # Capability mapping: match by issue number, then by REQ-ID
        cap_list = (
            cap_inv['by_issue'].get(issue.number) or
            (cap_inv['by_req_id'].get(req_id_from_title) if req_id_from_title else None) or
            []
        )
        primary_cap = cap_list[0] if cap_list else None

        item = {
            'id': issue_id,
            'issue': issue.number,
            'type': req_type,
            'title': issue.title,
            'state': issue.state,
            'url': issue.html_url,
            'labels': labels,
            'references': sorted(
                {f'#{n}' for n in links['traces_to']},
                key=lambda x: int(x[1:]),
            ),
            'implements': sorted(ann['implements'], key=lambda e: (e['file'], e['line'])),
            'verifies': sorted(ann['verifies'], key=lambda e: (e['file'], e['line'])),
            'hilVerifies': sorted(ann['hilVerifies'], key=lambda e: (e['file'], e['line'])),
            'capability': primary_cap['name'] if primary_cap else None,
            'confidence': primary_cap['confidence'] if primary_cap else None,
            'hilRequired': primary_cap['hilRequired'] if primary_cap else False,
        }
        item['status'] = compute_status(item)
        item['gaps'] = compute_gaps(item)

        items.append(item)
        forward_links[issue_id] = item['references']
        for ref in item['references']:
            backward_links[ref].append(issue_id)

        # Metrics tracking
        if req_type in ('REQ-F', 'REQ-NF'):
            requirements.append(issue_id)
            if item['references']:
                requirements_with_any_link.add(issue_id)
            for ref_num in links['traces_to']:
                ref_id = f'#{ref_num}'
                ref_type = issue_types.get(ref_id, 'UNKNOWN')
                if ref_type in ('ADR', 'ARC-C'):
                    requirements_with_adr.add(issue_id)
                elif ref_type == 'QA-SC':
                    requirements_with_scenario.add(issue_id)
                elif ref_type == 'TEST':
                    requirements_with_test.add(issue_id)
        elif req_type in ('ADR', 'ARC-C', 'QA-SC', 'TEST'):
            for ref_num in links['traces_to']:
                ref_id = f'#{ref_num}'
                ref_type = issue_types.get(ref_id, 'UNKNOWN')
                if ref_type in ('REQ-F', 'REQ-NF'):
                    if req_type in ('ADR', 'ARC-C'):
                        requirements_with_adr.add(ref_id)
                    elif req_type == 'QA-SC':
                        requirements_with_scenario.add(ref_id)
                    elif req_type == 'TEST':
                        requirements_with_test.add(ref_id)

    # â”€â”€ Metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    total_reqs = len(requirements)
    metrics = {
        'requirement': {
            'coverage_pct': (len(requirements_with_any_link) / total_reqs * 100)
                            if total_reqs else 0.0,
            'total': total_reqs,
            'linked': len(requirements_with_any_link),
        }
    }
    if total_reqs > 0:
        metrics['requirement_to_ADR'] = {
            'coverage_pct': len(requirements_with_adr) / total_reqs * 100,
            'total': total_reqs, 'linked': len(requirements_with_adr),
        }
        metrics['requirement_to_scenario'] = {
            'coverage_pct': len(requirements_with_scenario) / total_reqs * 100,
            'total': total_reqs, 'linked': len(requirements_with_scenario),
        }
        metrics['requirement_to_test'] = {
            'coverage_pct': len(requirements_with_test) / total_reqs * 100,
            'total': total_reqs, 'linked': len(requirements_with_test),
        }

    # â”€â”€ Write ephemeral artifact (backward compat for validate-trace-coverage.py) â”€â”€
    ephemeral_output = {
        'source': 'github-issues',
        'repository': repo_name,
        'generated_at': __import__('datetime').datetime.utcnow().isoformat(),
        'metrics': metrics,
        'items': items,
        'forward_links': forward_links,
        'backward_links': {k: sorted(v) for k, v in backward_links.items()},
    }
    OUT_EPHEMERAL.parent.mkdir(exist_ok=True)
    OUT_EPHEMERAL.write_text(json.dumps(ephemeral_output, indent=2), encoding='utf-8')
    print(f'\nâœ… Wrote ephemeral artifact : {OUT_EPHEMERAL}')

    # â”€â”€ Write committed JSON (deterministic â€” no timestamps) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    committed_output = {
        'generatedBy': 'scripts/github-issues-to-traceability-json.py',
        'note': 'Auto-generated. Do not edit manually. Run `pnpm traceability` to regenerate.',
        'repository': repo_name,
        'metrics': metrics,
        'items': items,
        'orphanAnnotations': {
            'implements': sorted(orphan_implements, key=lambda x: (x['file'], x['line'])),
            'verifies':   sorted(orphan_verifies,   key=lambda x: (x['file'], x['line'])),
        },
        'capabilitiesWithoutTraceability': caps_without_traceability,
        'forward_links': forward_links,
        'backward_links': {k: sorted(v) for k, v in backward_links.items()},
    }
    TRACEABILITY_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(committed_output, indent=2), encoding='utf-8')
    print(f'âœ… Wrote committed JSON    : {OUT_JSON}')

    # â”€â”€ Write committed Markdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    md_content = generate_markdown(
        items=items,
        orphan_implements=orphan_implements,
        orphan_verifies=orphan_verifies,
        caps_without_traceability=caps_without_traceability,
        repo_name=repo_name,
    )
    OUT_MD.write_text(md_content, encoding='utf-8')
    print(f'âœ… Wrote committed Markdown: {OUT_MD}')

    # â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    unknown_items = [it for it in items if it.get('status') == 'unknown_type']
    stale = [it for it in items if it.get('status') == 'stale_closed_issue']
    print(f'\nSummary:')
    print(f'  Total items              : {len(items)}')
    print(f'  Requirements (REQ-F/NF)  : {total_reqs}')
    if total_reqs > 0:
        print(f'  Overall issue linkage    : {metrics["requirement"]["coverage_pct"]:.1f}%')
    print(f'  UNKNOWN type             : {len(unknown_items)}')
    print(f'  Stale closed issues      : {len(stale)}')
    print(f'  Orphan @implements       : {len(orphan_implements)}')
    print(f'  Orphan @verifies         : {len(orphan_verifies)}')
    print(f'  Capabilities w/o trace   : {len(caps_without_traceability)}')

    # Emit GitHub Actions warning annotations (non-blocking)
    if unknown_items:
        ids = ', '.join(it['id'] for it in unknown_items)
        print(f'::warning title=Unknown Issue Types::'
              f'{len(unknown_items)} issues have unrecognized type ({ids}). '
              f'See requirements-traceability.generated.md for remediation guidance.')
    if orphan_implements:
        print(f'::warning title=Orphan @implements::'
              f'{len(orphan_implements)} @implements annotations have no GitHub issue number. '
              f'See docs/issue-traceability-reconciliation.md.')
    if orphan_verifies:
        print(f'::warning title=Orphan @verifies::'
              f'{len(orphan_verifies)} @verifies annotations have no GitHub issue number.')
    if caps_without_traceability:
        names = ', '.join(c['name'] for c in caps_without_traceability[:5])
        extra = '...' if len(caps_without_traceability) > 5 else ''
        print(f'::warning title=Capabilities Without Traceability::'
              f'{len(caps_without_traceability)} MCP capabilities lack requirement traceability '
              f'({names}{extra}).')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())

