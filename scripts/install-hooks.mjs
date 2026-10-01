#!/usr/bin/env node
/**
 * Install the privacy-guard pre-commit hook into .git/hooks/pre-commit.
 *
 * Run automatically via `pnpm prepare` (executed after every `pnpm install`).
 * Safe to run manually: node scripts/install-hooks.mjs
 *
 * The hook calls check-sensitive-staged.mjs --staged and aborts any commit
 * that introduces an unredacted mixer IP or serial number.
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const GIT_DIR = resolve(ROOT, '.git')

if (!existsSync(GIT_DIR)) {
  // Not a git repo (e.g. CI with shallow clone or npm publish artifact).
  process.exit(0)
}

const HOOKS_DIR = resolve(GIT_DIR, 'hooks')
mkdirSync(HOOKS_DIR, { recursive: true })

const HOOK_PATH = resolve(HOOKS_DIR, 'pre-commit')

// Convert the node executable path to a POSIX path usable inside Git Bash on Windows.
// e.g. C:\Program Files\nodejs\node.exe -> /c/Program Files/nodejs/node.exe
const nodePath = process.execPath
  .replace(/\\/g, '/')
  .replace(/^([A-Za-z]):/, (_, d) => '/' + d.toLowerCase())

// Thin wrapper: embeds the absolute node path so Git Bash on Windows can find it
// even when node is not on the sh PATH.
const HOOK_CONTENT = `#!/bin/sh
# Privacy guard — installed by scripts/install-hooks.mjs
# To bypass intentionally: git commit --no-verify
"${nodePath}" scripts/check-sensitive-staged.mjs --staged
`

writeFileSync(HOOK_PATH, HOOK_CONTENT, 'utf8')

try {
  chmodSync(HOOK_PATH, 0o755)
} catch {
  // Windows does not support chmod; the hook still runs via node directly.
}

console.log('pre-commit hook installed at .git/hooks/pre-commit')
