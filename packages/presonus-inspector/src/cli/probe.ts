#!/usr/bin/env node
/**
 * presonus-probe — hardware reconnaissance CLI.
 *
 * Implements: ARC-C-003 (#13)
 * Satisfies: REQ-F-006 (#20)
 *
 * Usage:
 *   presonus-probe discover [--timeout 5000] [--json]
 *   presonus-probe dump-state --device <serial|ip> [--out <file>]
 *   presonus-probe watch-events --device <serial|ip> --seconds <N>
 *   presonus-probe watch-meters --device <serial|ip> --seconds <N>
 *   presonus-probe diff-state --before <file> --after <file>
 *   presonus-probe probe-fat-channel --device <serial|ip> --channel LINE:1
 *   presonus-probe probe-live-events --device <ip> --duration <ms> --filter <keys>
 *   presonus-probe probe-raw-socket --device <ip> --duration <ms> --filter <keys>
 *   presonus-probe probe-fat-write-echo --device <ip> --channel <ch> --key <param> [--dry-run]
 *   presonus-probe probe-fat-guided-calibration --device <ip> --channel <ch> --key <param> --points 0,0.25,0.5,0.75,1
 */
import { Command } from 'commander'
import { registerDiscoverCommand } from './commands/discover.js'
import { registerDumpStateCommand } from './commands/dump-state.js'
import { registerWatchEventsCommand } from './commands/watch-events.js'
import { registerWatchMetersCommand } from './commands/watch-meters.js'
import { registerDiffStateCommand } from './commands/diff-state.js'
import { registerProbeFatChannelCommand } from './commands/probe-fat-channel.js'
import { registerReadSceneCommand } from './commands/read-scene.js'
import { registerProbeRoutingCommand } from './commands/probe-routing.js'
import { registerProbeLiveEventsCommand } from './commands/probe-live-events.js'
import { registerProbeRawSocketCommand } from './commands/probe-raw-socket.js'
import { registerProbeFatWriteEchoCommand } from './commands/probe-fat-write-echo.js'
import { registerProbeFatGuidedCalibrationCommand } from './commands/probe-fat-guided-calibration.js'

const program = new Command()

program
  .name('presonus-probe')
  .description('PreSonus StudioLive hardware reconnaissance tool')
  .version('0.1.0')

registerDiscoverCommand(program)
registerDumpStateCommand(program)
registerWatchEventsCommand(program)
registerWatchMetersCommand(program)
registerDiffStateCommand(program)
registerProbeFatChannelCommand(program)
registerReadSceneCommand(program)
registerProbeRoutingCommand(program)
registerProbeLiveEventsCommand(program)
registerProbeRawSocketCommand(program)
registerProbeFatWriteEchoCommand(program)
registerProbeFatGuidedCalibrationCommand(program)

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
