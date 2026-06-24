/**
 * `presonus-probe diff-state` command
 *
 * Compares two state dump files key-by-key and shows what changed.
 * Primary workflow: change one thing in UC Surface → dump-state → diff → name the key.
 *
 * @module diff-state-command
 * @implements #20 REQ-F-006: presonus-probe CLI state dump
 * @architecture #13 ARC-C-003: presonus-inspector probe CLI
 */
import type { Command } from 'commander'
import { readFile } from 'node:fs/promises'

export function registerDiffStateCommand(program: Command): void {
  program
    .command('diff-state')
    .description('Compare two state dump files and report added/removed/changed keys')
    .requiredOption('--before <file>', 'Before state dump JSON file')
    .requiredOption('--after <file>', 'After state dump JSON file')
    .action(async (opts: { before: string; after: string }) => {
      const beforeJson: unknown = JSON.parse(await readFile(opts.before, 'utf8'))
      const afterJson: unknown = JSON.parse(await readFile(opts.after, 'utf8'))

      // Support both raw state objects and our dump-state output format
      const before = (
        beforeJson !== null && typeof beforeJson === 'object' && 'state' in beforeJson
          ? (beforeJson as { state: Record<string, unknown> }).state
          : beforeJson
      ) as Record<string, unknown>

      const after = (
        afterJson !== null && typeof afterJson === 'object' && 'state' in afterJson
          ? (afterJson as { state: Record<string, unknown> }).state
          : afterJson
      ) as Record<string, unknown>

      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

      const added: string[] = []
      const removed: string[] = []
      const changed: Array<{ key: string; before: unknown; after: unknown }> = []

      for (const key of allKeys) {
        if (!(key in before)) {
          added.push(key)
        } else if (!(key in after)) {
          removed.push(key)
        } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
          changed.push({ key, before: before[key], after: after[key] })
        }
      }

      if (added.length === 0 && removed.length === 0 && changed.length === 0) {
        console.log('No differences found between the two state dumps.')
        return
      }

      if (changed.length > 0) {
        console.log(`\nChanged (${changed.length} key${changed.length !== 1 ? 's' : ''}):`)
        for (const c of changed.sort((a, b) => a.key.localeCompare(b.key))) {
          console.log(`  ~ ${c.key}`)
          console.log(`      before: ${JSON.stringify(c.before)}`)
          console.log(`      after:  ${JSON.stringify(c.after)}`)
        }
      }

      if (added.length > 0) {
        console.log(`\nAdded (${added.length} key${added.length !== 1 ? 's' : ''}):`)
        for (const k of added.sort()) {
          console.log(`  + ${k}: ${JSON.stringify(after[k])}`)
        }
      }

      if (removed.length > 0) {
        console.log(`\nRemoved (${removed.length} key${removed.length !== 1 ? 's' : ''}):`)
        for (const k of removed.sort()) {
          console.log(`  - ${k}`)
        }
      }

      console.log(`\nSummary: ${changed.length} changed, ${added.length} added, ${removed.length} removed`)
    })
}
