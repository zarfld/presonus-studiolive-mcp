/**
 * CLI utility functions for presonus-inspector.
 *
 * @module cli-utils
 * @architecture #13 ARC-C-003: presonus-inspector probe CLI
 */

/**
 * Format a Date as YYYY-MM-DD for use in output directory names.
 * Example: 2026-06-24
 */
export function formatISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}
