#!/usr/bin/env node
/**
 * Cross-platform Python script runner.
 *
 * Tries interpreters in this order: python3 → python → py
 *
 * - Linux/macOS CI: typically provides `python3`
 * - Windows (non-launcher): typically provides `python`
 * - Windows (Python Launcher): provides `py`
 *
 * Usage: node scripts/run-python-script.mjs <script.py> [args...]
 *
 * The script exits with the same exit code as the Python process.
 * If no interpreter is found, exits 1 with a diagnostic message.
 */
import { spawnSync } from 'node:child_process'
import { argv, exit } from 'node:process'

const CANDIDATES = ['python3', 'python', 'py']
const scriptArgs = argv.slice(2)

if (scriptArgs.length === 0) {
  process.stderr.write(
    'Usage: node scripts/run-python-script.mjs <script.py> [args...]\n',
  )
  exit(1)
}

for (const cmd of CANDIDATES) {
  // Pre-validate: check the interpreter actually runs before passing the script.
  // This filters out Windows Store Python stubs that return exit 9009 and
  // print "Python was not found" without actually executing anything.
  const versionCheck = spawnSync(cmd, ['--version'], { stdio: 'pipe', shell: false })
  if (versionCheck.error?.code === 'ENOENT' || versionCheck.status !== 0) {
    // Not found or stub — try the next candidate
    continue
  }

  const result = spawnSync(cmd, scriptArgs, { stdio: 'inherit', shell: false })

  if (result.error?.code === 'ENOENT') {
    continue
  }

  if (result.error) {
    process.stderr.write(
      `[run-python-script] ${cmd} errored unexpectedly: ${result.error.message}\n`,
    )
    continue
  }

  // Interpreter was found and launched — propagate its exit code
  exit(result.status ?? 1)
}

process.stderr.write(
  `[run-python-script] No Python interpreter found. Tried: ${CANDIDATES.join(', ')}\n`,
)
process.stderr.write(
  'Install Python 3 and add it to PATH, then run:\n' +
  '  pip install -r requirements-traceability.txt\n',
)
exit(1)
