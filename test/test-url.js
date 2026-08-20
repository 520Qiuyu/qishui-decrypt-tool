// Test soda-decrypt.js --url mode via child_process (no shell quoting issues)
const path = require('path')
const { execFileSync } = require('child_process')
const fs = require('fs')
const rec = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/_newest.json'), 'utf8'))
const url = rec.urls[0]
const spade = rec.spade
console.log('URL length:', url.length)
console.log('spade:', spade)
try {
  const out = execFileSync(
    process.execPath,
    [path.join(__dirname, '../soda-decrypt.js'), '--playauth', spade, '--url', url, '--out', path.join(__dirname, '../output/url-test2.m4a'), '--probe'],
    { encoding: 'utf8' },
  )
  console.log(out)
} catch (e) {
  console.error('FAIL:', e.message)
  process.exit(1)
}
