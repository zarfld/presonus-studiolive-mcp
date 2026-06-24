# Business Context

**Phase**: 01-Stakeholder-Requirements
**Standard**: ISO/IEC/IEEE 29148:2018
**Status**: Baselined v0.1 — 2026-06-24
**Stakeholder Requirements**: #1 #2 #3 #4 #5

---

## 1. Project Purpose

Build an **MCP (Model Context Protocol) server** that connects to one or more **PreSonus StudioLive III** digital mixing consoles on a local network and exposes their state as structured context to AI agents (Claude Desktop, GitHub Copilot, or any MCP-compatible client).

The system enables a live-sound engineer to use an AI assistant as a knowledgeable diagnostic partner during **show preparation** and **soundcheck** — without delegating autonomous control of the mixing console to that assistant.

---

## 2. Business Domain

**Domain**: Live event audio production  
**Sub-domains**:
- Mixer state visibility (channels, scenes, projects, routing)
- Pre-show preparation (rider analysis, patch planning)
- Soundcheck diagnostics (signal tracing, gain structure, channel identification)
- Multi-mixer routing validation (FOH console + stagebox)

**Primary hardware**:
- PreSonus **StudioLive 32SC** — FOH mixing console
- PreSonus **StudioLive 32R** — Stage rack / AVB stagebox

---

## 3. Stakeholders

| Stakeholder Class | Role | Key Concern |
|-------------------|------|-------------|
| Live Sound Engineer / FOH Operator | Primary user | Diagnostic speed and safety; no unexpected mixer changes |
| Production Manager | Show organiser | Reliable show preparation; rider compliance |
| System Owner (Developer) | Deployer | Security boundary; maintainability |
| AI Agent (Claude / Copilot) | MCP client | Accurate structured context; safe tool surface |

---

## 4. System Boundary

**In scope (MVP 1)**:
- Auto-discovery of StudioLive III mixers on local LAN
- Read-only mixer state: channels, mutes, faders, names, colors, current scene/project
- Meter data summarization (silent / active / hot / clipping classification)
- MCP resource exposure to AI agents via stdio transport
- Probe CLI for hardware reconnaissance and state key mapping

**In scope (MVP 2+)**:
- Show preparation from rider documents
- Routing validation between FOH and stagebox
- Proposed change sets (advisory, not executable)

**Out of scope (permanent)**:
- Autonomous live fader moves, mute changes, or scene recall by AI agents
- AVB/AVDECC deep stream validation
- PreSonus UC Surface replacement

---

## 5. Operating Context

```
Event venue local LAN
├── PreSonus StudioLive 32SC (FOH position, TCP 53000)
│   └── UC Surface also connected (co-existing client)
├── PreSonus StudioLive 32R (stage, AVB stagebox to 32SC)
├── Host machine running presonus-mcp server (Node.js 20+)
│   └── AI Agent (Claude Desktop / Copilot) via stdio MCP transport
└── Engineer at FOH position with iPad (QMix-UC)
```

**Network assumptions**:
- All devices on same local subnet (same VLAN or bridged)
- No internet connectivity assumed for mixer devices
- No public network exposure of the MCP server
- UC Surface and QMix-UC co-exist; MCP server is a passive read-only client by default

---

## 6. Key Constraints

| Constraint | Source | Impact |
|-----------|--------|--------|
| Read-only mode is the default | StR-5 (#5) | No write tools registered in default config |
| Mixer identity by serial, not IP | StR-1 (#1) | Discovery must extract serial from broadcast packets |
| No live mixing by AI agents | StR-5 (#5) | Change-set gate required for any future write tools |
| featherbear API v1.8.0 (pinned) | ADR-004 (#9) | Raw state keys empirically determined, not fully documented |
| Node.js ≥ 20 on MCP host | ADR-001 (#6) | Deployment constraint |

---

## 7. Success Criteria (Project-level)

1. `presonus-probe discover` finds 32SC and 32R on the local network within 5 seconds
2. MCP server exposes normalized channel list, meter summary, and current scene to an AI agent
3. AI agent correctly diagnoses "silent-but-expected" channels during soundcheck using MCP resources
4. No write operation is possible without explicit `controlEnabled: true` configuration
5. `pnpm build && pnpm test` passes in CI with zero hardware connected (fixture-based tests)

---

## 8. Traceability to Stakeholder Requirements

| Criterion | Issue | Phase |
|-----------|-------|-------|
| Multi-mixer discovery and state inventory | #1 | 01 |
| Show preparation from rider documents | #2 | 01 |
| Soundcheck assistance (read-only diagnostics) | #3 | 01 |
| Routing validation between FOH and stagebox | #4 | 01 |
| Safety: no autonomous live mixing | #5 | 01 |
