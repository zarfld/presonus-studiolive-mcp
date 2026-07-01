#!/usr/bin/env python3
"""Validate traceability matrix.

Checks both:
  1. reports/github-traceability.md — legacy markdown report (soft gate)
  2. 07-verification-validation/traceability/requirements-traceability.generated.json
     — committed artifact (hard gate for stale_closed_issue items)

Degrades gracefully when artifacts are missing (WARN, not FAIL).
"""
from __future__ import annotations
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPORTS = ROOT / 'reports'
MATRIX = REPORTS / 'github-traceability.md'
ORPHANS = REPORTS / 'orphan-check.log'
COMMITTED_JSON = (
    ROOT / '07-verification-validation' / 'traceability'
    / 'requirements-traceability.generated.json'
)

failures = []
warnings = []

WONTFIX_LABELS = frozenset({
    'wontfix', 'obsolete', 'duplicate', 'invalid',
    'status:wontfix', 'status:obsolete', 'status:duplicate',
})

# ── Check committed JSON (hard gate for stale_closed_issue) ──────────────────
if COMMITTED_JSON.exists():
    try:
        data = json.loads(COMMITTED_JSON.read_text(encoding='utf-8'))
        for item in data.get('items', []):
            if item.get('status') == 'stale_closed_issue':
                item_labels = frozenset(item.get('labels', []))
                if not (item_labels & WONTFIX_LABELS):
                    failures.append(
                        f"{item['id']} closed with no implementation/test evidence "
                        f"and not marked wontfix/obsolete: {item.get('title', '')}"
                    )
    except Exception as exc:
        warnings.append(f'Could not parse committed JSON: {exc}')
else:
    warnings.append(
        'Committed traceability artifact not found. '
        'Run `pnpm traceability` and commit '
        '07-verification-validation/traceability/*.generated.*'
    )

# ── Check legacy markdown report (soft gate) ─────────────────────────────────
if MATRIX.exists():
    try:
        for line in MATRIX.read_text(encoding='utf-8').splitlines():
            if not line.startswith('| REQ-'):
                continue
            parts = [p.strip() for p in line.strip('|').split('|')]
            if len(parts) >= 2 and parts[1] == '(none)':
                warnings.append(
                    f'Requirement {parts[0]} has no linked architecture/design/test elements.'
                )
    except Exception as exc:
        warnings.append(f'Could not parse traceability matrix: {exc}')

if ORPHANS.exists():
    try:
        orphans_text = ORPHANS.read_text(encoding='utf-8')
        if 'requirements_no_links' in orphans_text and re.search(
            r'requirements_no_links\n- REQ-', orphans_text
        ):
            warnings.append('Orphaned requirements detected — see orphan-check.log')
    except Exception:
        pass

# ── Report ────────────────────────────────────────────────────────────────────
for w in warnings:
    print(f'⚠️  {w}')

if failures:
    print('❌ Traceability validation failed:')
    for msg in failures:
        print(f'  - {msg}')
    sys.exit(1)

if warnings:
    print('⚠️  Traceability validation passed with warnings.')
else:
    print('✅ Traceability validation passed.')

