/**
 * @presonus-mcp/domain — barrel export
 *
 * Implements: ARC-C-001 (#11)
 * Single source of truth for all normalized PreSonus MCP domain types.
 */

export * from './schemas/mixer.js'
export * from './schemas/channel.js'
export * from './schemas/metering.js'
export * from './schemas/fat-channel.js'  // includes decode*Model, decode*ModelFromClassid, *_BY_INDEX, *_BY_CLASSID, ChannelFatStateSchema, normalized*() helpers
export * from './schemas/routing.js'
export * from './schemas/show.js'
export * from './schemas/write.js'  // ProposedChangeSet, AppliedChange, ChangeParameter
