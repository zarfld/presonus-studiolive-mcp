/**
 * @presonus-mcp/adapter — barrel export
 *
 * Implements: ARC-C-002 (#12)
 * ADR-002 (#7): Only domain types cross this package boundary, never raw featherbear types.
 */

export { discoverMixers, normalizeDiscoveredDevice, buildDeviceId } from './discovery.js'
export type { DiscoveryConfig, DiscoveryResult, DeviceConfig } from './discovery.js'

export {
  mapRawStateToSnapshot,
  extractLineChannels,
  extractMixerName,
  extractMixerSerial,
  flattenFeatherbearState,
  deriveCapabilities,
} from './state-mapper.js'
export type { MixerSnapshot } from './state-mapper.js'

export { PresonusMeterSummarizer } from './meter-summarizer.js'

export { PresonusClientManager } from './client-manager.js'
