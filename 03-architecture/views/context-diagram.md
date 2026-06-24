# Architecture Context Diagram (C4 Level 1)

**Standard**: ISO/IEC/IEEE 42010:2011 — System Context View
**Phase**: 03-Architecture
**Status**: Baselined v0.1 — 2026-06-24
**Architecture Decisions**: #6 (ADR-001) #7 (ADR-002) #9 (ADR-004) #10 (ADR-005)
**Stakeholder Requirements**: #1 #2 #3 #4 #5

---

## System Context

This view shows the `presonus-studiolive-mcp` system in its operational environment, identifying all external actors and their relationships to the system.

```mermaid
C4Context
    title PreSonus StudioLive MCP Server — System Context

    Person(engineer, "Live Sound Engineer", "FOH operator. Prepares shows from riders, runs soundcheck, operates StudioLive 32SC. Uses AI assistant for diagnostics and planning.")

    System(mcp_server, "PreSonus StudioLive MCP Server", "Provides normalized mixer context to AI agents. Reads state from one or more StudioLive III mixers. Exposes MCP resources and safe analysis tools. Read-only by default.")

    System_Ext(ai_agent, "AI Agent (MCP Client)", "Claude Desktop, GitHub Copilot, or any MCP-compatible client. Reads resources, calls tools via Model Context Protocol (stdio transport).")

    System_Ext(foh_mixer, "StudioLive 32SC", "Primary FOH mixing console. 32 mic/line inputs, 16 mix buses, Fat Channel processing. Controlled via PreSonus protocol on TCP 53000. Meter data via UDP.")

    System_Ext(stagebox, "StudioLive 32R", "Stage rack / AVB stagebox. 32 mic/line inputs. Connected to 32SC via AVB for signal routing. Also controllable independently on TCP 53000.")

    System_Ext(uc_surface, "UC Surface / QMix-UC", "Official PreSonus remote control software (iPad/PC). Co-exists with the MCP server on the same mixer connection. Engineer operates the mixer here.")

    System_Ext(config_file, "presonus-mcp.config.yaml", "Local configuration file. Defines device aliases, expected serials, operation mode, and control policy. Never committed to version control.")

    Rel(engineer, ai_agent, "Asks diagnostic questions, reviews proposals", "Natural language")
    Rel(ai_agent, mcp_server, "Reads resources, calls analysis tools", "MCP protocol / stdio")
    Rel(mcp_server, foh_mixer, "Reads state via TCP; receives meters via UDP", "featherbear API / PreSonus protocol")
    Rel(mcp_server, stagebox, "Reads state via TCP; receives meters via UDP", "featherbear API / PreSonus protocol")
    Rel(mcp_server, config_file, "Reads on startup; resolves device aliases and policies", "YAML")
    Rel(uc_surface, foh_mixer, "Also controls mixer (co-existing client)", "PreSonus protocol")
    Rel(engineer, uc_surface, "Operates mixer directly during soundcheck and show", "Touch/UI")
```

---

## Key Constraints Visible at System Boundary

| Constraint | Direction | Detail |
|-----------|-----------|--------|
| Read-only default | MCP Server → Mixer | No write tools in default config (#10, #22) |
| Serial-based identity | MCP Server → Mixer | Device ID derived from serial, not IP (#16) |
| No autonomous mixing | AI Agent → MCP Server | Write tools not registered in MVP (#5, #10) |
| Co-existence | UC Surface ↔ Mixer | MCP server does not interfere with UC Surface |
| Local LAN only | All | No internet connectivity assumed; server not publicly exposed |
| stdio transport | AI Agent ↔ MCP Server | Server communicates via stdin/stdout; no HTTP binding in MVP |

---

## Bounded Context

The system operates within a single **Bounded Context**: the Live Event Audio Production domain.

Key domain terms used at this boundary (see `02-requirements/ubiquitous-language.md`):
- **FOH** — The role of the StudioLive 32SC
- **Stagebox** — The role of the StudioLive 32R
- **MixerIdentity** — How each device is identified by the system
- **OperationMode** — How the system constrains its behavior (prepare / soundcheck_assist / control_locked)
- **MCP Resource** — Read-only data exposed to the AI agent
- **MCP Tool** — Callable analysis action (never direct mixer control in MVP)
