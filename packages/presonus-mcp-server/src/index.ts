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
import { createServer } from './server.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

async function main(): Promise<void> {
  const server = await createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Server now running — process stays alive via event loop
}

main().catch((err: unknown) => {
  console.error('Fatal error starting PreSonus MCP server:', err)
  process.exit(1)
})
