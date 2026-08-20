// Final demo: PlayAuth + URL -> decrypted M4A, using the newest cached entry's data
// as if it were freshly provided.
const path = require('path')
const { execFileSync } = require('child_process')
const fs = require('fs')
const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/entries-with-keys.json'), 'utf8'))
idx.sort((a, b) => b.previousAccessTime - a.previousAccessTime)
const rec = idx[0]
const spade = rec.spade
const url = rec.urls[0]
console.log('=== 模拟用户输入 ===')
console.log('PlayAuth (spade_a):', spade)
console.log('音频链接:', url)
console.log()
try {
  const out = execFileSync(
    process.execPath,
    [path.join(__dirname, '../soda-decrypt.js'), '--playauth', spade, '--url', url, '--out', path.join(__dirname, '../output/demo_output.m4a'), '--probe'],
    { encoding: 'utf8' },
  )
  console.log(out)
} catch (e) {
  console.error('FAIL:', e.message)
  process.exit(1)
}
