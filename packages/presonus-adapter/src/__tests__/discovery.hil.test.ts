/**
 * Hardware-in-loop (HIL) tests for discoverMixers().
 *
 * Verifies: REQ-NF-001 (#21)
 *
 * These tests require a StudioLive III mixer on the local network.
 * They are EXCLUDED from the normal test suite (*.hil.test.ts pattern in vitest.config).
 * Run manually: pnpm vitest run --include "src/**/*.hil.test.ts"
 *
 * Acceptance criteria from #21:
 *   - 95th-percentile discovery time ≤ 5000 ms
 *   - Empty result when no mixer present, within timeoutMs ± 100 ms
 *   - Both 32SC and 32R appear as distinct devices when both present
 */
import { describe, it } from 'vitest'

describe('discoverMixers HIL — REQ-NF-001: discovery within timeoutMs', () => {
  it.todo('HARDWARE REQUIRED: At least one mixer discovered within 5000 ms (95th pct)')
  it.todo('HARDWARE REQUIRED: Both 32SC and 32R discovered with distinct deviceIds when both on network')
  it.todo('HARDWARE REQUIRED: discoverMixers({timeoutMs:2000}) resolves within 2100 ms')
  it.todo('HARDWARE REQUIRED: Result parses against MixerIdentity[] schema without errors')
})
