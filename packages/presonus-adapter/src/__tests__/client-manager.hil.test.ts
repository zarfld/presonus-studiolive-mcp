/**
 * Hardware-in-loop (HIL) tests for PresonusClientManager.
 *
 * Verifies: QA-SC-003 (#27), REQ-NF-004 (#24)
 *
 * These tests require a StudioLive III mixer on the local network.
 * They are EXCLUDED from the normal test suite (*.hil.test.ts pattern in .vitest.config).
 * Run manually: pnpm vitest run --include "src/**/*.hil.test.ts"
 *
 * Acceptance criteria from #27 / #24:
 *   - Mixer disconnect → server serves stale state (isStale: true)
 *   - Reconnect attempt within 10 s
 *   - State recovered after reconnect (isStale: false)
 */
import { describe, it } from 'vitest'

describe('PresonusClientManager HIL — QA-SC-003: survive disconnect and reconnect', () => {
  it.todo('HARDWARE REQUIRED: After mixer disconnect, snapshot.isStale becomes true within 2 s')
  it.todo('HARDWARE REQUIRED: Resources return _stale:true when mixer is disconnected')
  it.todo('HARDWARE REQUIRED: Reconnect attempt occurs within 10 s of disconnect')
  it.todo('HARDWARE REQUIRED: After reconnect, snapshot.isStale becomes false and state is fresh')
  it.todo('HARDWARE REQUIRED: applyChange() after reconnect works if writeEnabled=true')
})
