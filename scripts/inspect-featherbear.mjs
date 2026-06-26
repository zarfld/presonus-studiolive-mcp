import { readFileSync } from 'fs'
const lib = readFileSync(
  'node_modules/.pnpm/@featherbear+presonus-studiolive-api@1.8.0/node_modules/@featherbear/presonus-studiolive-api/dist/_internal.mjs',
  'utf8'
)
const lines = lib.split('\n')

// PS / string write patterns
const hits = lines
  .map((l, i) => ({ i, l }))
  .filter(({ l }) => /"PS"|ParamStr|setStr|sendStr|setName|setUser|username|PC|_sendPacket|setParam/i.test(l))

console.log('=== PS / string-write related lines ===')
hits.slice(0, 60).forEach(({ i, l }) => console.log(i, l.trim().slice(0, 140)))

// Show surrounding context for first PS line
const firstPS = lines.findIndex(l => l.includes('"PS"'))
console.log('\n=== Context around first "PS" occurrence ===')
lines.slice(Math.max(0, firstPS - 3), firstPS + 15).forEach((l, j) => console.log(firstPS - 3 + j, l.trim().slice(0, 140)))

// Check what setParam / setUserName looks like
const setParamIdx = lines.findIndex(l => /setParam|setUser|setValue|setName/i.test(l))
if (setParamIdx >= 0) {
  console.log('\n=== setParam context ===')
  lines.slice(setParamIdx - 2, setParamIdx + 10).forEach((l, j) => console.log(setParamIdx - 2 + j, l.trim().slice(0, 140)))
}
