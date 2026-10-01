# MCP E2E Acceptance Evidence — v0.1.0

## Summary

All steps of the documented v0.1 read-only workflow were exercised through a
real MCP client using the `@modelcontextprotocol/sdk` `StdioClientTransport`
over the actual stdio protocol. All steps PASS.

## Session details

| Field | Value |
|---|---|
| Date | 2026-10-01T17:03:13.671Z |
| Release candidate SHA | 38a02ad (plus lockfile fix → final SHA TBD after commit) |
| MCP client | `@modelcontextprotocol/sdk` `StdioClientTransport` (v1.30.1) |
| Node.js version | v24.19.0 |
| pnpm version | 9.15.9 |
| Server package | `@presonus-mcp/server` v0.1.0 |
| Server binary | `packages/presonus-mcp-server/dist/index.js` |
| Transport | stdio |
| Mixer model | StudioLive 32R |
| Mixer firmware | 3.4.0.111374 |
| Mixer serial (redacted) | `RA3E***0194` |
| Mixer IP | `<ip.hidden>` |
| `PRESONUS_WRITE` | **not set** — read-only test |

## Configuration path

The server was launched as a child process using:

```
node packages/presonus-mcp-server/dist/index.js
```

with environment variables:
- `PRESONUS_IP` — mixer IP address
- `PRESONUS_PORT` — 53000
- `PRESONUS_SERIAL` — expected serial for identity validation
- `PRESONUS_ROLE` — FOH
- `PRESONUS_WRITE` — **absent** (write tools not registered)

The client script (`packages/presonus-mcp-server/scripts/mcp-e2e-acceptance.mts`)
was run via `pnpm tsx` using the server package's module resolution, giving it
access to `@modelcontextprotocol/sdk`.

## Steps performed

| Step | Result | Evidence |
|---|---|---|
| Real client launches built server | **PASS** | Server log: `[presonus-mcp] Starting \| Mode: soundcheck_assist \| Write tools: DISABLED` |
| MCP handshake over stdio | **PASS** | `connect()` resolved without error |
| `tools/list` | **PASS** | 34 tools returned; all required tools present (see `tools-list.txt`) |
| resources discovery | **PASS** | 2 resources: `presonus://mixers`, `presonus://mixer-graph/current` |
| `discover_mixers` | **PASS** | UDP returned 0 (cross-subnet expected); configured fallback via `presonus://mixers` resource returned `serial:RA3E18030194`, IP `<ip.hidden>`, model `StudioLive 32R`, role `FOH`, `confidence=configured` |
| expected serial verified | **PASS** | `validate_mixer_identity` → `valid=true`, expected `RA3E***0194` |
| `refresh_mixer_state` | **PASS** | `capturedAt=2026-10-01T17:03:26.453Z`, `channelCount=32`, `success=true` |
| real channel state read | **PASS** | `line.ch1` → name=`Kick In`, mute=`true`, fader=`-29.95 dB` (via `presonus://mixer/{id}/channels` resource) |
| `get_mixer_capabilities` | **PASS** | 32 line inputs, 16 aux mixes, 4 subgroups, 4 FX buses, Fat Channel=true, AVB stagebox=true (see `mixer-capabilities.json`) |
| writes disabled by default | **PASS** | No write tools in `tools/list` — `PRESONUS_WRITE` absent; 0 of 34 registered tools are write-gated |
| no mixer mutation | **PASS** | Only read operations performed; no `prepare_*` or `apply_change_set` calls |
| clean shutdown | **PASS** | `client.close()` completed without error; server process exited cleanly |

## Required tools confirmed present

All of these appeared in `tools/list`:

- `discover_mixers` ✅
- `validate_mixer_identity` ✅
- `refresh_mixer_state` ✅
- `get_mixer_capabilities` ✅

Full list of 34 registered tools: see `tools-list.txt`.

## Representative channel state (line.ch1 "Kick In")

Observed via `presonus://mixer/{deviceId}/channels` resource:

```json
{
  "channelId": "line.ch1",
  "name": "Kick In",
  "mute": true,
  "faderDb": -29.95128173378984
}
```

## Mixer capabilities (StudioLive 32R)

From `get_mixer_capabilities`:

```json
{
  "deviceId": "serial:RA3E18030194",
  "model": "StudioLive 32R",
  "role": "FOH",
  "capabilities": {
    "lineInputs": 32,
    "auxMixes": 16,
    "subgroups": 4,
    "fxBuses": 4,
    "mainOutputs": true,
    "fatChannel": true,
    "avbStagebox": true
  }
}
```

This matches the previously observed capabilities from `hil-32r-smoke.txt`:
`lineInputs=32 auxMixes=16 subgroups=4 fxBuses=4 fatChannel=true avbStagebox=true`.

## Discovery note

UDP broadcast discovery returned 0 devices (different subnet — expected in this
environment). The server's configured fallback (`PRESONUS_IP` env var) connected
to the mixer at startup. Device identity was obtained via the `presonus://mixers`
resource, which lists background-connected devices. This is the documented fallback
behavior for cross-subnet deployments.

## Limitations

- The `get_mixer_capabilities` summary log showed `lineInputs=undefined` because
  the script read top-level fields; the actual JSON evidence has correct nested
  values under `capabilities.*` (see `mixer-capabilities.json`).
- UDP discovery not demonstrated (cross-subnet); configured fallback confirmed working.
- Write safety demonstrated by tool absence, not by attempting and receiving rejection.

## Files

| File | Contents |
|---|---|
| `README.md` | This document |
| `session-summary.txt` | Auto-generated step-by-step summary |
| `tools-list.txt` | All 34 tool names from `tools/list` |
| `resources-list.txt` | Available MCP resources |
| `discover-mixers.json` | `discover_mixers` response + fallback result |
| `validate-identity.json` | `validate_mixer_identity` response |
| `refresh-state.json` | `refresh_mixer_state` response |
| `channel-sample.json` | Representative channel read (line.ch1) |
| `mixer-capabilities.json` | `get_mixer_capabilities` response |
| `shutdown.txt` | Shutdown timestamp |
