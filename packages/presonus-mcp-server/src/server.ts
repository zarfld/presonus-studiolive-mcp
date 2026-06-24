/**
 * MCP Server factory — creates and configures the McpServer instance.
 *
 * @module server
 * @implements #22 REQ-NF-002: Zero write tools in default configuration
 * @implements #24 REQ-NF-004: MCP server operational within 3 s
 * @architecture #14 ARC-C-004: presonus-mcp-server package
 * @architecture #10 ADR-005: Read-only-first policy
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PresonusClientManager, discoverMixers } from '@presonus-mcp/adapter'
import { registerResources } from './resources.js'
import { registerTools } from './tools.js'

export interface ServerConfig {
  operationMode?: 'prepare' | 'soundcheck_assist' | 'control_locked'
  controlEnabled?: boolean
  discovery?: {
    enabled?: boolean
    timeoutMs?: number
  }
}

export async function createServer(config: ServerConfig = {}): Promise<McpServer> {
  const { operationMode = 'soundcheck_assist', controlEnabled = false } = config

  const server = new McpServer({
    name: 'presonus-studiolive-mcp',
    version: '0.1.0',
  })

  const clientManager = new PresonusClientManager()

  // Determine write access: never in control_locked mode; requires explicit opt-in otherwise
  const writeEnabled = operationMode !== 'control_locked' && controlEnabled === true

  const modeLabel = operationMode
  const writeLabel = writeEnabled ? 'ENABLED (use with caution)' : 'DISABLED'
  process.stderr.write(
    `[presonus-mcp] Starting | Mode: ${modeLabel} | Write tools: ${writeLabel}\n`,
  )

  // Register resources (always available in all modes)
  registerResources(server, clientManager)

  // Register tools (write tools only when explicitly enabled — ADR-005 #10)
  registerTools(server, clientManager, { writeEnabled })

  // Start background discovery if enabled
  if (config.discovery?.enabled !== false) {
    const timeoutMs = config.discovery?.timeoutMs ?? 5000
    discoverMixers({ timeoutMs })
      .then(async (result) => {
        process.stderr.write(
          `[presonus-mcp] Discovery complete: ${result.devices.length} device(s) found\n`,
        )
        for (const device of result.devices) {
          await clientManager.connect(device).catch((err: unknown) => {
            process.stderr.write(
              `[presonus-mcp] Connect failed for ${device.deviceId}: ${String(err)}\n`,
            )
          })
        }
      })
      .catch((err: unknown) => {
        process.stderr.write(`[presonus-mcp] Discovery error: ${String(err)}\n`)
      })
  }

  return server
}
