import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type CheckResult = {
  ok: boolean
  message: string
}

function readText(relativePath: string): string {
  return readFileSync(resolve(relativePath), 'utf8')
}

function lineCount(text: string): number {
  return text.split(/\r?\n/).length
}

const checks: CheckResult[] = []

const agents = readText('AGENTS.md')
const copilotInstructions = readText('.github/copilot-instructions.md')
const fatChannelSkill = readText('.github/Skills/presonus-fat-channel-selection/SKILL.md')

checks.push({
  ok: lineCount(agents) < 140,
  message: `AGENTS.md must stay under 140 lines (current: ${lineCount(agents)})`,
})

checks.push({
  ok: lineCount(copilotInstructions) < 120,
  message: `.github/copilot-instructions.md must stay under 120 lines (current: ${lineCount(copilotInstructions)})`,
})

checks.push({
  ok: !fatChannelSkill.includes('No write tools currently exist'),
  message: 'Fat Channel skill must not contain the stale "No write tools currently exist" wording',
})

const failures = checks.filter((check) => !check.ok)

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure.message}`)
  }
  process.exit(1)
}

for (const check of checks) {
  console.log(`PASS: ${check.message}`)
}