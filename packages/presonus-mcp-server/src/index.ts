/**
 * MCP Server entry point — PreSonus StudioLive MCP Server
 *
 * @module server-entry
 * @implements #22 REQ-NF-002: Zero write tools in default configuration
 * @implements #24 REQ-NF-004: MCP server operational within 3 s
 * @architecture #14 ARC-C-004: presonus-mcp-server package
 * @architecture #7 ADR-002: Three-layer architecture
 * @architecture #10 ADR-005: Read-only-first policy
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/14
 * @see https://github.com/zarfld/presonus-studiolive-mcp/issues/22
 */
import { createServer, type ServerConfig } from './server.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { DeviceConfig } from '@presonus-mcp/adapter'

async function main(): Promise<void> {
  // Read env vars so the server can be configured without code changes:
  //   PRESONUS_WRITE=1         → enable write tools (controlEnabled)
  //   PRESONUS_IP=<ip>         → fallback device IP (cross-subnet / VLAN)
  //   PRESONUS_SERIAL=<serial> → expected serial for the fallback device
  //   PRESONUS_MODE=prepare|soundcheck_assist|control_locked
  const writeEnabled = process.env.PRESONUS_WRITE === '1'
  const mode = (process.env.PRESONUS_MODE as ServerConfig['operationMode']) ?? 'soundcheck_assist'

  const fallbackDevices: DeviceConfig[] = []
  if (process.env.PRESONUS_IP) {
    const entry: DeviceConfig = {
      alias: 'env-device',
      fallbackIp: process.env.PRESONUS_IP,
      fallbackPort: process.env.PRESONUS_PORT ? Number(process.env.PRESONUS_PORT) : 53000,
      role: (process.env.PRESONUS_ROLE as DeviceConfig['role']) ?? 'FOH',
    }
    if (process.env.PRESONUS_SERIAL) entry.expectedSerial = process.env.PRESONUS_SERIAL
    fallbackDevices.push(entry)
  }

  const server = await createServer({
    operationMode: mode,
    controlEnabled: writeEnabled,
    discovery: { fallbackDevices },
  })
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Server now running — process stays alive via event loop
}

main().catch((err: unknown) => {
  console.error('Fatal error starting PreSonus MCP server:', err)
  process.exit(1)
})
